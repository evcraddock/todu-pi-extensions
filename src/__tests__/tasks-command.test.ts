import { describe, expect, it, vi } from "vitest";

import type { TaskDetail, TaskSummary } from "@/domain/task";
import {
  createTasksCommandHandler,
  DEFAULT_BROWSE_TASKS_FILTER,
  openSelectedTaskDetail,
  registerCommands,
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

const createTaskDetail = (): TaskDetail => ({
  ...createTaskSummary(),
  description: "Build the first task browse flow",
  comments: [],
});

const createCommandContext = () => ({
  hasUI: true,
  ui: {
    notify: vi.fn(),
    setEditorText: vi.fn(),
  },
});

describe("registerCommands", () => {
  it("registers the /tasks command", () => {
    const pi = {
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
  });
});

describe("createTasksCommandHandler", () => {
  it("requires interactive mode", async () => {
    const context = createCommandContext();
    context.hasUI = false;
    const handler = createTasksCommandHandler();

    await handler("", context as never);

    expect(context.ui.notify).toHaveBeenCalledWith("/tasks requires interactive mode", "error");
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

describe("openSelectedTaskDetail", () => {
  it("loads the task detail into the editor", async () => {
    const context = createCommandContext();
    const taskDetail = createTaskDetail();
    const taskService = {
      getTask: vi.fn().mockResolvedValue(taskDetail),
    } as unknown as TaskService;

    await openSelectedTaskDetail(context as never, taskService, taskDetail.id);

    expect(taskService.getTask).toHaveBeenCalledWith(taskDetail.id);
    expect(context.ui.setEditorText).toHaveBeenCalledWith(
      "Implement /tasks\nBuild the first task browse flow"
    );
    expect(context.ui.notify).toHaveBeenCalledWith(
      "Loaded task detail for Implement /tasks",
      "info"
    );
  });

  it("warns when the selected task disappears", async () => {
    const context = createCommandContext();
    const taskService = {
      getTask: vi.fn().mockResolvedValue(null),
    } as unknown as TaskService;

    await openSelectedTaskDetail(context as never, taskService, "task-123");

    expect(context.ui.notify).toHaveBeenCalledWith("Selected task no longer exists", "warning");
    expect(context.ui.setEditorText).not.toHaveBeenCalled();
  });
});
