import assert from "node:assert/strict";
import path from "node:path";
import { createAssistantMessageEventStream, InMemoryCredentialStore } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  createCodemodeExtension,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

import packagedExtension from "../../dist/index.js";
import { resetDefaultToduTaskServiceRuntime } from "../../dist/services/todu/default-task-service.js";
import { resetDefaultCurrentTaskContextController } from "../../dist/extension/current-task-context.js";
import { resetDefaultTaskBrowseFilterContextController } from "../../dist/extension/task-browse-filter-context.js";

const allowedTools = ["task_list", "task_show", "codemode"];
const blockedReason = "Smoke policy blocked the fixture read";

/** Local scripted provider: emits model tool-call events, never calls a network service. */
function createDriver() {
  let pending;
  let counter = 0;
  return {
    enqueue(name, args) {
      assert(allowedTools.includes(name), "Driver only emits smoke read/codemode calls");
      assert.equal(pending, undefined, "Previous scripted call was not consumed");
      pending = { type: "toolCall", id: `smoke-${++counter}`, name, arguments: args };
      return pending.id;
    },
    streamSimple(model, _context, options) {
      const stream = createAssistantMessageEventStream();
      const call = pending;
      pending = undefined;
      const message = {
        role: "assistant",
        api: model.api,
        provider: model.provider,
        model: model.id,
        content: [],
        stopReason: "pending",
        timestamp: Date.now(),
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      globalThis.queueMicrotask(() => {
        stream.push({ type: "start", partial: message });
        if (options?.signal?.aborted) {
          message.stopReason = "aborted";
          message.errorMessage = "Smoke driver aborted";
          stream.push({ type: "error", reason: "aborted", error: message });
        } else if (call) {
          message.content.push({ ...call, arguments: {} });
          stream.push({ type: "toolcall_start", contentIndex: 0, partial: message });
          stream.push({
            type: "toolcall_delta",
            contentIndex: 0,
            delta: JSON.stringify(call.arguments),
            partial: message,
          });
          message.content[0] = call;
          stream.push({ type: "toolcall_end", contentIndex: 0, toolCall: call, partial: message });
          message.stopReason = "toolUse";
          stream.push({ type: "done", reason: "toolUse", message });
        } else {
          message.content.push({ type: "text", text: "" });
          stream.push({ type: "text_start", contentIndex: 0, partial: message });
          message.content[0].text = "Smoke call completed";
          stream.push({
            type: "text_delta",
            contentIndex: 0,
            delta: "Smoke call completed",
            partial: message,
          });
          stream.push({
            type: "text_end",
            contentIndex: 0,
            content: "Smoke call completed",
            partial: message,
          });
          message.stopReason = "stop";
          stream.push({ type: "done", reason: "stop", message });
        }
        stream.end();
      });
      return stream;
    },
  };
}

/** Load the native ESM dist factory and real codemode extension through documented SDK boundaries. */
export async function createFixtureSession(paths) {
  const driver = createDriver();
  const events = [];
  const settingsManager = SettingsManager.inMemory({
    defaultTools: allowedTools,
    compaction: { enabled: false },
    retry: { enabled: false },
    cacheWarming: "off",
    enableInstallTelemetry: false,
    enableAnalytics: false,
  });
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    modelsStorePath: path.join(paths.cache, "models.json"),
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  modelRuntime.registerProvider("smoke-fixture", {
    api: "smoke-fixture",
    apiKey: "non-secret-local-fixture",
    baseUrl: "http://smoke.invalid",
    models: [
      {
        id: "driver",
        name: "Deterministic smoke driver",
        reasoning: false,
        input: ["text"],
        contextWindow: 1000000,
        maxTokens: 8192,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
    streamSimple: driver.streamSimple,
  });
  const observer = (pi) => {
    pi.on("tool_call", (event) => {
      events.push({ ...globalThis.structuredClone(event), phase: "call" });
      if (!allowedTools.includes(event.toolName))
        return { block: true, reason: "Smoke permits only fixture reads" };
      if (event.toolName === "task_show" && event.input.taskId === "task-blocked")
        return { block: true, reason: blockedReason };
    });
    pi.on("tool_result", (event) => {
      events.push({ ...globalThis.structuredClone(event), phase: "result" });
      if (
        event.toolName === "task_show" &&
        event.input.taskId === "task-early" &&
        event.structuredContent?.ok
      ) {
        const structuredContent = globalThis.structuredClone(event.structuredContent);
        structuredContent.warnings.push({
          code: "smoke_result_hook",
          message: "Fixture result hook traversed",
        });
        return { structuredContent };
      }
    });
  };
  const loader = new DefaultResourceLoader({
    cwd: paths.work,
    agentDir: paths.agent,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "Deterministic compatibility smoke. Only fixture task reads are permitted.",
    extensionFactories: [packagedExtension, createCodemodeExtension({ models: false }), observer],
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, [], "SDK extension loading failed");
  assert.equal(loader.getExtensions().extensions.length, 3, "Unexpected discovered extension");
  assert.deepEqual(loader.getAgentsFiles().agentsFiles, []);
  const model = modelRuntime.getModel("smoke-fixture", "driver");
  assert(model, "Local fixture model did not register; do not fall back to another provider");
  const { session } = await createAgentSession({
    cwd: paths.work,
    agentDir: paths.agent,
    resourceLoader: loader,
    settingsManager,
    modelRuntime,
    model,
    thinkingLevel: "off",
    tools: allowedTools,
    sessionManager: SessionManager.inMemory(paths.work),
  });
  const unsubscribe = session.subscribe((event) => {
    if (event.type.startsWith("tool_execution_"))
      events.push({ ...globalThis.structuredClone(event), phase: "execution" });
  });
  const harness = {
    events,
    session,
    blockedReason,
    async call(name, args) {
      const id = driver.enqueue(name, args);
      await session.prompt(`Run fixture compatibility case ${id}`);
      const end = events.find(
        (event) => event.type === "tool_execution_end" && event.toolCallId === id
      );
      assert(end, `No execution result for ${name}; inspect fixture model lifecycle`);
      return { id, ...end.result, isError: end.isError };
    },
    async close() {
      try {
        const aborted = await Promise.allSettled([session.abort()]);
        const controllers = await Promise.allSettled([
          resetDefaultCurrentTaskContextController(),
          resetDefaultTaskBrowseFilterContextController(),
        ]);
        const runtime = await Promise.allSettled([resetDefaultToduTaskServiceRuntime()]);
        assert(
          [...aborted, ...controllers, ...runtime].every((result) => result.status === "fulfilled"),
          "Fixture session teardown failed"
        );
      } finally {
        unsubscribe();
        session.dispose();
      }
    },
  };
  try {
    await session.bindExtensions({});
    assert.deepEqual([...session.getActiveToolNames()].sort(), [...allowedTools].sort());
    return harness;
  } catch (error) {
    await harness.close();
    throw error;
  }
}
