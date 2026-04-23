import { describe, expect, it, vi } from "vitest";

import type { ProjectSummary, TaskComment, TaskDetail } from "@/domain/task";
import { registerTools } from "@/extension/register-tools";
import type { TaskService } from "@/services/task-service";
import { ToduTaskServiceError } from "@/services/todu/todu-task-service";
import {
  createTaskCommentCreateToolDefinition,
  createTaskCreateToolDefinition,
  createTaskDeleteToolDefinition,
  createTaskMoveToolDefinition,
  createTaskUpdateToolDefinition,
  normalizeCreateTaskInput,
  normalizeTaskCommentInput,
  normalizeUpdateTaskInput,
  resolveCreateTaskInput,
  resolveProjectForTaskCreate,
  resolveUpdateTaskInput,
} from "@/tools/task-mutation-tools";

const createTaskDetail = (overrides: Partial<TaskDetail> = {}): TaskDetail => ({
  id: "task-123",
  title: "Implement mutation tools",
  status: "active",
  priority: "high",
  projectId: "proj-1",
  projectName: "Todu Pi Extensions",
  labels: [],
  assigneeActorIds: ["actor-user"],
  assigneeDisplayNames: ["Erik"],
  assignees: ["Erik"],
  description: "Add create, update, and comment tools.",
  comments: [],
  ...overrides,
  descriptionApproval: overrides.descriptionApproval ?? null,
  outboundAssigneeWarnings: overrides.outboundAssigneeWarnings ?? [],
});

const createTaskComment = (overrides: Partial<TaskComment> = {}): TaskComment => ({
  id: "comment-1",
  taskId: "task-123",
  authorActorId: "actor-user",
  authorDisplayName: "Erik",
  author: "user",
  createdAt: "2026-03-19T00:00:00.000Z",
  content: "Looks good",
  ...overrides,
  contentApproval: overrides.contentApproval ?? null,
});

const createProjectSummary = (overrides: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: "proj-1",
  name: "Todu Pi Extensions",
  status: "active",
  priority: "medium",
  description: "Primary project",
  authorizedAssigneeActorIds: [],
  ...overrides,
});

describe("registerTools", () => {
  it("registers the V1 task mutation tools", () => {
    const pi = {
      registerTool: vi.fn(),
    };

    registerTools(pi as never, {
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
    });

    const registeredToolNames = pi.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(registeredToolNames).toEqual(
      expect.arrayContaining(["task_create", "task_update", "task_comment_create"])
    );
  });
});

describe("normalizeCreateTaskInput", () => {
  it("trims required text fields and normalizes blank descriptions to null", () => {
    expect(
      normalizeCreateTaskInput({
        title: "  Implement mutation tools  ",
        projectId: "  proj-1  ",
        description: "   ",
        labels: ["  Foundation  ", "foundation", "UI"],
      })
    ).toEqual({
      title: "Implement mutation tools",
      projectId: "proj-1",
      description: null,
      labels: ["foundation", "ui"],
    });
  });

  it("rejects blank titles", () => {
    expect(() =>
      normalizeCreateTaskInput({
        title: "   ",
        projectId: "proj-1",
      })
    ).toThrow("title is required");
  });
});

describe("normalizeUpdateTaskInput", () => {
  it("requires at least one supported mutation field", () => {
    expect(() => normalizeUpdateTaskInput({ taskId: "task-123" })).toThrow(
      "task_update requires at least one supported field: title, status, priority, description, labels, or assigneeActorIds"
    );
  });

  it("trims replacement titles", () => {
    expect(
      normalizeUpdateTaskInput({
        taskId: " task-123 ",
        title: "  Updated title  ",
      })
    ).toEqual({
      taskId: "task-123",
      title: "Updated title",
      status: undefined,
      priority: undefined,
    });
  });

  it("treats blank descriptions as an explicit clear", () => {
    expect(
      normalizeUpdateTaskInput({
        taskId: " task-123 ",
        description: "   ",
      })
    ).toEqual({
      taskId: "task-123",
      status: undefined,
      priority: undefined,
      description: null,
    });
  });

  it("normalizes labels for additive updates", () => {
    expect(
      normalizeUpdateTaskInput({
        taskId: " task-123 ",
        labels: ["  Foundation  ", "foundation", "UI"],
      })
    ).toEqual({
      taskId: "task-123",
      status: undefined,
      priority: undefined,
      labels: ["foundation", "ui"],
    });
  });
});

