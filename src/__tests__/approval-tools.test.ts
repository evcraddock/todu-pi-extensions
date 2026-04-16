import { describe, expect, it, vi } from "vitest";

import type { ApprovalItem } from "@/domain/approval";
import { registerTools } from "@/extension/register-tools";
import type { ActorService } from "@/services/actor-service";
import type { ApprovalService } from "@/services/approval-service";
import {
  createApprovalListToolDefinition,
  createApproveNoteContentToolDefinition,
  createApproveTaskDescriptionToolDefinition,
} from "@/tools/approval-tools";

const createApprovalItem = (overrides: Partial<ApprovalItem> = {}): ApprovalItem => ({
  kind: "taskDescription",
  state: "pendingApproval",
  taskId: "task-123",
  projectId: "proj-1",
  taskTitle: "Review imported task",
  contentPreview: "Imported content preview",
  sourceBindingId: "ibind-1",
  sourceActorId: "actor-reviewer",
  ...overrides,
});

describe("registerTools", () => {
  it("registers approval tools", () => {
    const pi = { registerTool: vi.fn() };

    registerTools(pi as never, {
      getApprovalService: vi.fn().mockResolvedValue({} as ApprovalService),
    });

    const registeredToolNames = pi.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(registeredToolNames).toEqual(
      expect.arrayContaining([
        "approval_list",
        "approval_approve_task_description",
        "approval_approve_note_content",
      ])
    );
  });
});

describe("approval tools", () => {
  it("lists approval-needed items", async () => {
    const approvalService = {
      listApprovals: vi.fn().mockResolvedValue([createApprovalItem()]),
    } as unknown as ApprovalService;
    const actorService = {
      listActors: vi
        .fn()
        .mockResolvedValue([{ id: "actor-reviewer", displayName: "Reviewer", archived: false }]),
    } as unknown as ActorService;
    const tool = createApprovalListToolDefinition({
      getApprovalService: vi.fn().mockResolvedValue(approvalService),
      getActorService: vi.fn().mockResolvedValue(actorService),
    });

    const result = await tool.execute("tool-call-1", {});

    expect(result.content[0]?.text).toContain("Approval-needed items (1):");
    expect(result.content[0]?.text).toContain("task description • Review imported task");
    expect(result.content[0]?.text).toContain("Reviewer (actor-reviewer)");
  });

  it("approves task descriptions and note content explicitly", async () => {
    const approvalService = {
      approveTaskDescription: vi.fn().mockResolvedValue(createApprovalItem({ state: "approved" })),
      approveNoteContent: vi.fn().mockResolvedValue(
        createApprovalItem({
          kind: "noteContent",
          noteId: "note-1",
          taskId: undefined,
          taskTitle: undefined,
          state: "approved",
        })
      ),
    } as unknown as ApprovalService;
    const toolTask = createApproveTaskDescriptionToolDefinition({
      getApprovalService: vi.fn().mockResolvedValue(approvalService),
    });
    const toolNote = createApproveNoteContentToolDefinition({
      getApprovalService: vi.fn().mockResolvedValue(approvalService),
    });

    await expect(toolTask.execute("tool-call-1", { taskId: "task-123" })).resolves.toMatchObject({
      content: [{ text: expect.stringContaining("Approval updated:") }],
    });
    await expect(toolNote.execute("tool-call-2", { noteId: "note-1" })).resolves.toMatchObject({
      content: [{ text: expect.stringContaining("Approval updated:") }],
    });
  });
});
