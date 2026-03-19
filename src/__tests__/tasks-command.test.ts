import { describe, expect, it, vi } from "vitest";

import type { TaskDetail, TaskSummary } from "@/domain/task";
import {
  createTaskClearCommandHandler,
  createTaskCommandHandler,
  createTasksCommandHandler,
  DEFAULT_BROWSE_TASKS_FILTER,
  openSelectedTaskDetail,
  openTaskDetailHub,
  registerCommands,
  resolveRequestedTaskId,
} from "@/extension/register-commands";
import type { TaskService } from "@/services/task-service";

const createTaskSummary = (): TaskSummary => ({
  id: "task-123",
  title: "Implement /tasks",
  status: "active",
  priority: "high",
  projectId: "proj-1",
  projectName: "Todu Pi Extensions",
  labels: ["ui"],
});

const createTaskDetail = (overrides: Partial<TaskDetail> = {}): TaskDetail => ({
  ...createTaskSummary(),
  description: "Build the first task browse flow",
  comments: [],
  ...overrides,
});

const createCommandContext = () => ({
  hasUI: true,
  ui: {
    notify: vi.fn(),
    setEditorText: vi.fn(),
    editor: vi.fn(),
    custom: vi.fn(),
  },
});

describe("registerCommands", () => {
  it("registers the /tasks, /task, and /task-clear commands", () => {
    const pi = {
      appendEntry: vi.fn(),
      registerCommand: vi.fn(),
    };

    registerCommands(pi as never);

    expect(pi.registerCommand).toHaveBeenCalledWith(
      "tasks",
      expect.objectContaining({
        description: "Browse active todu tasks",
        handler: expect.any(Function),
      })
    );
    expect(pi.registerCommand).toHaveBeenCalledWith(
      "task",
      expect.objectContaining({
        description: "Show the current task or a specific task by ID",
        handler: expect.any(Function),
      })
    );
    expect(pi.registerCommand).toHaveBeenCalledWith(
      "task-clear",
      expect.objectContaining({
        description: "Clear the current task context",
        handler: expect.any(Function),
      })
    );
  });
});

describe("createTasksCommandHandler", () => {
  it("requires interactive mode without calling UI APIs", async () => {
    const context = createCommandContext();
    context.hasUI = false;
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const handler = createTasksCommandHandler();

    await handler("", context as never);

    expect(stderrWrite).toHaveBeenCalledWith("/tasks requires interactive mode\n");
    expect(context.ui.notify).not.toHaveBeenCalled();

    stderrWrite.mockRestore();
  });

  it("shows the empty state when there are no active tasks", async () => {
    const context = createCommandContext();
    const taskService = {} as TaskService;
    const getTaskService = vi.fn().mockResolvedValue(taskService);
    const loadTasks = vi.fn().mockResolvedValue({ status: "loaded", tasks: [] });
    const showEmptyState = vi.fn().mockResolvedValue(undefined);

    const handler = createTasksCommandHandler({
      getTaskService,
      loadTasks,
      showEmptyState,
    });

    await handler("", context as never);

    expect(getTaskService).toHaveBeenCalledTimes(1);
    expect(loadTasks).toHaveBeenCalledWith(context, taskService);
    expect(showEmptyState).toHaveBeenCalledWith(context);
    expect(context.ui.notify).not.toHaveBeenCalled();
  });

  it("reports cancellation after the picker closes without a selection", async () => {
    const context = createCommandContext();
    const taskService = {} as TaskService;
    const task = createTaskSummary();
    const handler = createTasksCommandHandler({
      getTaskService: vi.fn().mockResolvedValue(taskService),
      loadTasks: vi.fn().mockResolvedValue({ status: "loaded", tasks: [task] }),
      selectTask: vi.fn().mockResolvedValue(null),
    });

    await handler("", context as never);

    expect(context.ui.notify).toHaveBeenCalledWith("Task browse cancelled", "info");
    expect(context.ui.setEditorText).not.toHaveBeenCalled();
  });

  it("opens the selected task detail after a successful selection", async () => {
    const context = createCommandContext();
    const taskService = {} as TaskService;
    const task = createTaskSummary();
    const openTaskDetail = vi.fn().mockResolvedValue(undefined);
    const handler = createTasksCommandHandler({
      getTaskService: vi.fn().mockResolvedValue(taskService),
      loadTasks: vi.fn().mockResolvedValue({ status: "loaded", tasks: [task] }),
      selectTask: vi.fn().mockResolvedValue(task.id),
      openTaskDetail,
    });

    await handler("", context as never);

    expect(openTaskDetail).toHaveBeenCalledWith(context, taskService, task.id);
  });

  it("reports task loading errors", async () => {
    const context = createCommandContext();
    const handler = createTasksCommandHandler({
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
      loadTasks: vi.fn().mockResolvedValue({
        status: "error",
        message: "Failed to load active tasks: daemon unavailable",
      }),
    });

    await handler("", context as never);

    expect(context.ui.notify).toHaveBeenCalledWith(
      "Failed to load active tasks: daemon unavailable",
      "error"
    );
  });

  it("keeps the browse flow scoped to active tasks by default", () => {
    expect(DEFAULT_BROWSE_TASKS_FILTER).toEqual({ statuses: ["active"] });
  });
});