describe("resolveUpdateTaskInput", () => {
  it("supports replacing assignees directly", async () => {
    await expect(
      resolveUpdateTaskInput({} as TaskService, {
        taskId: "task-123",
        assigneeActorIds: [" actor-user ", "actor-reviewer"],
      })
    ).resolves.toEqual({
      taskId: "task-123",
      status: undefined,
      priority: undefined,
      assigneeActorIds: ["actor-user", "actor-reviewer"],
    });
  });

  it("supports incremental assignee updates", async () => {
    const taskService = {
      getTask: vi
        .fn()
        .mockResolvedValue(
          createTaskDetail({ assigneeActorIds: ["actor-user"], assigneeDisplayNames: ["Erik"] })
        ),
    } as unknown as TaskService;

    await expect(
      resolveUpdateTaskInput(taskService, {
        taskId: "task-123",
        addAssigneeActorIds: ["actor-reviewer", "actor-user"],
        removeAssigneeActorIds: ["actor-user"],
      })
    ).resolves.toEqual({
      taskId: "task-123",
      status: undefined,
      priority: undefined,
      assigneeActorIds: ["actor-reviewer"],
    });
  });

  it("adds labels to the existing label list by default", async () => {
    const taskService = {
      getTask: vi.fn().mockResolvedValue(createTaskDetail({ labels: ["foundation"] })),
    } as unknown as TaskService;

    await expect(
      resolveUpdateTaskInput(taskService, {
        taskId: "task-123",
        labels: ["UI", "foundation"],
      })
    ).resolves.toEqual({
      taskId: "task-123",
      status: undefined,
      priority: undefined,
      labels: ["foundation", "ui"],
    });
  });

  it("removes labels when removeLabels is provided", async () => {
    const taskService = {
      getTask: vi
        .fn()
        .mockResolvedValue(createTaskDetail({ labels: ["foundation", "ui", "urgent"] })),
    } as unknown as TaskService;

    await expect(
      resolveUpdateTaskInput(taskService, {
        taskId: "task-123",
        labels: ["backend"],
        removeLabels: ["ui", "missing"],
      })
    ).resolves.toEqual({
      taskId: "task-123",
      status: undefined,
      priority: undefined,
      labels: ["foundation", "urgent", "backend"],
    });
  });

  it("rejects mixing direct and incremental assignee updates", async () => {
    await expect(
      resolveUpdateTaskInput({} as TaskService, {
        taskId: "task-123",
        assigneeActorIds: ["actor-user"],
        addAssigneeActorIds: ["actor-reviewer"],
      })
    ).rejects.toThrow(
      "task_update cannot combine assigneeActorIds with addAssigneeActorIds or removeAssigneeActorIds"
    );
  });
});

describe("normalizeTaskCommentInput", () => {
  it("trims comment content and rejects blank input", () => {
    expect(
      normalizeTaskCommentInput({
        taskId: " task-123 ",
        content: "  Added a note  ",
      })
    ).toEqual({
      taskId: "task-123",
      content: "Added a note",
    });

    expect(() =>
      normalizeTaskCommentInput({
        taskId: "task-123",
        content: "   ",
      })
    ).toThrow("content is required");
  });
});

describe("resolveProjectForTaskCreate", () => {
  it("returns a direct project match by ID first", async () => {
    const project = createProjectSummary();
    const taskService = {
      getProject: vi.fn().mockResolvedValue(project),
      listProjects: vi.fn(),
    } as unknown as TaskService;

    await expect(resolveProjectForTaskCreate(taskService, project.id)).resolves.toEqual(project);
    expect(taskService.getProject).toHaveBeenCalledWith(project.id);
    expect(taskService.listProjects).not.toHaveBeenCalled();
  });

  it("falls back to a unique project-name match", async () => {
    const project = createProjectSummary();
    const taskService = {
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi.fn().mockResolvedValue([project]),
    } as unknown as TaskService;

    await expect(resolveProjectForTaskCreate(taskService, project.name)).resolves.toEqual(project);
    expect(taskService.getProject).toHaveBeenCalledWith(project.name);
    expect(taskService.listProjects).toHaveBeenCalledWith();
  });

  it("fails clearly when the project name does not match anything", async () => {
    const taskService = {
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi.fn().mockResolvedValue([]),
    } as unknown as TaskService;

    await expect(resolveProjectForTaskCreate(taskService, "missing-project")).rejects.toThrow(
      "project not found: missing-project"
    );
  });

  it("fails clearly when the project-name match is ambiguous", async () => {
    const taskService = {
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi
        .fn()
        .mockResolvedValue([createProjectSummary(), createProjectSummary({ id: "proj-2" })]),
    } as unknown as TaskService;

    await expect(resolveProjectForTaskCreate(taskService, "Todu Pi Extensions")).rejects.toThrow(
      "multiple projects matched: Todu Pi Extensions"
    );
  });
});

