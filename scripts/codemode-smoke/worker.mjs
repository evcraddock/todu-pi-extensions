import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { blockedRead, negativeReads, structuredReads } from "./cases.mjs";
import { approval, fixtureTasks, startFixtureDaemon } from "./daemon-fixture.mjs";
import { assertSmokeEnvironment, smokePaths, supportsPiVersion } from "./isolation.mjs";

/** Parse only codemode's single JSON output item, never a task's human-facing text. */
function scriptValue(result) {
  assert.equal(result.isError, false, "Codemode script failed");
  assert.equal(result.content.length, 2, "Expected one script output plus its status header");
  assert(result.content[0].text.startsWith("Script completed"));
  return JSON.parse(result.content[1].text);
}

/** Check hook/execution/transcript correlation through Pi's actual nested-call pipeline. */
function assertCorrelation({ harness, parentId, expectedCount, blocked = false }) {
  const calls = harness.events.filter(
    (event) => event.phase === "call" && event.parentToolCallId === parentId
  );
  assert.equal(calls.length, expectedCount);
  for (const call of calls) {
    assert(call.toolCallId.startsWith(parentId + "/"));
    const end = harness.events.find(
      (event) => event.type === "tool_execution_end" && event.toolCallId === call.toolCallId
    );
    assert.equal(end?.parentToolCallId, parentId);
    if (!blocked) {
      assert(
        harness.events.some(
          (event) =>
            event.phase === "result" &&
            event.toolCallId === call.toolCallId &&
            event.parentToolCallId === parentId
        ),
        "Nested tool_result hook was not traversed"
      );
    } else {
      assert.equal(end?.isError, true);
    }
    assert(
      !harness.session.messages.some(
        (message) => message.role === "toolResult" && message.toolCallId === call.toolCallId
      ),
      "Nested results must not become standalone transcript entries"
    );
  }
  const parent = harness.session.messages.find(
    (message) => message.role === "toolResult" && message.toolCallId === parentId
  );
  assert.equal(parent?.nestedCalls?.complete, true);
  assert.deepEqual(
    parent.nestedCalls.calls.map((call) => call.id).sort(),
    calls.map((call) => call.toolCallId).sort()
  );
  if (blocked) assert.equal(parent.nestedCalls.calls[0].status, "error");
}

/** Assert overlapping execution events, not timing/performance claims. */
function assertParallelReads(harness, parentId) {
  const running = new Set();
  let peak = 0;
  for (const event of harness.events.filter((event) => event.parentToolCallId === parentId)) {
    if (event.type === "tool_execution_start") running.add(event.toolCallId);
    if (event.type === "tool_execution_end") running.delete(event.toolCallId);
    peak = Math.max(peak, running.size);
  }
  assert(peak >= 2, "Expected parallel nested read dispatch");
  assert.equal(running.size, 0);
}

