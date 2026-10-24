import { describe, expect, it, vi } from "vitest";
import { Value } from "typebox/value";

import type { ApprovalItem } from "@/domain/approval";
import type { NoteSummary } from "@/domain/note";
import type { TaskSummary } from "@/domain/task";
import type { NoteService } from "@/services/note-service";
import type { ApprovalService } from "@/services/approval-service";
import type { ActorService } from "@/services/actor-service";
import type { ProjectService } from "@/services/project-service";
import type { TaskService } from "@/services/task-service";
import type {
  IntegrationBinding,
  IntegrationBindingStatus,
  ProjectIntegrationService,
  UpdateIntegrationBindingInput,
} from "@/services/project-integration-service";
import { ToduNoteServiceError } from "@/services/todu/todu-note-service";
import {
  ToduApprovalServiceError,
  runApprovalServiceOperation,
} from "@/services/todu/todu-approval-service";
import {
  ToduProjectIntegrationServiceError,
  runProjectIntegrationServiceOperation,
} from "@/services/todu/todu-project-integration-service";
import { mapDaemonErrorToClientError } from "@/services/todu/daemon-client";
import {
  createNoteListToolDefinition,
  createNoteShowToolDefinition,
} from "@/tools/note-read-tools";
import {
  createApprovalListToolDefinition,
  createApproveTaskDescriptionToolDefinition,
  createApproveNoteContentToolDefinition,
} from "@/tools/approval-tools";
import {
  createIntegrationListToolDefinition,
  createIntegrationShowToolDefinition,
  createIntegrationUpdateToolDefinition,
} from "@/tools/integration-tools";