describe("createTaskCommandHandler", () => {
  it("uses the explicit task id when provided", async () => {
    const context = createCommandContext();
    const taskService = {} as TaskService;
    const openTaskDetail = vi.fn().mockResolvedValue(undefined);
    const handler = createTaskCommandHandler({
      getTaskService: vi.fn().mockResolvedValue(taskService),
      getCurrentTaskId: vi.fn().mockReturnValue("task-current"),
      openTaskDetail,
    });

    await handler("task-123", context as never);

    expect(openTaskDetail).toHaveBeenCalledWith(context, taskService, "task-123");
  });

  it("falls back to the current task id when no explicit id is given", async () => {
    const context = createCommandContext();
    const taskService = {} as TaskService;
    const openTaskDetail = vi.fn().mockResolvedValue(undefined);
    const handler = createTaskCommandHandler({
      getTaskService: vi.fn().mockResolvedValue(taskService),
      getCurrentTaskId: vi.fn().mockReturnValue("task-current"),
      openTaskDetail,
    });

    await handler("", context as never);

    expect(openTaskDetail).toHaveBeenCalledWith(context, taskService, "task-current");
  });

  it("warns when there is no explicit or current task id", async () => {
    const context = createCommandContext();
    const handler = createTaskCommandHandler({
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
      getCurrentTaskId: vi.fn().mockReturnValue(null),
    });

    await handler("", context as never);

    expect(context.ui.notify).toHaveBeenCalledWith(
      "No task selected. Run /tasks or pass a task ID.",
      "warning"
    );
  });
});

describe("createTaskClearCommandHandler", () => {
  it("clears the current task in interactive mode", async () => {
    const context = createCommandContext();
    const clearCurrentTask = vi.fn().mockResolvedValue(undefined);
    const handler = createTaskClearCommandHandler({
      getCurrentTaskId: vi.fn().mockReturnValue("task-current"),
      clearCurrentTask,
    });

    await handler("", context as never);

    expect(clearCurrentTask).toHaveBeenCalledWith(context);
    expect(context.ui.notify).toHaveBeenCalledWith("Cleared current task", "info");
  });

  it("reports when there is no current task in interactive mode", async () => {
    const context = createCommandContext();
    const clearCurrentTask = vi.fn().mockResolvedValue(undefined);
    const handler = createTaskClearCommandHandler({
      getCurrentTaskId: vi.fn().mockReturnValue(null),
      clearCurrentTask,
    });

    await handler("", context as never);

    expect(clearCurrentTask).not.toHaveBeenCalled();
    expect(context.ui.notify).toHaveBeenCalledWith("No current task to clear", "info");
  });

  it("prints a success message in non-interactive mode", async () => {
    const context = createCommandContext();
    context.hasUI = false;
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const clearCurrentTask = vi.fn().mockResolvedValue(undefined);
    const handler = createTaskClearCommandHandler({
      getCurrentTaskId: vi.fn().mockReturnValue("task-current"),
      clearCurrentTask,
    });

    await handler("", context as never);

    expect(clearCurrentTask).toHaveBeenCalledWith(context);
    expect(stdoutWrite).toHaveBeenCalledWith("Cleared current task\n");

    stdoutWrite.mockRestore();
  });
});