describe("resolveCreateTaskInput", () => {
  it("replaces a unique project name with the resolved project ID", async () => {
    const project = createProjectSummary();
    const taskService = {
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi.fn().mockResolvedValue([project]),
    } as unknown as TaskService;

    await expect(
      resolveCreateTaskInput(taskService, {
        title: "Implement mutation tools",
        projectId: project.name,
        description: "Add create, update, and comment tools.",
      })
    ).resolves.toEqual({
      title: "Implement mutation tools",
      projectId: project.id,
      description: "Add create, update, and comment tools.",
    });
  });
});

describe("createTaskCreateToolDefinition", () => {
  it("creates a task and returns structured details", async () => {
    const task = createTaskDetail();
    const taskService = {
      createTask: vi.fn().mockResolvedValue(task),
      getProject: vi.fn().mockResolvedValue(createProjectSummary()),
      listProjects: vi.fn(),
    } as unknown as TaskService;
    const tool = createTaskCreateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    const result = await tool.execute("tool-call-1", {
      title: "  Implement mutation tools  ",
      projectId: " proj-1 ",
      description: "  Add create, update, and comment tools.  ",
      labels: [" Foundation ", "ui"],
    });

    expect(taskService.createTask).toHaveBeenCalledWith({
      title: "Implement mutation tools",
      projectId: "proj-1",
      description: "Add create, update, and comment tools.",
      labels: ["foundation", "ui"],
    });
    expect(result.content[0]?.text).toContain(`Created task ${task.id}: ${task.title}`);
    expect(result.details).toEqual({
      kind: "task_create",
      input: {
        title: "Implement mutation tools",
        projectId: "proj-1",
        description: "Add create, update, and comment tools.",
        labels: ["foundation", "ui"],
      },
      task,
    });
  });

  it("surfaces validation failures with tool-specific context", async () => {
    const tool = createTaskCreateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
    });

    await expect(
      tool.execute("tool-call-1", {
        title: "   ",
        projectId: "proj-1",
      })
    ).rejects.toThrow("task_create failed: title is required");
  });

  it("resolves a unique project name before creating the task", async () => {
    const project = createProjectSummary();
    const task = createTaskDetail({ projectId: project.id, projectName: project.name });
    const taskService = {
      createTask: vi.fn().mockResolvedValue(task),
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi.fn().mockResolvedValue([project]),
    } as unknown as TaskService;
    const tool = createTaskCreateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    await tool.execute("tool-call-1", {
      title: "Implement mutation tools",
      projectId: project.name,
    });

    expect(taskService.createTask).toHaveBeenCalledWith({
      title: "Implement mutation tools",
      projectId: project.id,
      description: undefined,
    });
  });

  it("fails clearly when the project name is missing", async () => {
    const tool = createTaskCreateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({
        getProject: vi.fn().mockResolvedValue(null),
        listProjects: vi.fn().mockResolvedValue([]),
      } as unknown as TaskService),
    });

    await expect(
      tool.execute("tool-call-1", {
        title: "Implement mutation tools",
        projectId: "missing-project",
      })
    ).rejects.toThrow("task_create failed: project not found: missing-project");
  });

  it("fails clearly when the project name is ambiguous", async () => {
    const tool = createTaskCreateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({
        getProject: vi.fn().mockResolvedValue(null),
        listProjects: vi
          .fn()
          .mockResolvedValue([createProjectSummary(), createProjectSummary({ id: "proj-2" })]),
      } as unknown as TaskService),
    });

    await expect(
      tool.execute("tool-call-1", {
        title: "Implement mutation tools",
        projectId: "Todu Pi Extensions",
      })
    ).rejects.toThrow("task_create failed: multiple projects matched: Todu Pi Extensions");
  });

  it("surfaces service failures with tool-specific context", async () => {
    const tool = createTaskCreateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({
        getProject: vi.fn().mockResolvedValue(createProjectSummary()),
        createTask: vi.fn().mockRejectedValue(new Error("daemon unavailable")),
      } as unknown as TaskService),
    });

    await expect(
      tool.execute("tool-call-1", {
        title: "Implement mutation tools",
        projectId: "proj-1",
      })
    ).rejects.toThrow("task_create failed: daemon unavailable");
  });
});

