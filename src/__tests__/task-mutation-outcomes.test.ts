import { describe, expect, it, vi } from "vitest";

import type { TaskDetail, TaskEnrichmentSource } from "@/domain/task";
import { createToduDaemonClient, type ToduProjectSummary } from "@/services/todu/daemon-client";
import type { ToduDaemonConnectionError } from "@/services/todu/daemon-connection";
import { createToduTaskService } from "@/services/todu/todu-task-service";
import {
  createTaskCreateToolDefinition,
  createTaskMoveToolDefinition,
  createTaskUpdateToolDefinition,
} from "@/tools/task-mutation-tools";
import { createTaskDetailViewModel } from "@/ui/components/task-detail";

const rawTask = {
  id: "task-confirmed",
  title: "Confirmed write",
  status: "active",
  priority: "medium",
  projectId: "proj-1",
  labels: ["keep"],
  assigneeActorIds: ["actor-1"],
  assignees: ["Legacy name"],
  description: "Keep description",
  descriptionApproval: { state: "pendingApproval", sourceBindingId: "binding-1" },
  createdAt: "2026-03-19T00:00:00.000Z",
  updatedAt: "2026-03-19T00:00:00.000Z",
};
const project: ToduProjectSummary = {
  description: null,
  id: "proj-1",
  name: "Project",
  status: "active",
  priority: "medium",
  authorizedAssigneeActorIds: ["actor-1"],
};
const note = {
  id: "note-1",
  entityId: rawTask.id,
  content: "Keep comment",
  authorActorId: "actor-1",
  author: "Legacy author",
  createdAt: rawTask.createdAt,
  contentApproval: { state: "pendingApproval", sourceBindingId: "binding-1" },
};
const methods = ["task.create", "task.update", "task.move"] as const;
type MutationMethod = (typeof methods)[number];

const setup = (failure?: string, thrown = false) => {
  const request = vi.fn(async (method: string) => {
    if (method === failure) {
      if (thrown) throw new Error("private transport detail");
      return { ok: false, error: { code: "INTERNAL_ERROR", message: "private backend detail" } };
    }
    if (methods.includes(method as MutationMethod)) return { ok: true, value: rawTask };
    switch (method) {
      case "note.list":
        return { ok: true, value: [note] };
      case "actor.list":
        return { ok: true, value: [{ id: "actor-1", displayName: "Actor", archived: false }] };
      case "project.get":
        return { ok: true, value: project };
      case "integration.list":
        return { ok: true, value: [] };
      default:
        throw new Error(`Unexpected method ${method}`);
    }
  });
  const client = createToduDaemonClient({
    connection: { request: request as never, subscribeToEvents: vi.fn() },
  });
  return { request, client, service: createToduTaskService({ client }) };
};

const mutate = async (
  service: ReturnType<typeof createToduTaskService>,
  method: MutationMethod
): Promise<TaskDetail> => {
  if (method === "task.create")
    return service.createTask({ title: "Confirmed write", projectId: "proj-1" });
  if (method === "task.update")
    return service.updateTask({ taskId: "task-confirmed", title: "Confirmed write" });
  const result = await service.moveTask({ taskId: "task-source", targetProjectId: "proj-1" });
  expect(result.sourceTaskId).toBe("task-source");
  return result.targetTask;
};

const runTool = async (
  service: ReturnType<typeof createToduTaskService>,
  method: MutationMethod
) => {
  const dependencies = { getTaskService: async () => service };
  if (method === "task.create")
    return createTaskCreateToolDefinition(dependencies).execute("call", {
      title: "Confirmed write",
      projectId: "proj-1",
    });
  if (method === "task.update")
    return createTaskUpdateToolDefinition(dependencies).execute("call", {
      taskId: rawTask.id,
      title: "Confirmed write",
    });
  return createTaskMoveToolDefinition(dependencies).execute("call", {
    taskId: "task-source",
    projectId: "proj-1",
  });
};

