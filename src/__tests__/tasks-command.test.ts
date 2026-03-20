import { describe, expect, it, vi } from "vitest";

import type { ProjectSummary, TaskDetail, TaskSummary } from "@/domain/task";
import {
  createTaskClearCommandHandler,
  createTaskCommandHandler,
  createTaskNewCommandHandler,
  createTasksCommandHandler,
  DEFAULT_TASK_BROWSE_FILTER_STATE,
  openSelectedTaskDetail,
  openTaskDetailHub,
  registerCommands,
  resolveRequestedTaskId,
  showTaskBrowseFilterMode,
} from "@/extension/register-commands";
import { createTaskBrowseFilterState } from "@/services/task-browse-filter-store";
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

const createProjectSummary = (overrides: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: "proj-1",
  name: "Todu Pi Extensions",
  status: "active",
  priority: "medium",
  description: "Primary project",
  ...overrides,
});

const createCommandContext = () => ({
  hasUI: true,
  sessionManager: {
    getBranch: vi.fn().mockReturnValue([]),
  },
  ui: {
    notify: vi.fn(),
    setEditorText: vi.fn(),
    input: vi.fn(),
    editor: vi.fn(),
    custom: vi.fn(),
  },
});

const createTaskBrowseFilterController = (initialState = createTaskBrowseFilterState()) => {
  let state = initialState;

  return {
    restoreFromBranch: vi.fn().mockImplementation(async () => undefined),
    getState: vi.fn().mockImplementation(() => state),
    setState: vi.fn().mockImplementation(async (_ctx, nextState) => {
      state = nextState;
    }),
    clear: vi.fn().mockImplementation(async () => {
      state = createTaskBrowseFilterState();
    }),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
};

describe("registerCommands", () => {
  it("registers the /tasks, /task, /task-clear, and /task-new commands", () => {
    const pi = {
      appendEntry: vi.fn(),
      registerCommand: vi.fn(),
    };

    registerCommands(pi as never);

    expect(pi.registerCommand).toHaveBeenCalledWith(
      "tasks",
      expect.objectContaining({
        description: "Browse and filter todu tasks",
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
    expect(pi.registerCommand).toHaveBeenCalledWith(
      "task-new",
      expect.objectContaining({
        description: "Create a new todu task",
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

  it("enters filter mode on the first /tasks run", async () => {
    const context = createCommandContext();
    const taskService = {} as TaskService;
    const task = createTaskSummary();
    const taskBrowseFilterController = createTaskBrowseFilterController();
    const editTaskBrowseFilters = vi.fn().mockResolvedValue({
      status: "saved",
      filterState: createTaskBrowseFilterState({
        hasSavedFilter: true,
        status: "active",
      }),
    });
    const loadTasks = vi.fn().mockResolvedValue({ status: "loaded", tasks: [task] });
    const showTaskBrowseView = vi.fn().mockResolvedValue({ status: "closed" });
    const handler = createTasksCommandHandler({
      getTaskService: vi.fn().mockResolvedValue(taskService),
      taskBrowseFilterController: taskBrowseFilterController as never,
      editTaskBrowseFilters,
      loadTasks,
      showTaskBrowseView,
    });

    await handler("", context as never);

    expect(taskBrowseFilterController.restoreFromBranch).toHaveBeenCalledWith(context);
    expect(editTaskBrowseFilters).toHaveBeenCalledWith(
      context,
      taskService,
      createTaskBrowseFilterState()
    );
    expect(taskBrowseFilterController.setState).toHaveBeenCalledWith(
      context,
      createTaskBrowseFilterState({ hasSavedFilter: true, status: "active" })
    );
    expect(loadTasks).toHaveBeenCalledWith(
      context,
      taskService,
      { statuses: ["active"], priorities: undefined, projectId: undefined },
      "Status Active • Priority Any • Project Any"
    );
  });

  it("reopens the saved filtered view on subsequent /tasks runs", async () => {
    const context = createCommandContext();
    const taskService = {} as TaskService;
    const task = createTaskSummary();
    const savedState = createTaskBrowseFilterState({
      hasSavedFilter: true,
      priority: "high",
      projectId: "proj-1",
      projectName: "Todu Pi Extensions",
    });
    const taskBrowseFilterController = createTaskBrowseFilterController(savedState);
    const loadTasks = vi.fn().mockResolvedValue({ status: "loaded", tasks: [task] });
    const showTaskBrowseView = vi.fn().mockResolvedValue({ status: "closed" });
    const editTaskBrowseFilters = vi.fn();
    const handler = createTasksCommandHandler({
      getTaskService: vi.fn().mockResolvedValue(taskService),
      taskBrowseFilterController: taskBrowseFilterController as never,
      editTaskBrowseFilters,
      loadTasks,
      showTaskBrowseView,
    });

    await handler("", context as never);

    expect(editTaskBrowseFilters).not.toHaveBeenCalled();
    expect(loadTasks).toHaveBeenCalledWith(
      context,
      taskService,
      { statuses: undefined, priorities: ["high"], projectId: "proj-1" },
      "Status Any • Priority High • Project Todu Pi Extensions"
    );
    expect(showTaskBrowseView).toHaveBeenCalledWith(context, [task], savedState);
  });

  it("lets view mode switch back to filter mode", async () => {
    const context = createCommandContext();
    const taskService = {} as TaskService;
    const task = createTaskSummary();
    const taskBrowseFilterController = createTaskBrowseFilterController(
      createTaskBrowseFilterState({ hasSavedFilter: true, status: "active" })
    );
    const loadTasks = vi
      .fn()
      .mockResolvedValueOnce({ status: "loaded", tasks: [task] })
      .mockResolvedValueOnce({ status: "loaded", tasks: [task] });
    const showTaskBrowseView = vi
      .fn()
      .mockResolvedValueOnce({ status: "change-filters" })
      .mockResolvedValueOnce({ status: "closed" });
    const editTaskBrowseFilters = vi.fn().mockResolvedValue({
      status: "saved",
      filterState: createTaskBrowseFilterState({ hasSavedFilter: true, priority: "medium" }),
    });
    const handler = createTasksCommandHandler({
      getTaskService: vi.fn().mockResolvedValue(taskService),
      taskBrowseFilterController: taskBrowseFilterController as never,
      editTaskBrowseFilters,
      loadTasks,
      showTaskBrowseView,
    });

    await handler("", context as never);

    expect(editTaskBrowseFilters).toHaveBeenCalledTimes(1);
    expect(taskBrowseFilterController.setState).toHaveBeenCalledWith(
      context,
      createTaskBrowseFilterState({ hasSavedFilter: true, priority: "medium" })
    );
  });

  it("opens the selected task detail after a successful selection", async () => {
    const context = createCommandContext();
    const taskService = {} as TaskService;
    const task = createTaskSummary();
    const openTaskDetail = vi.fn().mockResolvedValue(undefined);
    const handler = createTasksCommandHandler({
      getTaskService: vi.fn().mockResolvedValue(taskService),
      taskBrowseFilterController: createTaskBrowseFilterController(
        createTaskBrowseFilterState({ hasSavedFilter: true, status: "active" })
      ) as never,
      loadTasks: vi.fn().mockResolvedValue({ status: "loaded", tasks: [task] }),
      showTaskBrowseView: vi.fn().mockResolvedValue({ status: "selected", taskId: task.id }),
      openTaskDetail,
    });

    await handler("", context as never);

    expect(openTaskDetail).toHaveBeenCalledWith(context, taskService, task.id);
  });

  it("shows the empty filtered state when no tasks match", async () => {
    const context = createCommandContext();
    const taskService = {} as TaskService;
    const taskBrowseFilterController = createTaskBrowseFilterController(
      createTaskBrowseFilterState({ hasSavedFilter: true, status: "waiting" })
    );
    const loadTasks = vi.fn().mockResolvedValue({ status: "loaded", tasks: [] });
    const showEmptyState = vi.fn().mockResolvedValue("close");
    const handler = createTasksCommandHandler({
      getTaskService: vi.fn().mockResolvedValue(taskService),
      taskBrowseFilterController: taskBrowseFilterController as never,
      loadTasks,
      showEmptyState,
    });

    await handler("", context as never);

    expect(showEmptyState).toHaveBeenCalledWith(
      context,
      createTaskBrowseFilterState({ hasSavedFilter: true, status: "waiting" })
    );
  });

  it("clears saved filters from the empty state and reloads an unfiltered view", async () => {
    const context = createCommandContext();
    const taskService = {} as TaskService;
    const task = createTaskSummary();
    const taskBrowseFilterController = createTaskBrowseFilterController(
      createTaskBrowseFilterState({
        hasSavedFilter: true,
        status: "waiting",
        priority: "high",
        projectId: "proj-1",
        projectName: "Todu Pi Extensions",
      })
    );
    const loadTasks = vi
      .fn()
      .mockResolvedValueOnce({ status: "loaded", tasks: [] })
      .mockResolvedValueOnce({ status: "loaded", tasks: [task] });
    const showEmptyState = vi.fn().mockResolvedValue("clear-filters");
    const showTaskBrowseView = vi.fn().mockResolvedValue({ status: "closed" });
    const handler = createTasksCommandHandler({
      getTaskService: vi.fn().mockResolvedValue(taskService),
      taskBrowseFilterController: taskBrowseFilterController as never,
      loadTasks,
      showEmptyState,
      showTaskBrowseView,
    });

    await handler("", context as never);

    expect(taskBrowseFilterController.setState).toHaveBeenCalledWith(
      context,
      createTaskBrowseFilterState({
        hasSavedFilter: true,
        status: null,
        priority: null,
        projectId: null,
        projectName: null,
      })
    );
    expect(loadTasks).toHaveBeenLastCalledWith(
      context,
      taskService,
      { statuses: undefined, priorities: undefined, projectId: undefined },
      "Status Any • Priority Any • Project Any"
    );
  });

  it("reports task loading errors", async () => {
    const context = createCommandContext();
    const handler = createTasksCommandHandler({
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
      taskBrowseFilterController: createTaskBrowseFilterController(
        createTaskBrowseFilterState({ hasSavedFilter: true, status: "active" })
      ) as never,
      loadTasks: vi.fn().mockResolvedValue({
        status: "error",
        message: "Failed to load filtered tasks: daemon unavailable",
      }),
    });

    await handler("", context as never);

    expect(context.ui.notify).toHaveBeenCalledWith(
      "Failed to load filtered tasks: daemon unavailable",
      "error"
    );
  });

  it("starts with no saved filters by default", () => {
    expect(DEFAULT_TASK_BROWSE_FILTER_STATE).toEqual({
      hasSavedFilter: false,
      status: null,
      priority: null,
      projectId: null,
      projectName: null,
    });
  });
});

describe("showTaskBrowseFilterMode", () => {
  it("resets filters back to Any before applying", async () => {
    const context = createCommandContext();
    context.ui.custom = vi.fn().mockResolvedValueOnce("reset").mockResolvedValueOnce("apply");
    const taskService = {
      listProjects: vi.fn().mockResolvedValue([createProjectSummary()]),
    } as unknown as TaskService;

    const result = await showTaskBrowseFilterMode(
      context as never,
      taskService,
      createTaskBrowseFilterState({
        hasSavedFilter: true,
        status: "done",
        priority: "high",
        projectId: "proj-1",
        projectName: "Todu Pi Extensions",
      })
    );

    expect(result).toEqual({
      status: "saved",
      filterState: createTaskBrowseFilterState({
        hasSavedFilter: true,
        status: null,
        priority: null,
        projectId: null,
        projectName: null,
      }),
    });
    expect(taskService.listProjects).toHaveBeenCalledTimes(1);
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

describe("createTaskNewCommandHandler", () => {
  it("requires interactive mode without calling UI APIs", async () => {
    const context = createCommandContext();
    context.hasUI = false;
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const handler = createTaskNewCommandHandler();

    await handler("", context as never);

    expect(stderrWrite).toHaveBeenCalledWith("/task-new requires interactive mode\n");
    expect(context.ui.notify).not.toHaveBeenCalled();

    stderrWrite.mockRestore();
  });

  it("re-prompts when the title is blank before creating the task", async () => {
    const context = createCommandContext();
    context.ui.input = vi
      .fn()
      .mockResolvedValueOnce("   ")
      .mockResolvedValueOnce("Implement /task-new");
    const project = createProjectSummary();
    const createdTask = createTaskDetail({
      id: "task-new-1",
      title: "Implement /task-new",
      projectId: project.id,
      projectName: project.name,
    });
    const taskService = {
      createTask: vi.fn().mockResolvedValue(createdTask),
    } as unknown as TaskService;
    const setCurrentTask = vi.fn().mockResolvedValue(undefined);
    const openTaskDetail = vi.fn().mockResolvedValue(undefined);
    const handler = createTaskNewCommandHandler({
      getTaskService: vi.fn().mockResolvedValue(taskService),
      selectTaskProject: vi.fn().mockResolvedValue({ status: "selected", project }),
      editTaskDescription: vi.fn().mockResolvedValue(""),
      setCurrentTask,
      openTaskDetail,
    });

    await handler("", context as never);

    expect(context.ui.notify).toHaveBeenCalledWith("Task title is required", "warning");
    expect(taskService.createTask).toHaveBeenCalledWith({
      title: "Implement /task-new",
      projectId: project.id,
      description: null,
    });
    expect(setCurrentTask).not.toHaveBeenCalled();
    expect(openTaskDetail).toHaveBeenCalledWith(context, taskService, createdTask.id);
  });

  it("cancels cleanly when project selection is dismissed", async () => {
    const context = createCommandContext();
    const taskService = {
      createTask: vi.fn(),
    } as unknown as TaskService;
    const handler = createTaskNewCommandHandler({
      getTaskService: vi.fn().mockResolvedValue(taskService),
      promptTaskTitle: vi.fn().mockResolvedValue("Implement /task-new"),
      selectTaskProject: vi.fn().mockResolvedValue({ status: "cancelled" }),
      editTaskDescription: vi.fn(),
      openTaskDetail: vi.fn(),
      setCurrentTask: vi.fn(),
    });

    await handler("", context as never);

    expect(taskService.createTask).not.toHaveBeenCalled();
    expect(context.ui.notify).toHaveBeenCalledWith("Task creation cancelled", "info");
  });

  it("requires project selection before submission", async () => {
    const context = createCommandContext();
    const taskService = {
      createTask: vi.fn(),
    } as unknown as TaskService;
    const handler = createTaskNewCommandHandler({
      getTaskService: vi.fn().mockResolvedValue(taskService),
      promptTaskTitle: vi.fn().mockResolvedValue("Implement /task-new"),
      selectTaskProject: vi.fn().mockResolvedValue({ status: "unavailable" }),
      editTaskDescription: vi.fn(),
      openTaskDetail: vi.fn(),
      setCurrentTask: vi.fn(),
    });

    await handler("", context as never);

    expect(taskService.createTask).not.toHaveBeenCalled();
    expect(context.ui.notify).toHaveBeenCalledWith(
      "No projects available for new tasks",
      "warning"
    );
  });

  it("creates the task and opens task detail without changing the current task", async () => {
    const context = createCommandContext();
    const project = createProjectSummary();
    const createdTask = createTaskDetail({
      id: "task-new-1",
      title: "Implement /task-new",
      projectId: project.id,
      projectName: project.name,
    });
    const taskService = {
      createTask: vi.fn().mockResolvedValue(createdTask),
    } as unknown as TaskService;
    const setCurrentTask = vi.fn().mockResolvedValue(undefined);
    const openTaskDetail = vi.fn().mockResolvedValue(undefined);
    const handler = createTaskNewCommandHandler({
      getTaskService: vi.fn().mockResolvedValue(taskService),
      promptTaskTitle: vi.fn().mockResolvedValue("Implement /task-new"),
      selectTaskProject: vi.fn().mockResolvedValue({ status: "selected", project }),
      editTaskDescription: vi.fn().mockResolvedValue("Draft the first version"),
      setCurrentTask,
      openTaskDetail,
    });

    await handler("", context as never);

    expect(taskService.createTask).toHaveBeenCalledWith({
      title: "Implement /task-new",
      projectId: project.id,
      description: "Draft the first version",
    });
    expect(setCurrentTask).not.toHaveBeenCalled();
    expect(context.ui.notify).toHaveBeenCalledWith(`Created task ${createdTask.title}`, "info");
    expect(openTaskDetail).toHaveBeenCalledWith(context, taskService, createdTask.id);
  });

  it("surfaces creation failures with a contextual error", async () => {
    const context = createCommandContext();
    const project = createProjectSummary();
    const taskService = {
      createTask: vi.fn().mockRejectedValue(new Error("daemon unavailable")),
    } as unknown as TaskService;
    const handler = createTaskNewCommandHandler({
      getTaskService: vi.fn().mockResolvedValue(taskService),
      promptTaskTitle: vi.fn().mockResolvedValue("Implement /task-new"),
      selectTaskProject: vi.fn().mockResolvedValue({ status: "selected", project }),
      editTaskDescription: vi.fn().mockResolvedValue(""),
      setCurrentTask: vi.fn().mockResolvedValue(undefined),
      openTaskDetail: vi.fn().mockResolvedValue(undefined),
    });

    await handler("", context as never);

    expect(context.ui.notify).toHaveBeenCalledWith(
      "Failed to create task: daemon unavailable",
      "error"
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
