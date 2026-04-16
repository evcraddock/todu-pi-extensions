import { describe, expect, it } from "vitest";

import type { TaskDetail } from "@/domain/task";
import {
  createTaskDetailActionItems,
  createTaskDetailViewModel,
} from "@/ui/components/task-detail";

const createTaskDetail = (overrides: Partial<TaskDetail> = {}): TaskDetail => ({
  id: "task-123",
  title: "Implement task detail view",
  status: "active",
  priority: "high",
  projectId: "proj-1",
  projectName: "Todu Pi Extensions",
  labels: ["ui", "detail"],
  assigneeActorIds: ["actor-user", "actor-reviewer"],
  assigneeDisplayNames: ["Erik", "Reviewer"],
  assignees: ["Erik", "Reviewer"],
  description: "Show metadata, description, and comments inside pi.",
  descriptionApproval: null,
  outboundAssigneeWarnings: [],
  comments: [
    {
      id: "comment-1",
      taskId: "task-123",
      content: "First note",
      authorActorId: "actor-user",
      authorDisplayName: "Erik",
      author: "user",
      contentApproval: null,
      createdAt: "2026-03-19T00:00:00.000Z",
    },
    {
      id: "comment-2",
      taskId: "task-123",
      content: "Second note",
      authorActorId: "actor-user",
      authorDisplayName: "Erik",
      author: "user",
      contentApproval: null,
      createdAt: "2026-03-19T01:00:00.000Z",
    },
  ],
  ...overrides,
});

describe("task detail view model", () => {
  it("includes metadata, description, and recent comments", () => {
    const viewModel = createTaskDetailViewModel(createTaskDetail());

    expect(viewModel.title).toBe("Implement task detail view");
    expect(viewModel.commentCount).toBe(2);
    expect(viewModel.body).toContain("ID: task-123");
    expect(viewModel.body).toContain("Status: Active");
    expect(viewModel.body).toContain("Priority: high");
    expect(viewModel.body).toContain("Project: Todu Pi Extensions");
    expect(viewModel.body).toContain("Assignees: Erik, Reviewer");
    expect(viewModel.body).toContain("Description approval: None");
    expect(viewModel.body).toContain("Labels: ui, detail");
    expect(viewModel.body).toContain("Description");
    expect(viewModel.body).toContain("Show metadata, description, and comments inside pi.");
    expect(viewModel.body).toContain("Recent comments (2)");
    expect(viewModel.body).toContain("Second note");
  });

  it("shows approval and unmapped assignee warnings when present", () => {
    const viewModel = createTaskDetailViewModel(
      createTaskDetail({
        descriptionApproval: { state: "pendingApproval", sourceBindingId: "ibind-1" },
        outboundAssigneeWarnings: [
          {
            bindingId: "ibind-1",
            provider: "github",
            targetRef: "owner/repo",
            unmappedActorIds: ["actor-reviewer"],
            unmappedAssigneeDisplayNames: ["Reviewer"],
          },
        ],
      })
    );

    expect(viewModel.body).toContain("pendingApproval • binding ibind-1");
    expect(viewModel.body).toContain("Skipped unmapped outbound assignee warnings");
    expect(viewModel.body).toContain("github:owner/repo (ibind-1) • Reviewer");
  });

  it("creates quick action items for the detail hub", () => {
    expect(createTaskDetailActionItems(createTaskDetail())).toEqual([
      {
        value: "pickup",
        label: "Pick up task",
        description: "Prepare the pickup workflow for task-123 and set it as current",
      },
      {
        value: "set-current",
        label: "Set as current task",
        description: "Use task-123 as the active coding context",
      },
      {
        value: "update-status",
        label: "Update status",
        description: "Change status from Active",
      },
      {
        value: "update-priority",
        label: "Update priority",
        description: "Change priority from High",
      },
      {
        value: "comment",
        label: "Add comment",
        description: "Open the editor to add a progress note or comment",
      },
    ]);
  });

  it("only shows the pick up action for active tasks", () => {
    expect(createTaskDetailActionItems(createTaskDetail({ status: "inprogress" }))).toEqual([
      {
        value: "set-current",
        label: "Set as current task",
        description: "Use task-123 as the active coding context",
      },
      {
        value: "update-status",
        label: "Update status",
        description: "Change status from In Progress",
      },
      {
        value: "update-priority",
        label: "Update priority",
        description: "Change priority from High",
      },
      {
        value: "comment",
        label: "Add comment",
        description: "Open the editor to add a progress note or comment",
      },
    ]);
  });
});