describe.each(methods)("%s mutation outcome", (method) => {
  const failures: [string, TaskEnrichmentSource][] = [
    ["actor.list", "actors"],
    ["project.get", "project"],
    ["integration.list", "integration-warnings"],
    ...(method === "task.create"
      ? []
      : [["note.list", "comments"] as [string, TaskEnrichmentSource]]),
  ];

  it("returns complete acknowledged data without enrichment warnings", async () => {
    const { service, request } = setup();
    const result = await mutate(service, method);
    expect(result.id).toBe(rawTask.id);
    expect(result.projectName).toBe("Project");
    expect(result.enrichmentWarnings).toBeUndefined();
    expect(result.descriptionApproval).toEqual(rawTask.descriptionApproval);
    if (method !== "task.create") {
      expect(result.comments[0]).toMatchObject({
        id: note.id,
        authorDisplayName: "Actor",
        contentApproval: note.contentApproval,
      });
      expect(request).toHaveBeenCalledWith("note.list", {
        filter: { entityType: "task", entityId: rawTask.id },
      });
    }
    expect(
      request.mock.calls.filter(([name]) => methods.includes(name as MutationMethod))
    ).toHaveLength(1);
  });

  describe.each([false, true])("enrichment throws=%s", (thrown) => {
    it.each(failures)("preserves success when %s fails", async (failure, source) => {
      const { service, request } = setup(failure, thrown);
      const result = await mutate(service, method);
      expect(result).toMatchObject({
        id: rawTask.id,
        title: rawTask.title,
        labels: rawTask.labels,
        description: rawTask.description,
        descriptionApproval: rawTask.descriptionApproval,
      });
      expect(result.enrichmentWarnings).toEqual([{ source, message: expect.any(String) }]);
      expect(JSON.stringify(result)).not.toContain("private");
      expect(
        request.mock.calls
          .map(([name]) => name)
          .filter((name) => methods.includes(name as MutationMethod))
      ).toEqual([method]);
      if (source === "integration-warnings")
        expect(result.outboundAssigneeWarningsUnavailable).toBe(true);
      if (source === "comments") expect(result.comments).toEqual([]);
      expect(createTaskDetailViewModel(result).body).toContain(`Warning (${source}):`);
    });
  });

  it("surfaces confirmed IDs and enrichment warnings in tool text and details", async () => {
    const { service, client, request } = setup();
    // Project resolution succeeds before dispatch, but post-write enrichment fails.
    const getProject = vi.spyOn(client, "getProject").mockRejectedValue(new Error("private"));
    if (method !== "task.update") getProject.mockResolvedValueOnce(project);
    const result = await runTool(service, method);
    expect(result.content[0]?.text).toContain(rawTask.id);
    expect(result.content[0]?.text).toContain("Warning (project):");
    expect(result.content[0]?.text).toContain("Mutation confirmed. Do not repeat");
    expect(JSON.stringify(result.details)).toContain("enrichmentWarnings");
    expect(
      request.mock.calls
        .map(([name]) => name)
        .filter((name) => methods.includes(name as MutationMethod))
    ).toEqual([method]);
  });

  it.each([
    { code: "TIMEOUT", message: "timeout", requestState: "dispatched" },
    { code: "DAEMON_UNAVAILABLE", message: "closed", requestState: "dispatched" },
    { code: "TIMEOUT", message: "legacy transport" },
  ] satisfies ToduDaemonConnectionError[])("reports uncertain dispatch: %j", async (error) => {
    const { service, request } = setup();
    request.mockImplementation(async (name) =>
      name === method ? ({ ok: false, error } as never) : ({ ok: true, value: project } as never)
    );
    await expect(mutate(service, method)).rejects.toMatchObject({
      causeCode: "uncertain",
      mutationOutcome: "uncertain",
      message: expect.stringContaining("may have committed"),
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not convert an uncertain tool outcome into not-found or safe failure", async () => {
    const { service, request } = setup();
    request.mockImplementation(async (name) =>
      name === method
        ? ({
            ok: false,
            error: { code: "DAEMON_UNAVAILABLE", message: "secret", requestState: "dispatched" },
          } as never)
        : ({ ok: true, value: project } as never)
    );
    await expect(runTool(service, method)).rejects.toThrow(
      "outcome unknown: the write may have committed. Verify backend state before retrying"
    );
    expect(
      request.mock.calls
        .map(([name]) => name)
        .filter((name) => methods.includes(name as MutationMethod))
    ).toEqual([method]);
  });

  it("treats a rejected request promise conservatively, without retrying", async () => {
    const { service, request } = setup();
    request.mockRejectedValue(new Error("private transport exception"));
    await expect(mutate(service, method)).rejects.toMatchObject({
      causeCode: "uncertain",
      mutationOutcome: "uncertain",
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["not-dispatched", "DAEMON_UNAVAILABLE", "unavailable", "not-dispatched"],
    ["rejected", "VALIDATION_ERROR", "validation", "rejected"],
    ["rejected", "TIMEOUT", "timeout", "rejected"],
    ["rejected", "NOT_FOUND", "not-found", "rejected"],
  ] as const)(
    "distinguishes %s %s from uncertain success",
    async (requestState, code, causeCode, mutationOutcome) => {
      const { service, request } = setup();
      request.mockResolvedValue({
        ok: false,
        error: { code, message: "rejection", requestState },
      } as never);
      await expect(mutate(service, method)).rejects.toMatchObject({ causeCode, mutationOutcome });
      expect(request).toHaveBeenCalledTimes(1);
    }
  );
});

it("accumulates independent failures without dropping earlier warnings", async () => {
  const { service, request } = setup();
  request.mockImplementation(async (method) =>
    method === "task.update"
      ? ({ ok: true, value: rawTask } as never)
      : ({ ok: false, error: { code: "TIMEOUT", message: "private" } } as never)
  );
  const result = await mutate(service, "task.update");
  expect(result.enrichmentWarnings?.map(({ source }) => source).sort()).toEqual([
    "actors",
    "comments",
    "integration-warnings",
    "project",
  ]);
  expect(result.id).toBe(rawTask.id);
  expect(result.outboundAssigneeWarningsUnavailable).toBe(true);
});

it("reports missing post-write project metadata without losing confirmed success", async () => {
  const { service, client } = setup();
  vi.spyOn(client, "getProject").mockResolvedValue(null);
  const result = await mutate(service, "task.create");
  expect(result.enrichmentWarnings).toEqual([{ source: "project", message: expect.any(String) }]);
});

it("preserves strict read-only comment/project failure handling", async () => {
  const { service, client } = setup();
  vi.spyOn(client, "getTask").mockResolvedValue({
    ...rawTask,
    projectName: null,
    dueDate: null,
    scheduledDate: null,
    descriptionApproval: null,
    assigneeDisplayNames: [],
    comments: [],
    outboundAssigneeWarnings: [],
  } as TaskDetail);
  vi.spyOn(client, "getProject").mockRejectedValue(new Error("project read failed"));
  await expect(service.getTask(rawTask.id)).rejects.toThrow("project read failed");
});