describe("openSelectedTaskDetail", () => {
  it("opens the detail hub without mutating current task context", async () => {
    const context = createCommandContext();
    const taskDetail = createTaskDetail();
    const setCurrentTask = vi.fn().mockResolvedValue(undefined);
    const taskService = {
      getTask: vi.fn().mockResolvedValue(taskDetail),
      updateTask: vi.fn(),
      addTaskComment: vi.fn(),
    } as unknown as TaskService;

    await openSelectedTaskDetail(context as never, taskService, taskDetail.id, {
      setCurrentTask,
      showTaskDetailView: vi.fn().mockResolvedValue(null),
    });

    expect(taskService.getTask).toHaveBeenCalledWith(taskDetail.id);
    expect(setCurrentTask).not.toHaveBeenCalled();
  });
});

describe("openTaskDetailHub", () => {
  it("updates task status from the detail hub", async () => {
    const context = createCommandContext();
    const initialTask = createTaskDetail();
    const updatedTask = createTaskDetail({ status: "done" });
    const taskService = {
      getTask: vi.fn().mockResolvedValueOnce(initialTask).mockResolvedValueOnce(updatedTask),
      updateTask: vi.fn().mockResolvedValue(updatedTask),
      addTaskComment: vi.fn(),
    } as unknown as TaskService;

    await openTaskDetailHub(context as never, taskService, initialTask.id, {
      setCurrentTask: vi.fn().mockResolvedValue(undefined),
      showTaskDetailView: vi
        .fn()
        .mockResolvedValueOnce("update-status")
        .mockResolvedValueOnce(null),
      selectTaskStatus: vi.fn().mockResolvedValue("done"),
    });

    expect(taskService.updateTask).toHaveBeenCalledWith({
      taskId: initialTask.id,
      status: "done",
    });
    expect(context.ui.notify).toHaveBeenCalledWith(`Updated ${initialTask.title} to done`, "info");
  });

  it("updates task priority from the detail hub", async () => {
    const context = createCommandContext();
    const initialTask = createTaskDetail();
    const updatedTask = createTaskDetail({ priority: "low" });
    const setCurrentTask = vi.fn().mockResolvedValue(undefined);
    const taskService = {
      getTask: vi.fn().mockResolvedValueOnce(initialTask).mockResolvedValueOnce(updatedTask),
      updateTask: vi.fn().mockResolvedValue(updatedTask),
      addTaskComment: vi.fn(),
    } as unknown as TaskService;

    await openTaskDetailHub(context as never, taskService, initialTask.id, {
      setCurrentTask,
      showTaskDetailView: vi
        .fn()
        .mockResolvedValueOnce("update-priority")
        .mockResolvedValueOnce(null),
      selectTaskPriority: vi.fn().mockResolvedValue("low"),
    });

    expect(taskService.updateTask).toHaveBeenCalledWith({
      taskId: initialTask.id,
      priority: "low",
    });
    expect(context.ui.notify).toHaveBeenCalledWith(
      `Updated ${initialTask.title} priority to low`,
      "info"
    );
    expect(setCurrentTask).not.toHaveBeenCalled();
  });

  it("surfaces status update failures without leaving the detail hub", async () => {
    const context = createCommandContext();
    const task = createTaskDetail();
    const showTaskDetailView = vi
      .fn()
      .mockResolvedValueOnce("update-status")
      .mockResolvedValueOnce(null);
    const taskService = {
      getTask: vi.fn().mockResolvedValue(task),
      updateTask: vi.fn().mockRejectedValue(new Error("daemon unavailable")),
      addTaskComment: vi.fn(),
    } as unknown as TaskService;

    await openTaskDetailHub(context as never, taskService, task.id, {
      setCurrentTask: vi.fn().mockResolvedValue(undefined),
      showTaskDetailView,
      selectTaskStatus: vi.fn().mockResolvedValue("done"),
    });

    expect(context.ui.notify).toHaveBeenCalledWith(
      "Failed to update task status: daemon unavailable",
      "error"
    );
    expect(showTaskDetailView).toHaveBeenCalledTimes(2);
  });

  it("surfaces priority update failures without leaving the detail hub", async () => {
    const context = createCommandContext();
    const task = createTaskDetail();
    const showTaskDetailView = vi
      .fn()
      .mockResolvedValueOnce("update-priority")
      .mockResolvedValueOnce(null);
    const taskService = {
      getTask: vi.fn().mockResolvedValue(task),
      updateTask: vi.fn().mockRejectedValue(new Error("daemon unavailable")),
      addTaskComment: vi.fn(),
    } as unknown as TaskService;

    await openTaskDetailHub(context as never, taskService, task.id, {
      setCurrentTask: vi.fn().mockResolvedValue(undefined),
      showTaskDetailView,
      selectTaskPriority: vi.fn().mockResolvedValue("low"),
    });

    expect(context.ui.notify).toHaveBeenCalledWith(
      "Failed to update task priority: daemon unavailable",
      "error"
    );
    expect(showTaskDetailView).toHaveBeenCalledTimes(2);
  });

  it("does not update task priority when the selected value is unchanged", async () => {
    const context = createCommandContext();
    const task = createTaskDetail();
    const taskService = {
      getTask: vi.fn().mockResolvedValue(task),
      updateTask: vi.fn(),
      addTaskComment: vi.fn(),
    } as unknown as TaskService;

    await openTaskDetailHub(context as never, taskService, task.id, {
      setCurrentTask: vi.fn().mockResolvedValue(undefined),
      showTaskDetailView: vi
        .fn()
        .mockResolvedValueOnce("update-priority")
        .mockResolvedValueOnce(null),
      selectTaskPriority: vi.fn().mockResolvedValue(task.priority),
    });

    expect(taskService.updateTask).not.toHaveBeenCalled();
  });

  it("adds a comment from the detail hub", async () => {
    const context = createCommandContext();
    const task = createTaskDetail();
    const refreshedTask = createTaskDetail({
      comments: [
        {
          id: "comment-1",
          taskId: task.id,
          content: "Looks good",
          author: "user",
          createdAt: "2026-03-19T00:00:00.000Z",
        },
      ],
    });
    const taskService = {
      getTask: vi.fn().mockResolvedValueOnce(task).mockResolvedValueOnce(refreshedTask),
      updateTask: vi.fn(),
      addTaskComment: vi.fn().mockResolvedValue(refreshedTask.comments[0]),
    } as unknown as TaskService;

    await openTaskDetailHub(context as never, taskService, task.id, {
      setCurrentTask: vi.fn().mockResolvedValue(undefined),
      showTaskDetailView: vi.fn().mockResolvedValueOnce("comment").mockResolvedValueOnce(null),
      editTaskComment: vi.fn().mockResolvedValue("Looks good"),
    });

    expect(taskService.addTaskComment).toHaveBeenCalledWith({
      taskId: task.id,
      content: "Looks good",
    });
    expect(context.ui.notify).toHaveBeenCalledWith(`Added comment to ${task.title}`, "info");
  });
});

describe("resolveRequestedTaskId", () => {
  it("prefers explicit args over current task id", () => {
    expect(resolveRequestedTaskId("task-123", "task-current")).toBe("task-123");
  });

  it("falls back to current task id when args are empty", () => {
    expect(resolveRequestedTaskId("   ", "task-current")).toBe("task-current");
  });
});