describe("createTaskUpdateToolDefinition", () => {
  it("rejects adding unauthorized or archived actors for new assignment", async () => {
    const taskService = {
      getTask: vi.fn().mockResolvedValue(createTaskDetail({ assigneeActorIds: ["actor-user"] })),
      updateTask: vi.fn(),
    } as unknown as TaskService;
    const actorService = {
      listActors: vi.fn().mockResolvedValue([
        { id: "actor-user", displayName: "Erik", archived: false },
        { id: "actor-archived", displayName: "Archived", archived: true },
      ]),
    } as never;
    const projectService = {
      getProject: vi
        .fn()
        .mockResolvedValue(createProjectSummary({ authorizedAssigneeActorIds: ["actor-user"] })),
    } as never;
    const tool = createTaskUpdateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
      getActorService: vi.fn().mockResolvedValue(actorService),
      getProjectService: vi.fn().mockResolvedValue(projectService),
    });

    await expect(
      tool.execute("tool-call-1", {
        taskId: "task-123",
        addAssigneeActorIds: ["actor-archived"],
      })
    ).rejects.toThrow(
      "task_update failed: actor is archived and unavailable for new assignment: actor-archived"
    );
  });

  it("preserves existing stale unauthorized assignees during non-additive updates", async () => {
    const task = createTaskDetail({ assigneeActorIds: ["actor-user", "actor-stale"] });
    const taskService = {
      getTask: vi.fn().mockResolvedValue(task),
      updateTask: vi.fn().mockResolvedValue({ ...task, title: "Updated title" }),
    } as unknown as TaskService;
    const actorService = {
      listActors: vi.fn().mockResolvedValue([
        { id: "actor-user", displayName: "Erik", archived: false },
        { id: "actor-stale", displayName: "Stale", archived: false },
      ]),
    } as never;
    const projectService = {
      getProject: vi
        .fn()
        .mockResolvedValue(createProjectSummary({ authorizedAssigneeActorIds: ["actor-user"] })),
    } as never;
    const tool = createTaskUpdateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
      getActorService: vi.fn().mockResolvedValue(actorService),
      getProjectService: vi.fn().mockResolvedValue(projectService),
    });

    await tool.execute("tool-call-1", {
      taskId: "task-123",
      title: "Updated title",
      assigneeActorIds: ["actor-user", "actor-stale"],
    });

    expect(taskService.updateTask).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeActorIds: ["actor-user", "actor-stale"] })
    );
  });
  it("updates supported fields and returns structured details", async () => {
    const task = createTaskDetail({
      title: "Updated task title",
      status: "inprogress",
      priority: "medium",
      description: null,
      labels: ["foundation", "ui"],
    });
    const taskService = {
      getTask: vi.fn().mockResolvedValue(createTaskDetail({ labels: ["foundation"] })),
      updateTask: vi.fn().mockResolvedValue(task),
    } as unknown as TaskService;
    const tool = createTaskUpdateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    const result = await tool.execute("tool-call-1", {
      taskId: " task-123 ",
      title: "  Updated task title  ",
      status: "inprogress",
      priority: "medium",
      description: "   ",
      labels: ["UI"],
    });

    expect(taskService.updateTask).toHaveBeenCalledWith({
      taskId: "task-123",
      title: "Updated task title",
      status: "inprogress",
      priority: "medium",
      description: null,
      labels: ["foundation", "ui"],
    });
    expect(result.content[0]?.text).toContain(`Updated task ${task.id}: ${task.title}`);
    expect(result.content[0]?.text).toContain(
      'Changes: title="Updated task title", status=inprogress, priority=medium, description=cleared, labels=["foundation","ui"]'
    );
    expect(result.details).toEqual({
      kind: "task_update",
      input: {
        taskId: "task-123",
        title: "Updated task title",
        status: "inprogress",
        priority: "medium",
        description: null,
        labels: ["foundation", "ui"],
      },
      task,
    });
  });

  it("fails fast with contextual output when no supported fields are provided", async () => {
    const tool = createTaskUpdateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
    });

    await expect(tool.execute("tool-call-1", { taskId: "task-123" })).rejects.toThrow(
      "task_update failed: task_update requires at least one supported field: title, status, priority, description, labels, or assigneeActorIds"
    );
  });

  it("surfaces title validation failures with tool-specific context", async () => {
    const tool = createTaskUpdateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
    });

    await expect(
      tool.execute("tool-call-1", {
        taskId: "task-123",
        title: "   ",
      })
    ).rejects.toThrow("task_update failed: title is required");
  });

  it("surfaces service failures with tool-specific context", async () => {
    const tool = createTaskUpdateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({
        updateTask: vi.fn().mockRejectedValue(new Error("daemon unavailable")),
      } as unknown as TaskService),
    });

    await expect(
      tool.execute("tool-call-1", {
        taskId: "task-123",
        status: "done",
      })
    ).rejects.toThrow("task_update failed: daemon unavailable");
  });
});