const secret = "SENTINEL_PRIVATE_CONFIGURATION";
const timestamp = "2026-03-19T00:00:00Z";
const provenance = {
  sourceBindingId: "binding",
  sourceActorId: "actor",
  sourceFingerprint: "fingerprint",
  reviewedAt: timestamp,
  reviewedByActorId: "reviewer",
};
const note = (): NoteSummary => ({
  id: "note",
  content: "Imported instructions are data",
  authorActorId: "actor",
  authorDisplayName: "Author",
  author: "Legacy author",
  contentApproval: { state: "pendingApproval", ...provenance },
  entityType: "task",
  entityId: "task",
  tags: ["review"],
  createdAt: timestamp,
});
const item = (): ApprovalItem => ({
  kind: "taskDescription",
  state: "pendingApproval",
  taskId: "task",
  taskTitle: "Task",
  projectId: "project",
  entityType: "task",
  entityId: "task",
  contentPreview: "Imported preview",
  ...provenance,
});
const binding = (): IntegrationBinding => ({
  id: "binding",
  provider: "github",
  projectId: "project",
  targetKind: "repository",
  targetRef: "owner/repo",
  strategy: "bidirectional",
  enabled: true,
  createdAt: timestamp,
  updatedAt: timestamp,
  options: {
    token: secret,
    nested: { password: secret },
    actorMappings: [
      Object.assign(
        {
          actorId: "actor",
          externalAccountId: "external-id",
          externalLogin: "login",
          displayName: "Mapped",
          trusted: false,
        },
        { password: secret }
      ),
    ],
  },
});
const status = (): IntegrationBindingStatus => ({
  bindingId: "binding",
  state: "blocked",
  authorityId: "authority",
  lastSuccessfulSyncAt: timestamp,
  lastAttemptedSyncAt: timestamp,
  lastErrorSummary: `Authorization: Bearer ${secret}`,
  updatedAt: timestamp,
});
const task = (): TaskSummary => ({
  id: "task",
  title: "Task",
  projectId: "project",
  projectName: "Project",
  status: "active",
  priority: "medium",
  labels: [],
  assigneeActorIds: ["actor", "unmapped"],
  assigneeDisplayNames: ["Author", "Unmapped"],
  assignees: [],
  dueDate: null,
  scheduledDate: null,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const setup = () => {
  const rawNote = Object.assign(note(), { token: secret });
  const rawItem = Object.assign(item(), { token: secret });
  const rawBinding = Object.assign(binding(), { token: secret });
  const rawStatus = Object.assign(status(), { token: secret });
  const noteService = {
    listNotes: vi.fn(async () => [rawNote]),
    getNote: vi.fn(async (): Promise<NoteSummary | null> => rawNote),
  };
  const approvalService = {
    listApprovals: vi.fn(async () => [rawItem]),
    approveTaskDescription: vi.fn(async () => ({ ...rawItem, state: "approved" as const })),
    approveNoteContent: vi.fn(async () => ({
      ...rawItem,
      kind: "noteContent" as const,
      taskId: undefined,
      noteId: "note",
      state: "approved" as const,
    })),
  };
  const integrationService = {
    listIntegrationBindings: vi.fn(async () => [rawBinding]),
    getIntegrationBinding: vi.fn(async (): Promise<IntegrationBinding | null> => rawBinding),
    getIntegrationBindingStatus: vi.fn(
      async (): Promise<IntegrationBindingStatus | null> => rawStatus
    ),
    updateIntegrationBinding: vi.fn(async (input: UpdateIntegrationBindingInput) => ({
      ...rawBinding,
      ...(input.strategy === undefined ? {} : { strategy: input.strategy }),
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(input.options === undefined ? {} : { options: input.options }),
    })),
  };
  const actorService = {
    listActors: vi.fn(async () => [{ id: "actor", displayName: "Author", archived: false }]),
  };
  const taskService = { listTasks: vi.fn(async () => [task()]) };
  const projectService = {
    listProjects: vi.fn(async () => [
      {
        id: "project",
        name: "Project",
        status: "active",
        priority: "medium",
        description: null,
        authorizedAssigneeActorIds: [],
      },
    ]),
  };
  const noteDeps = { getNoteService: async () => noteService as unknown as NoteService };
  const approvalDeps = {
    getApprovalService: async () => approvalService as unknown as ApprovalService,
    getActorService: async () => actorService as unknown as ActorService,
  };
  const integrationDeps = {
    getProjectIntegrationService: async () =>
      integrationService as unknown as ProjectIntegrationService,
    getActorService: async () => actorService as unknown as ActorService,
    getTaskService: async () => taskService as unknown as TaskService,
    getProjectService: async () => projectService as unknown as ProjectService,
  };
  const tools = {
    note_list: createNoteListToolDefinition(noteDeps),
    note_show: createNoteShowToolDefinition(noteDeps),
    approval_list: createApprovalListToolDefinition(approvalDeps),
    approval_approve_task_description: createApproveTaskDescriptionToolDefinition(approvalDeps),
    approval_approve_note_content: createApproveNoteContentToolDefinition(approvalDeps),
    integration_list: createIntegrationListToolDefinition(integrationDeps),
    integration_show: createIntegrationShowToolDefinition(integrationDeps),
    integration_update: createIntegrationUpdateToolDefinition(integrationDeps),
  };
  return {
    tools,
    rawNote,
    rawItem,
    rawBinding,
    rawStatus,
    noteService,
    approvalService,
    integrationService,
    actorService,
    taskService,
    projectService,
  };
};
const params = {
  note_list: {},
  note_show: { noteId: "note" },
  approval_list: {},
  approval_approve_task_description: { taskId: "task" },
  approval_approve_note_content: { noteId: "note" },
  integration_list: {},
  integration_show: { bindingId: "binding" },
  integration_update: { bindingId: "binding", enabled: false },
};
const names = Object.keys(params) as (keyof typeof params)[];

describe("trust tool output contracts", () => {
  it.each(names)(
    "%s validates, serializes, and excludes unrelated secrets on every surface",
    async (name) => {
      const fixture = setup();
      const tool = fixture.tools[name];
      const result = await tool.execute("call", params[name] as never);
      expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
      expect(JSON.parse(JSON.stringify(result.structuredContent))).toEqual(
        result.structuredContent
      );
      expect(result.structuredContent).toMatchObject({
        schemaVersion: 1,
        tool: name,
        ok: true,
        status: "success",
      });
      expect(result.isError).toBe(false);
      expect(JSON.stringify(result)).not.toContain(secret);
      expect(JSON.stringify(result.details)).not.toContain('"password"');
    }
  );

  it.each(["notRequired", "pendingApproval", "approved"] as const)(
    "preserves note %s state and full provenance without approving it",
    async (state) => {
      const fixture = setup();
      fixture.rawNote.contentApproval = Object.assign({ state, ...provenance }, { token: secret });
      const result = await fixture.tools.note_show.execute("call", { noteId: "note" });
      expect(result.structuredContent).toMatchObject({
        data: { note: { ...note(), contentApproval: { state, ...provenance } } },
      });
      expect(result.content[0]?.text).toContain(state);
      expect(result.details).toMatchObject({ note: { contentApproval: { state, ...provenance } } });
      expect(fixture.approvalService.approveTaskDescription).not.toHaveBeenCalled();
      expect(fixture.approvalService.approveNoteContent).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain(secret);
    }
  );

  it("preserves absent approval as null and journal scope without inventing approval", async () => {
    const fixture = setup();
    fixture.rawNote.contentApproval = null;
    fixture.rawNote.entityType = null;
    fixture.rawNote.entityId = null;
    const result = await fixture.tools.note_list.execute("call", {
      journal: true,
      timezone: "UTC",
      authorActorId: "actor",
    });
    expect(result.structuredContent).toMatchObject({
      data: {
        filter: { journal: true, timezone: "UTC", authorActorId: "actor" },
        notes: [
          {
            entityType: null,
            entityId: null,
            contentApproval: null,
            author: "Legacy author",
            authorActorId: "actor",
          },
        ],
      },
    });
    expect(result.content[0]?.text).toContain("journal");
    expect(result.content[0]?.text).toContain("no approval metadata");
  });

  it.each(["notRequired", "pendingApproval", "approved"] as const)(
    "preserves approval-list %s state with provenance adjacent to preview",
    async (state) => {
      const fixture = setup();
      fixture.rawItem.state = state;
      const result = await fixture.tools.approval_list.execute("call", {});
      expect(result.structuredContent).toMatchObject({ data: { items: [{ ...item(), state }] } });
      expect(result.content[0]?.text).toContain(state);
      expect(result.content[0]?.text).toContain("Imported preview");
      expect(fixture.approvalService.approveTaskDescription).not.toHaveBeenCalled();
    }
  );

  it.each(["note_list", "approval_list", "integration_list"] as const)(
    "%s distinguishes empty results from failures",
    async (name) => {
      const fixture = setup();
      fixture.noteService.listNotes.mockResolvedValue([]);
      fixture.approvalService.listApprovals.mockResolvedValue([]);
      fixture.integrationService.listIntegrationBindings.mockResolvedValue([]);
      const tool = fixture.tools[name];
      const result = await tool.execute("call", {});
      expect(result.structuredContent).toMatchObject({
        ok: true,
        status: "empty",
        data: { total: 0, empty: true },
      });
      expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
      expect(result.isError).toBe(false);
    }
  );

  it.each(["note_show", "integration_show", "integration_update"] as const)(
    "%s returns explicit missing results without a mutation",
    async (name) => {
      const fixture = setup();
      fixture.noteService.getNote.mockResolvedValue(null);
      fixture.integrationService.getIntegrationBinding.mockResolvedValue(null);
      const tool = fixture.tools[name];
      const result = await tool.execute("call", params[name] as never);
      expect(result.structuredContent).toMatchObject({
        ok: false,
        status: "not_found",
        target: {
          entityType: name === "note_show" ? "note" : "integration",
          entityId: name === "note_show" ? "note" : "binding",
        },
      });
      expect(result.isError).toBe(false);
      expect(result.content[0]?.text.toLowerCase()).toContain("not found");
      expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
      expect(fixture.integrationService.updateIntegrationBinding).not.toHaveBeenCalled();
    }
  );

  it.each(["validation", "ambiguous", "unavailable", "timeout", "not-found"])(
    "handles known read failure %s without raw diagnostics or false empty",
    async (causeCode) => {
      const fixture = setup();
      fixture.noteService.listNotes.mockRejectedValue(
        new ToduNoteServiceError({
          operation: "listNotes",
          causeCode,
          message: secret,
          details: { token: secret },
        })
      );
      const result = await fixture.tools.note_list.execute("call", {});
      const expected =
        causeCode === "validation"
          ? "validation_error"
          : causeCode === "ambiguous"
            ? "ambiguous"
            : "backend_error";
      expect(result.structuredContent).toMatchObject({ ok: false, status: expected });
      expect(result.isError).toBe(true);
      expect(Value.Check(fixture.tools.note_list.outputSchema, result.structuredContent)).toBe(
        true
      );
      expect(JSON.stringify(result)).not.toContain(secret);
    }
  );

  it("keeps integration status, mapping identities, trust, and complete unmapped warnings", async () => {
    const fixture = setup();
    const result = await fixture.tools.integration_show.execute("call", { bindingId: "binding" });
    expect(result.structuredContent).toMatchObject({
      data: {
        binding: {
          options: {
            actorMappings: [
              {
                actorId: "actor",
                externalAccountId: "external-id",
                externalLogin: "login",
                trusted: false,
              },
            ],
          },
        },
        status: {
          state: "blocked",
          authorityId: "authority",
          lastSuccessfulSyncAt: timestamp,
          lastAttemptedSyncAt: timestamp,
        },
        taskWarnings: [
          {
            taskId: "task",
            title: "Task",
            unmappedActorIds: ["unmapped"],
            unmappedAssigneeDisplayNames: ["Unmapped"],
          },
        ],
      },
      warnings: expect.arrayContaining([
        {
          code: "unmapped_assignees",
          message: expect.any(String),
          target: { entityType: "task", entityId: "task" },
          outboundAssigneeWarning: {
            bindingId: "binding",
            provider: "github",
            targetRef: "owner/repo",
            unmappedActorIds: ["unmapped"],
            unmappedAssigneeDisplayNames: ["Unmapped"],
          },
        },
      ]),
    });
    expect(result.content[0]?.text).toContain("trust: untrusted");
    expect(result.content[0]?.text).toContain("State: blocked");
    expect(result.content[0]?.text).toContain("Unmapped");
    expect(result.content[0]?.text).toContain("diagnostics_redacted");
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it.each(["tasks", "actors", "projects", "status"] as const)(
    "reports unavailable %s enrichment in structured and readable outputs",
    async (source) => {
      const fixture = setup();
      const code = {
        tasks: "task_warnings_unavailable",
        actors: "actors_unavailable",
        projects: "projects_unavailable",
        status: "status_unavailable",
      }[source];
      if (source === "tasks") fixture.taskService.listTasks.mockRejectedValue(new Error(secret));
      if (source === "actors") fixture.actorService.listActors.mockRejectedValue(new Error(secret));
      if (source === "projects")
        fixture.projectService.listProjects.mockRejectedValue(new Error(secret));
      if (source === "status")
        fixture.integrationService.getIntegrationBindingStatus.mockRejectedValue(new Error(secret));
      const result = await fixture.tools.integration_show.execute("call", { bindingId: "binding" });
      expect(result.structuredContent).toMatchObject({
        ok: true,
        warnings: expect.arrayContaining([expect.objectContaining({ code })]),
      });
      expect(result.content[0]?.text).toContain(`Warning (${code}):`);
      expect(JSON.stringify(result)).not.toContain(secret);
    }
  );

  it("distinguishes an absent status from an absent binding", async () => {
    const fixture = setup();
    fixture.integrationService.getIntegrationBindingStatus.mockResolvedValue(null);
    const result = await fixture.tools.integration_show.execute("call", { bindingId: "binding" });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      data: { status: null },
      warnings: expect.arrayContaining([expect.objectContaining({ code: "status_unavailable" })]),
    });
    expect(result.content[0]?.text).toContain("State: unknown");
  });

  it("reports warnings unavailable when optional task enrichment is not configured", async () => {
    const fixture = setup();
    const tool = createIntegrationShowToolDefinition({
      getProjectIntegrationService: async () =>
        fixture.integrationService as unknown as ProjectIntegrationService,
    });
    const result = await tool.execute("call", { bindingId: "binding" });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      data: { taskWarnings: [] },
      warnings: expect.arrayContaining([
        expect.objectContaining({ code: "task_warnings_unavailable" }),
      ]),
    });
    expect(result.content[0]?.text).toContain("an empty list is incomplete");
  });

  it("retains confirmed approval success when display enrichment fails", async () => {
    const fixture = setup();
    fixture.actorService.listActors.mockRejectedValue(new Error(secret));
    const result = await fixture.tools.approval_approve_note_content.execute("call", {
      noteId: "note",
    });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      data: { item: { noteId: "note", kind: "noteContent", state: "approved", ...provenance } },
      warnings: [expect.objectContaining({ code: "actors_unavailable" })],
    });
    expect(result.content[0]?.text).toContain("State: approved");
    expect(result.content[0]?.text).toContain("Warning (actors_unavailable)");
    expect(fixture.approvalService.approveNoteContent).toHaveBeenCalledTimes(1);
  });

  it("updates only explicitly requested trust and preserves backend options without exposing them", async () => {
    const fixture = setup();
    await fixture.tools.integration_list.execute("call", {});
    expect(fixture.integrationService.updateIntegrationBinding).not.toHaveBeenCalled();
    const result = await fixture.tools.integration_update.execute("call", {
      bindingId: "binding",
      trustActorIds: ["actor"],
    });
    expect(fixture.integrationService.updateIntegrationBinding).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        options: expect.objectContaining({
          token: secret,
          actorMappings: [expect.objectContaining({ actorId: "actor", trusted: true })],
        }),
      })
    );
    expect(result.structuredContent).toMatchObject({
      data: {
        binding: {
          id: "binding",
          options: { actorMappings: [expect.objectContaining({ trusted: true })] },
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it.each([{ trustActorIds: ["unknown"] }, { actorMappings: [{ actorId: "unknown" }] }, {}])(
    "keeps integration validation and prevents writes for %j",
    async (changes) => {
      const fixture = setup();
      const result = await fixture.tools.integration_update.execute("call", {
        bindingId: "binding",
        ...changes,
      });
      expect(result.structuredContent).toMatchObject({ ok: false, status: "validation_error" });
      expect(fixture.integrationService.updateIntegrationBinding).not.toHaveBeenCalled();
    }
  );

  it.each([
    "approval_approve_task_description",
    "approval_approve_note_content",
    "integration_update",
  ] as const)(
    "%s distinguishes dispatched, rejected and not-dispatched outcomes without retry",
    async (name) => {
      for (const requestState of ["dispatched", "rejected", "not-dispatched"] as const) {
        const fixture = setup();
        const error = new ToduApprovalServiceError({
          operation: "write",
          causeCode: "timeout",
          requestState,
          message: secret,
        });
        fixture.approvalService.approveTaskDescription.mockRejectedValue(error);
        fixture.approvalService.approveNoteContent.mockRejectedValue(error);
        fixture.integrationService.updateIntegrationBinding.mockRejectedValue(
          new ToduProjectIntegrationServiceError({
            operation: "updateIntegrationBinding",
            causeCode: "timeout",
            requestState,
            message: secret,
          })
        );
        const tool = fixture.tools[name];
        const result = await tool.execute("call", params[name] as never);
        expect(result.structuredContent).toMatchObject({
          ok: false,
          status: requestState === "dispatched" ? "uncertain" : "backend_error",
        });
        expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
        expect(JSON.stringify(result)).not.toContain(secret);
        if (requestState === "dispatched")
          expect(result.structuredContent).toMatchObject({ confirmedEntities: [] });
        const write =
          name === "integration_update"
            ? fixture.integrationService.updateIntegrationBinding
            : name === "approval_approve_task_description"
              ? fixture.approvalService.approveTaskDescription
              : fixture.approvalService.approveNoteContent;
        expect(write).toHaveBeenCalledTimes(1);
      }
    }
  );

  it.each([
    "approval_approve_task_description",
    "approval_approve_note_content",
    "integration_update",
  ] as const)("%s represents unknown thrown dispatch conservatively", async (name) => {
    const fixture = setup();
    fixture.approvalService.approveTaskDescription.mockRejectedValue(new Error(secret));
    fixture.approvalService.approveNoteContent.mockRejectedValue(new Error(secret));
    fixture.integrationService.updateIntegrationBinding.mockRejectedValue(new Error(secret));
    const result = await fixture.tools[name].execute("call", params[name] as never);
    expect(result.structuredContent).toMatchObject({
      ok: false,
      status: "uncertain",
      confirmedEntities: [],
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it.each(["approval_approve_task_description", "approval_approve_note_content"] as const)(
    "%s preserves explicit not-found and validation outcomes",
    async (name) => {
      for (const code of ["not-found", "validation"] as const) {
        const fixture = setup();
        const error = new ToduApprovalServiceError({
          operation: "write",
          causeCode: code,
          requestState: "rejected",
          message: secret,
        });
        fixture.approvalService.approveTaskDescription.mockRejectedValue(error);
        fixture.approvalService.approveNoteContent.mockRejectedValue(error);
        const result = await fixture.tools[name].execute("call", params[name] as never);
        expect(result.structuredContent).toMatchObject({
          status: code === "not-found" ? "not_found" : "validation_error",
        });
        expect(result.isError).toBe(code === "validation");
      }
    }
  );

  it("retains dispatch evidence across daemon mapping and service wrappers", async () => {
    for (const requestState of ["dispatched", "rejected", "not-dispatched"] as const) {
      const error = mapDaemonErrorToClientError("approval.approveNoteContent", {
        code: "TIMEOUT",
        message: secret,
        requestState,
      });
      for (const operation of [
        runApprovalServiceOperation,
        runProjectIntegrationServiceOperation,
      ]) {
        await expect(
          operation("write", async () => {
            throw error;
          })
        ).rejects.toMatchObject({ causeCode: "timeout", requestState });
      }
    }
  });

  it.each([
    "note_show",
    "integration_show",
    "integration_update",
    "approval_approve_task_description",
    "approval_approve_note_content",
  ] as const)("%s rejects blank IDs before service calls", async (name) => {
    const fixture = setup();
    const emptyParams =
      name === "note_show" || name === "approval_approve_note_content"
        ? { noteId: " " }
        : name === "approval_approve_task_description"
          ? { taskId: " " }
          : { bindingId: " " };
    const result = await fixture.tools[name].execute("call", emptyParams as never);
    expect(result.structuredContent).toMatchObject({ ok: false, status: "validation_error" });
    expect(fixture.integrationService.getIntegrationBinding).not.toHaveBeenCalled();
    expect(fixture.noteService.getNote).not.toHaveBeenCalled();
    expect(fixture.approvalService.approveTaskDescription).not.toHaveBeenCalled();
    expect(fixture.approvalService.approveNoteContent).not.toHaveBeenCalled();
  });

  it("never reports a primary entity missing when service acquisition fails", async () => {
    const failure = new ToduProjectIntegrationServiceError({
      operation: "connect",
      causeCode: "not-found",
      message: secret,
    });
    const tools = [
      createNoteShowToolDefinition({
        getNoteService: async () => {
          throw failure;
        },
      }),
      createIntegrationShowToolDefinition({
        getProjectIntegrationService: async () => {
          throw failure;
        },
      }),
      createIntegrationUpdateToolDefinition({
        getProjectIntegrationService: async () => {
          throw failure;
        },
      }),
    ];
    for (const tool of tools) {
      const result = await tool.execute("call", {
        noteId: "note",
        bindingId: "binding",
        enabled: false,
      } as never);
      expect(result.structuredContent).toMatchObject({ ok: false, status: "backend_error" });
      expect(JSON.stringify(result)).not.toContain(secret);
    }
  });

  it("does not call an undispatched approval failure uncertain", async () => {
    const tool = createApproveTaskDescriptionToolDefinition({
      getApprovalService: async () => {
        throw new ToduApprovalServiceError({
          operation: "connect",
          causeCode: "unavailable",
          message: secret,
        });
      },
    });
    const result = await tool.execute("call", { taskId: "task" });
    expect(result.structuredContent).toMatchObject({ ok: false, status: "backend_error" });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("does not invent trust when a mapping's trust flag is absent", async () => {
    const fixture = setup();
    const mappings = fixture.rawBinding.options?.actorMappings;
    if (!mappings?.[0]) throw new Error("Fixture requires mapping");
    delete mappings[0].trusted;
    const result = await fixture.tools.integration_show.execute("call", { bindingId: "binding" });
    expect(JSON.stringify(result.structuredContent)).not.toContain('"trusted":true');
    expect(result.content[0]?.text).toContain("trust: untrusted");
    expect(fixture.integrationService.updateIntegrationBinding).not.toHaveBeenCalled();
  });

  it("does not assume every explicit approval response is approved", async () => {
    const service: ApprovalService = {
      listApprovals: vi.fn(),
      approveNoteContent: vi.fn(),
      approveTaskDescription: async () => ({ ...item(), state: "notRequired" }),
    };
    const tool = createApproveTaskDescriptionToolDefinition({
      getApprovalService: async () => service,
    });
    const result = await tool.execute("call", { taskId: "task" });
    expect(result.structuredContent).toMatchObject({
      data: { item: { state: "notRequired", ...provenance } },
    });
    expect(result.content[0]?.text).toContain("State: notRequired");
  });

  it("closes payload schemas against undeclared nested properties", async () => {
    const fixture = setup();
    const tool = fixture.tools.note_show;
    const result = await tool.execute("call", { noteId: "note" });
    expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
    expect(
      Value.Check(tool.outputSchema, {
        schemaVersion: 1,
        tool: "note_show",
        ok: true,
        status: "success",
        warnings: [],
        data: { note: fixture.rawNote },
      })
    ).toBe(false);
  });

  it("rejects trusting an existing actor without a binding-local mapping", async () => {
    const fixture = setup();
    fixture.actorService.listActors.mockResolvedValue([
      { id: "unmapped", displayName: "Unmapped", archived: false },
    ]);
    const result = await fixture.tools.integration_update.execute("call", {
      bindingId: "binding",
      trustActorIds: ["unmapped"],
    });
    expect(result.structuredContent).toMatchObject({ ok: false, status: "validation_error" });
    expect(fixture.integrationService.updateIntegrationBinding).not.toHaveBeenCalled();
  });

  it("throws sanitized contract failures instead of recasting them as backend outcomes", async () => {
    const fixture = setup();
    fixture.rawNote.createdAt = secret;
    Object.assign(fixture.rawNote, { tags: [undefined] });
    await expect(fixture.tools.note_show.execute("call", { noteId: "note" })).rejects.toThrow(
      "Structured tool result must contain only JSON-compatible data"
    );
  });
});
