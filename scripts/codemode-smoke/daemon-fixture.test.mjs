import { describe, expect, it } from "vitest";

import { fixtureResponse, fixtureTasks } from "./daemon-fixture.mjs";

describe("codemode smoke RPC fixtures (pure unit tests, no server)", () => {
  it("uses the actual string-valued handshake protocol and read-only capability catalog", () => {
    const hello = fixtureResponse("daemon.hello").result;
    expect(hello.protocolVersion).toBe("1");
    expect(hello.capabilities.methods).toContain("integration.list");
    expect(hello.capabilities.methods).not.toContain("task.update");
  });

  it("keeps missing tasks distinct from injected backend failures", () => {
    expect(fixtureResponse("task.get", { id: "task-missing" }).error.code).toBe("NOT_FOUND");
    expect(fixtureResponse("task.get", { id: "task-backend-error" }).error.code).toBe(
      "INTERNAL_ERROR"
    );
    expect(
      fixtureResponse("task.list", { filter: { projectId: "proj-backend-error" } }).error.code
    ).toBe("INTERNAL_ERROR");
  });

  it("supplies a real blocked target so hook enforcement cannot pass by finding it absent", () => {
    expect(fixtureResponse("task.get", { id: "task-blocked" }).result.id).toBe("task-blocked");
  });

  it("supports deterministic search and imported content fixtures", () => {
    expect(
      fixtureResponse("task.search", { query: "task-early" }).result.map((task) => task.id)
    ).toEqual(["task-early"]);
    expect(
      fixtureResponse("note.list", { filter: { entityId: "task-early" } }).result[0].contentApproval
        .state
    ).toBe("pendingApproval");
    expect(fixtureResponse("integration.list").result[0].options.actorMappings).toEqual([]);
  });

  it.each(["task.create", "task.update", "task.delete", "integration.update"])(
    "rejects a mutation name in the pure dispatcher: %s",
    (method) => {
      const before = globalThis.structuredClone(fixtureTasks);
      expect(fixtureResponse(method).error.code).toBe("METHOD_NOT_FOUND");
      expect(fixtureTasks).toEqual(before);
    }
  );
});