async function run() {
  // Guard before importing Pi or the packaged extension, which can initialize services.
  const root = process.argv[2];
  assertSmokeEnvironment(root, process.env);
  const paths = smokePaths(root);
  const piEntry = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
  const piPackage = JSON.parse(
    await readFile(path.join(path.dirname(piEntry), "../package.json"), "utf8")
  );
  assert(supportsPiVersion(piPackage.version), "Smoke requires stable Pi >=1.1.0 within 1.x");
  const { Value } = await import("typebox/value");
  const { TaskListOutputSchema, TaskShowOutputSchema } =
    await import("../../dist/tools/task-read-schemas.js");
  const check = (schema, output) => {
    assert(Value.Check(schema, output), "Task output did not match its packaged schema");
    assert.equal(output.tool, schema === TaskListOutputSchema ? "task_list" : "task_show");
    assert.deepEqual(JSON.parse(JSON.stringify(output)), output);
    assert(
      !JSON.stringify(output).includes("SMOKE_PRIVATE_DIAGNOSTIC"),
      "Private fixture diagnostics leaked"
    );
  };
  const pass = (label) => process.stdout.write(`PASS ${label}\n`);
  const daemon = await startFixtureDaemon(paths.socket);
  let harness;
  try {
    const { createFixtureSession } = await import("./session-fixture.mjs");
    harness = await createFixtureSession(paths);
    const listed = await harness.call("task_list", { statuses: ["active"], timezone: "UTC" });
    assert.equal(listed.isError, false, "Direct list failed: " + JSON.stringify(listed.content));
    check(TaskListOutputSchema, listed.structuredContent);
    assert.equal(listed.structuredContent.status, "success");
    assert.deepEqual(
      listed.structuredContent.data.tasks.map((task) => task.id),
      ["task-late", "task-undated"]
    );
    assert.deepEqual(listed.details.tasks, listed.structuredContent.data.tasks);
    assert.equal(listed.details.kind, "task_list");
    assert(listed.content[0].text.includes("Tasks (2):"));
    assert(listed.content[0].text.includes("due: 2026-03-20"));
    assert.equal(listed.structuredContent.data.tasks[1].dueDate, null);
    assert(
      harness.events.some(
        (event) =>
          event.phase === "call" &&
          event.toolCallId === listed.id &&
          event.parentToolCallId === undefined
      )
    );
    pass("direct task_list: structured schema/JSON, readable text and compatible details");

    const shown = await harness.call("task_show", { taskId: "task-early" });
    assert.equal(shown.isError, false);
    check(TaskShowOutputSchema, shown.structuredContent);
    assert.equal(shown.details.kind, "task_show");
    assert(shown.content[0].text.includes("Description:"));
    assert.deepEqual(shown.structuredContent.data.task.descriptionApproval, approval);
    assert.deepEqual(shown.structuredContent.data.task.comments[0].contentApproval, approval);
    assert.equal(shown.structuredContent.data.task.comments[0].authorActorId, "actor-smoke");
    assert.equal(
      shown.structuredContent.data.task.outboundAssigneeWarnings[0].bindingId,
      "ibind-smoke"
    );
    assert(
      shown.structuredContent.warnings.some((warning) => warning.code === "smoke_result_hook")
    );
    pass("direct task_show: approval/provenance, outbound warnings and result-hook transformation");

    const negativeCases = [
      ["task_list", { projectId: "proj-missing", timezone: "UTC" }, "empty", false],
      ["task_show", { taskId: "task-missing" }, "not_found", false],
      ["task_list", { projectId: "proj-backend-error", timezone: "UTC" }, "backend_error", true],
      ["task_show", { taskId: "task-backend-error" }, "backend_error", true],
      ["task_show", { taskId: " " }, "validation_error", true],
    ];
    for (const [name, args, status, isError] of negativeCases) {
      const result = await harness.call(name, args);
      check(
        name === "task_list" ? TaskListOutputSchema : TaskShowOutputSchema,
        result.structuredContent
      );
      assert.equal(result.structuredContent.status, status);
      assert.equal(result.isError, isError);
      assert(!JSON.stringify(result).includes("SMOKE_PRIVATE_DIAGNOSTIC"));
      if (status === "empty") {
        assert.deepEqual(result.structuredContent.data.tasks, []);
        assert.equal(result.structuredContent.data.total, 0);
        assert.equal(result.structuredContent.data.empty, true);
      }
      if (status === "not_found") {
        assert.equal(result.details.found, false);
        assert.deepEqual(result.structuredContent.target, {
          entityType: "task",
          entityId: "task-missing",
        });
      }
    }
    pass("direct empty/not-found/backend/validation outcomes stay distinct and safe");

    const reads = await harness.call("codemode", { code: structuredReads });
    const values = scriptValue(reads);
    for (const list of values.lists) check(TaskListOutputSchema, list);
    check(TaskShowOutputSchema, values.detail);
    check(TaskShowOutputSchema, values.offset);
    assert.deepEqual(values.ids, ["task-early", "task-late", "task-undated"]);
    assert.deepEqual(values.lists[2].data.filter, {
      statuses: ["active", "waiting"],
      query: "Fixture",
      label: "fixture",
      timezone: "UTC",
    });
    assert.deepEqual(values.detail.data.task.descriptionApproval, approval);
    assert.deepEqual(values.detail.data.task.comments[0].contentApproval, approval);
    assert.deepEqual(
      values.detail.data.task.outboundAssigneeWarnings,
      shown.structuredContent.data.task.outboundAssigneeWarnings
    );
    assert(values.detail.warnings.some((warning) => warning.code === "smoke_result_hook"));
    const offset = fixtureTasks.find((task) => task.id === "task-offset");
    for (const key of ["dueDate", "scheduledDate", "createdAt", "updatedAt"])
      assert.equal(values.offset.data.task[key], offset[key]);
    assertCorrelation({ harness, parentId: reads.id, expectedCount: 5 });
    assertParallelReads(harness, reads.id);
    pass(
      "real QuickJS codemode: parallel reads, filtering/merge/dedup/date-sort, exact date values and metadata"
    );
    pass("nested call/result hooks, parent IDs and bounded transcript correlation");

    const negatives = await harness.call("codemode", { code: negativeReads });
    const results = scriptValue(negatives);
    results.forEach((result, index) => {
      check(index === 0 || index === 2 ? TaskListOutputSchema : TaskShowOutputSchema, result);
      assert.equal(result.status, negativeCases[index][2]);
      assert.equal(result.ok, index === 0);
    });
    assertCorrelation({ harness, parentId: negatives.id, expectedCount: 5 });
    pass("codemode resolves typed failure envelopes; fulfillment is not operation success");

    const before = daemon.calls.length;
    const blocked = await harness.call("codemode", { code: blockedRead });
    const denied = scriptValue(blocked);
    assert.equal(denied.rejected, true);
    assert(denied.reason.includes(harness.blockedReason));
    assert.equal(daemon.calls.length, before, "Blocked read reached the fixture daemon");
    assertCorrelation({ harness, parentId: blocked.id, expectedCount: 1, blocked: true });
    pass("nested blocked read rejects before backend dispatch and retains parent-call correlation");

    assert(
      daemon.calls.some((call) => call.method === "daemon.hello"),
      "Packaged client never used the fixture socket"
    );
    assert(
      daemon.calls.some((call) => call.method === "task.search"),
      "Search filtering was not exercised"
    );
  } finally {
    try {
      if (harness) await harness.close();
    } finally {
      await daemon.stop();
    }
  }
  process.stdout.write(
    `Compatibility smoke PASS: Pi ${piPackage.version}; Node ${process.version}; platform ${process.platform}; packaged dist/index.js; local fixtures only; no provider credentials or external network required.\n`
  );
}

await run().catch((error) => {
  // All runtime inputs/state are synthetic and isolated; do not emit stacks or ambient diagnostics.
  process.stderr.write(
    `Fixture compatibility check failed: ${error instanceof Error ? error.message : "Unknown fixture failure"}\n`
  );
  process.exitCode = 1;
});