describe("createTaskCommentCreateToolDefinition", () => {
  it("adds a task comment and returns structured details", async () => {
    const comment = createTaskComment();
    const taskService = {
      addTaskComment: vi.fn().mockResolvedValue(comment),
    } as unknown as TaskService;
    const tool = createTaskCommentCreateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    const result = await tool.execute("tool-call-1", {
      taskId: " task-123 ",
      content: "  Added a note  ",
    });

    expect(taskService.addTaskComment).toHaveBeenCalledWith({
      taskId: "task-123",
      content: "Added a note",
    });
    expect(result.content[0]?.text).toBe("Added comment comment-1 to task task-123.");
    expect(result.details).toEqual({
      kind: "task_comment_create",
      taskId: "task-123",
      comment,
    });
  });

  it("surfaces validation failures with tool-specific context", async () => {
    const tool = createTaskCommentCreateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
    });

    await expect(
      tool.execute("tool-call-1", {
        taskId: "task-123",
        content: "   ",
      })
    ).rejects.toThrow("task_comment_create failed: content is required");
  });

  it("surfaces service failures with tool-specific context", async () => {
    const tool = createTaskCommentCreateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({
        addTaskComment: vi.fn().mockRejectedValue(new Error("daemon unavailable")),
      } as unknown as TaskService),
    });

    await expect(
      tool.execute("tool-call-1", {
        taskId: "task-123",
        content: "Added a note",
      })
    ).rejects.toThrow("task_comment_create failed: daemon unavailable");
  });
});

describe("registerTools", () => {
  it("registers the task_delete tool", () => {
    const pi = { registerTool: vi.fn() };

    registerTools(pi as never, {
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
    });

    const registeredToolNames = pi.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(registeredToolNames).toEqual(expect.arrayContaining(["task_delete"]));
  });
});

describe("createTaskDeleteToolDefinition", () => {
  it("deletes a task and returns structured details", async () => {
    const taskService = {
      deleteTask: vi.fn().mockResolvedValue({ taskId: "task-1", deleted: true }),
    } as unknown as TaskService;

    const tool = createTaskDeleteToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    const result = await tool.execute("tc-1", { taskId: "task-1" });

    expect(result.content[0]?.text).toContain("Deleted task task-1");
    expect(result.details).toMatchObject({
      kind: "task_delete",
      taskId: "task-1",
      found: true,
      deleted: true,
    });
  });

  it("returns not-found when task does not exist", async () => {
    const taskService = {
      deleteTask: vi.fn().mockRejectedValue(
        new ToduTaskServiceError({
          operation: "deleteTask",
          causeCode: "not-found",
          message: "deleteTask failed",
        })
      ),
    } as unknown as TaskService;

    const tool = createTaskDeleteToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    const result = await tool.execute("tc-1", { taskId: "task-missing" });

    expect(result.content[0]?.text).toContain("Task not found: task-missing");
    expect(result.details).toMatchObject({
      kind: "task_delete",
      taskId: "task-missing",
      found: false,
      deleted: false,
    });
  });

  it("rejects empty taskId", async () => {
    const tool = createTaskDeleteToolDefinition({
      getTaskService: vi.fn(),
    });

    await expect(tool.execute("tc-1", { taskId: "  " })).rejects.toThrow("taskId is required");
  });

  it("throws on non-not-found service errors", async () => {
    const taskService = {
      deleteTask: vi.fn().mockRejectedValue(new Error("connection lost")),
    } as unknown as TaskService;

    const tool = createTaskDeleteToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    await expect(tool.execute("tc-1", { taskId: "task-1" })).rejects.toThrow("task_delete failed");
  });
});

describe("createTaskMoveToolDefinition", () => {
  it("registers the task_move tool", () => {
    const pi = { registerTool: vi.fn() };

    registerTools(pi as never, {
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
    });

    const registeredToolNames = pi.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(registeredToolNames).toEqual(expect.arrayContaining(["task_move"]));
  });

  it("moves a task and returns structured details", async () => {
    const targetTask = createTaskDetail({
      id: "task-new",
      projectId: "proj-2",
      projectName: "Target",
    });
    const taskService = {
      moveTask: vi.fn().mockResolvedValue({ sourceTaskId: "task-1", targetTask }),
      getProject: vi.fn().mockResolvedValue({ id: "proj-2", name: "Target" }),
      listProjects: vi.fn().mockResolvedValue([{ id: "proj-2", name: "Target" }]),
    } as unknown as TaskService;

    const tool = createTaskMoveToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    const result = await tool.execute("tc-1", { taskId: "task-1", projectId: "proj-2" });

    expect(result.content[0]?.text).toContain("Moved task task-1");
    expect(result.content[0]?.text).toContain("task-new");
    expect(result.details).toMatchObject({
      kind: "task_move",
      sourceTaskId: "task-1",
      found: true,
      moved: true,
    });
  });

  it("resolves project by name", async () => {
    const targetTask = createTaskDetail({
      id: "task-new",
      projectId: "proj-2",
      projectName: "Target",
    });
    const taskService = {
      moveTask: vi.fn().mockResolvedValue({ sourceTaskId: "task-1", targetTask }),
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi
        .fn()
        .mockResolvedValue([
          { id: "proj-2", name: "Target", status: "active", priority: "medium" },
        ]),
    } as unknown as TaskService;

    const tool = createTaskMoveToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    const result = await tool.execute("tc-1", { taskId: "task-1", projectId: "Target" });

    expect(taskService.moveTask).toHaveBeenCalledWith({
      taskId: "task-1",
      targetProjectId: "proj-2",
    });
    expect(result.details).toMatchObject({ kind: "task_move", moved: true });
  });

  it("returns not-found when task does not exist", async () => {
    const taskService = {
      moveTask: vi.fn().mockRejectedValue(
        new ToduTaskServiceError({
          operation: "moveTask",
          causeCode: "not-found",
          message: "moveTask failed",
        })
      ),
      getProject: vi.fn().mockResolvedValue({ id: "proj-2", name: "Target" }),
      listProjects: vi.fn(),
    } as unknown as TaskService;

    const tool = createTaskMoveToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    const result = await tool.execute("tc-1", { taskId: "task-missing", projectId: "proj-2" });

    expect(result.content[0]?.text).toContain("Task not found: task-missing");
    expect(result.details).toMatchObject({ kind: "task_move", found: false, moved: false });
  });

  it("throws when project is not found", async () => {
    const taskService = {
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi.fn().mockResolvedValue([]),
    } as unknown as TaskService;

    const tool = createTaskMoveToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    await expect(
      tool.execute("tc-1", { taskId: "task-1", projectId: "NonExistent" })
    ).rejects.toThrow("project not found");
  });

  it("rejects empty taskId", async () => {
    const tool = createTaskMoveToolDefinition({
      getTaskService: vi.fn(),
    });

    await expect(tool.execute("tc-1", { taskId: "  ", projectId: "proj-2" })).rejects.toThrow(
      "taskId is required"
    );
  });

  it("rejects empty projectId", async () => {
    const tool = createTaskMoveToolDefinition({
      getTaskService: vi.fn(),
    });

    await expect(tool.execute("tc-1", { taskId: "task-1", projectId: "  " })).rejects.toThrow(
      "projectId is required"
    );
  });
});
