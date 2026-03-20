import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { BorderedLoader, DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@mariozechner/pi-tui";

import type {
  ProjectSummary,
  TaskDetail,
  TaskFilter,
  TaskId,
  TaskPriority,
  TaskStatus,
  TaskSummary,
} from "../domain/task";
import { browseTasks } from "../flows/browse-tasks";
import { commentOnTask } from "../flows/comment-on-task";
import { createTask } from "../flows/create-task";
import { showTaskDetail } from "../flows/show-task-detail";
import { updateTask } from "../flows/update-task";
import type { TaskService } from "../services/task-service";
import { getDefaultToduTaskServiceRuntime } from "../services/todu/default-task-service";
import type { TaskBrowseFilterState } from "../services/task-browse-filter-store";
import { createTaskBrowseFilterState } from "../services/task-browse-filter-store";
import {
  createTaskDetailActionItems,
  createTaskDetailViewModel,
  formatTaskPriorityLabel,
  formatTaskStatusLabel,
  type TaskDetailActionKind,
} from "../ui/components/task-detail";
import { createTaskListItem } from "../ui/components/task-list";
import { createTaskLoaderViewModel } from "../ui/components/loaders";
import {
  taskPriorityOptions,
  taskStatusOptions,
  type TaskSettingOption,
} from "../ui/components/task-settings";
import { getDefaultCurrentTaskContextController } from "./current-task-context";
import {
  getDefaultTaskBrowseFilterContextController,
  type TaskBrowseFilterContextController,
} from "./task-browse-filter-context";

const DEFAULT_TASK_BROWSE_FILTER_STATE: TaskBrowseFilterState = createTaskBrowseFilterState();

interface LoadedTasksResult {
  status: "loaded";
  tasks: TaskSummary[];
}

interface CancelledTasksResult {
  status: "cancelled";
}

interface ErrorTasksResult {
  status: "error";
  message: string;
}

type TaskBrowseLoadResult = LoadedTasksResult | CancelledTasksResult | ErrorTasksResult;

type SelectTaskProjectResult =
  | { status: "selected"; project: ProjectSummary }
  | { status: "cancelled" }
  | { status: "unavailable" };

interface TaskAuthoringDraft {
  title: string;
  description: string | null;
  projectName: string;
}

interface TaskAuthoringResult {
  title: string;
  description: string | null;
}

type EditTaskBrowseFiltersResult =
  | { status: "saved"; filterState: TaskBrowseFilterState }
  | { status: "cancelled" };

type TaskBrowseViewResult =
  | { status: "selected"; taskId: TaskId }
  | { status: "change-filters" }
  | { status: "clear-filters" }
  | { status: "closed" };

type EmptyTaskBrowseAction = "change-filters" | "clear-filters" | "close";

export interface RegisterCommandDependencies {
  getTaskService?: () => Promise<TaskService>;
  getCurrentTaskId?: () => TaskId | null;
  clearCurrentTask?: (ctx: ExtensionCommandContext) => Promise<void>;
  promptTaskTitle?: (ctx: ExtensionCommandContext) => Promise<string | null>;
  selectTaskProject?: (
    ctx: ExtensionCommandContext,
    taskService: TaskService
  ) => Promise<SelectTaskProjectResult>;
  editTaskExplanation?: (
    ctx: ExtensionCommandContext,
    taskTitle: string
  ) => Promise<string | undefined>;
  confirmTaskAuthoring?: (
    ctx: ExtensionCommandContext,
    draft: TaskAuthoringDraft
  ) => Promise<boolean>;
  requestTaskAuthoringAssistance?: (
    ctx: ExtensionCommandContext,
    draft: TaskAuthoringDraft
  ) => Promise<TaskAuthoringResult | null>;
  taskBrowseFilterController?: TaskBrowseFilterContextController;
  editTaskBrowseFilters?: (
    ctx: ExtensionCommandContext,
    taskService: TaskService,
    currentState: TaskBrowseFilterState
  ) => Promise<EditTaskBrowseFiltersResult>;
  loadTasks?: (
    ctx: ExtensionCommandContext,
    taskService: TaskService,
    filter: TaskFilter,
    filterSummary: string
  ) => Promise<TaskBrowseLoadResult>;
  showTaskBrowseView?: (
    ctx: ExtensionCommandContext,
    tasks: TaskSummary[],
    filterState: TaskBrowseFilterState
  ) => Promise<TaskBrowseViewResult>;
  showEmptyState?: (
    ctx: ExtensionCommandContext,
    filterState: TaskBrowseFilterState
  ) => Promise<EmptyTaskBrowseAction>;
  setCurrentTask?: (ctx: ExtensionCommandContext, task: TaskDetail) => Promise<void>;
  showTaskDetailView?: (
    ctx: ExtensionCommandContext,
    task: TaskDetail
  ) => Promise<TaskDetailActionKind | null>;
  selectTaskStatus?: (ctx: ExtensionCommandContext, task: TaskDetail) => Promise<TaskStatus | null>;
  selectTaskPriority?: (
    ctx: ExtensionCommandContext,
    task: TaskDetail
  ) => Promise<TaskPriority | null>;
  editTaskComment?: (ctx: ExtensionCommandContext, task: TaskDetail) => Promise<string | null>;
  openTaskDetail?: (
    ctx: ExtensionCommandContext,
    taskService: TaskService,
    taskId: TaskId
  ) => Promise<void>;
}

const createTasksCommandHandler = (
  dependencies: RegisterCommandDependencies = {}
): ((args: string, ctx: ExtensionCommandContext) => Promise<void>) => {
  const getTaskService =
    dependencies.getTaskService ?? (() => getDefaultToduTaskServiceRuntime().ensureConnected());
  const getTaskBrowseFilterController = () =>
    dependencies.taskBrowseFilterController ?? getDefaultTaskBrowseFilterContextController();
  const editTaskBrowseFilters = dependencies.editTaskBrowseFilters ?? showTaskBrowseFilterMode;
  const loadTasks = dependencies.loadTasks ?? loadTasksWithLoader;
  const showTaskBrowseView = dependencies.showTaskBrowseView ?? selectTaskBrowseViewAction;
  const showEmptyState = dependencies.showEmptyState ?? showEmptyTasksState;
  const setCurrentTask =
    dependencies.setCurrentTask ??
    ((ctx: ExtensionCommandContext, task: TaskDetail) =>
      getDefaultCurrentTaskContextController().setCurrentTask(ctx, task));
  const openTaskDetail =
    dependencies.openTaskDetail ??
    ((ctx: ExtensionCommandContext, taskService: TaskService, taskId: TaskId) =>
      openSelectedTaskDetail(ctx, taskService, taskId, {
        setCurrentTask,
        showTaskDetailView: dependencies.showTaskDetailView,
        selectTaskStatus: dependencies.selectTaskStatus,
        selectTaskPriority: dependencies.selectTaskPriority,
        editTaskComment: dependencies.editTaskComment,
      }));

  return async (_args: string, ctx: ExtensionCommandContext): Promise<void> => {
    if (!ctx.hasUI) {
      process.stderr.write("/tasks requires interactive mode\n");
      return;
    }

    try {
      const taskBrowseFilterController = getTaskBrowseFilterController();
      await taskBrowseFilterController.restoreFromBranch(ctx);
      const taskService = await getTaskService();
      let mode: "filter" | "view" = taskBrowseFilterController.getState().hasSavedFilter
        ? "view"
        : "filter";

      while (true) {
        if (mode === "filter") {
          const filterEditResult = await editTaskBrowseFilters(
            ctx,
            taskService,
            taskBrowseFilterController.getState()
          );

          if (filterEditResult.status === "cancelled") {
            ctx.ui.notify("Task browse cancelled", "info");
            return;
          }

          await taskBrowseFilterController.setState(ctx, filterEditResult.filterState);
          mode = "view";
          continue;
        }

        const filterState = taskBrowseFilterController.getState();
        const taskFilter = createTaskFilterFromBrowseState(filterState);
        const filterSummary = formatTaskBrowseFilterSummary(filterState);
        const loadedTasks = await loadTasks(ctx, taskService, taskFilter, filterSummary);

        if (loadedTasks.status === "cancelled") {
          ctx.ui.notify("Task browse cancelled", "info");
          return;
        }

        if (loadedTasks.status === "error") {
          ctx.ui.notify(loadedTasks.message, "error");
          return;
        }

        if (loadedTasks.tasks.length === 0) {
          const emptyAction = await showEmptyState(ctx, filterState);
          if (emptyAction === "change-filters") {
            mode = "filter";
            continue;
          }

          if (emptyAction === "clear-filters") {
            await taskBrowseFilterController.setState(ctx, createSavedTaskBrowseFilterState());
            continue;
          }

          return;
        }

        const browseViewResult = await showTaskBrowseView(ctx, loadedTasks.tasks, filterState);
        if (browseViewResult.status === "closed") {
          ctx.ui.notify("Task browse cancelled", "info");
          return;
        }

        if (browseViewResult.status === "change-filters") {
          mode = "filter";
          continue;
        }

        if (browseViewResult.status === "clear-filters") {
          await taskBrowseFilterController.setState(ctx, createSavedTaskBrowseFilterState());
          continue;
        }

        await openTaskDetail(ctx, taskService, browseViewResult.taskId);
        return;
      }
    } catch (error) {
      ctx.ui.notify(formatTasksCommandError(error, "Failed to browse tasks"), "error");
    }
  };
};

const createTaskCommandHandler = (
  dependencies: RegisterCommandDependencies = {}
): ((args: string, ctx: ExtensionCommandContext) => Promise<void>) => {
  const getTaskService =
    dependencies.getTaskService ?? (() => getDefaultToduTaskServiceRuntime().ensureConnected());
  const getCurrentTaskId =
    dependencies.getCurrentTaskId ??
    (() => getDefaultCurrentTaskContextController().getState().currentTaskId);
  const setCurrentTask =
    dependencies.setCurrentTask ??
    ((ctx: ExtensionCommandContext, task: TaskDetail) =>
      getDefaultCurrentTaskContextController().setCurrentTask(ctx, task));
  const openTaskDetail =
    dependencies.openTaskDetail ??
    ((ctx: ExtensionCommandContext, taskService: TaskService, taskId: TaskId) =>
      openTaskDetailHub(ctx, taskService, taskId, {
        setCurrentTask,
        showTaskDetailView: dependencies.showTaskDetailView,
        selectTaskStatus: dependencies.selectTaskStatus,
        selectTaskPriority: dependencies.selectTaskPriority,
        editTaskComment: dependencies.editTaskComment,
      }));

  return async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
    if (!ctx.hasUI) {
      process.stderr.write("/task requires interactive mode\n");
      return;
    }

    const requestedTaskId = resolveRequestedTaskId(args, getCurrentTaskId());
    if (!requestedTaskId) {
      ctx.ui.notify("No task selected. Run /tasks or pass a task ID.", "warning");
      return;
    }

    try {
      const taskService = await getTaskService();
      await openTaskDetail(ctx, taskService, requestedTaskId);
    } catch (error) {
      ctx.ui.notify(formatTasksCommandError(error, "Failed to open task detail"), "error");
    }
  };
};

const createTaskClearCommandHandler = (
  dependencies: RegisterCommandDependencies = {}
): ((args: string, ctx: ExtensionCommandContext) => Promise<void>) => {
  const getCurrentTaskId =
    dependencies.getCurrentTaskId ??
    (() => getDefaultCurrentTaskContextController().getState().currentTaskId);
  const clearCurrentTask =
    dependencies.clearCurrentTask ??
    ((ctx: ExtensionCommandContext) =>
      getDefaultCurrentTaskContextController().clearCurrentTask(ctx));

  return async (_args: string, ctx: ExtensionCommandContext): Promise<void> => {
    const currentTaskId = getCurrentTaskId();
    if (!currentTaskId) {
      if (ctx.hasUI) {
        ctx.ui.notify("No current task to clear", "info");
        return;
      }

      process.stdout.write("No current task to clear\n");
      return;
    }

    try {
      await clearCurrentTask(ctx);
      if (ctx.hasUI) {
        ctx.ui.notify("Cleared current task", "info");
        return;
      }

      process.stdout.write("Cleared current task\n");
    } catch (error) {
      if (ctx.hasUI) {
        ctx.ui.notify(formatTasksCommandError(error, "Failed to clear current task"), "error");
        return;
      }

      process.stderr.write(`${formatTasksCommandError(error, "Failed to clear current task")}\n`);
    }
  };
};

const createTaskNewCommandHandler = (
  dependencies: RegisterCommandDependencies = {}
): ((args: string, ctx: ExtensionCommandContext) => Promise<void>) => {
  const getTaskService =
    dependencies.getTaskService ?? (() => getDefaultToduTaskServiceRuntime().ensureConnected());
  const promptTaskTitle = dependencies.promptTaskTitle ?? promptRequiredTaskTitle;
  const selectTaskProject = dependencies.selectTaskProject ?? selectProjectForTaskCreation;
  const editTaskExplanation = dependencies.editTaskExplanation ?? editNewTaskExplanation;
  const confirmTaskAuthoring = dependencies.confirmTaskAuthoring ?? confirmTaskAuthoringHelp;
  const requestTaskAuthoringAssistance = dependencies.requestTaskAuthoringAssistance;
  const setCurrentTask =
    dependencies.setCurrentTask ??
    ((ctx: ExtensionCommandContext, task: TaskDetail) =>
      getDefaultCurrentTaskContextController().setCurrentTask(ctx, task));
  const openTaskDetail =
    dependencies.openTaskDetail ??
    ((ctx: ExtensionCommandContext, taskService: TaskService, taskId: TaskId) =>
      openTaskDetailHub(ctx, taskService, taskId, {
        setCurrentTask,
        showTaskDetailView: dependencies.showTaskDetailView,
        selectTaskStatus: dependencies.selectTaskStatus,
        selectTaskPriority: dependencies.selectTaskPriority,
        editTaskComment: dependencies.editTaskComment,
      }));

  return async (_args: string, ctx: ExtensionCommandContext): Promise<void> => {
    if (!ctx.hasUI) {
      process.stderr.write("/task-new requires interactive mode\n");
      return;
    }

    const title = await promptTaskTitle(ctx);
    if (!title) {
      ctx.ui.notify("Task creation cancelled", "info");
      return;
    }

    let taskService: TaskService;
    try {
      taskService = await getTaskService();
    } catch (error) {
      ctx.ui.notify(formatTasksCommandError(error, "Failed to start task creation"), "error");
      return;
    }

    let projectSelection: SelectTaskProjectResult;
    try {
      projectSelection = await selectTaskProject(ctx, taskService);
    } catch (error) {
      ctx.ui.notify(formatTasksCommandError(error, "Failed to load projects"), "error");
      return;
    }

    if (projectSelection.status === "unavailable") {
      ctx.ui.notify("No projects available for new tasks", "warning");
      return;
    }

    if (projectSelection.status === "cancelled") {
      ctx.ui.notify("Task creation cancelled", "info");
      return;
    }

    let explanationInput: string | undefined;
    try {
      explanationInput = await editTaskExplanation(ctx, title);
    } catch (error) {
      ctx.ui.notify(formatTasksCommandError(error, "Failed to collect task explanation"), "error");
      return;
    }

    if (explanationInput === undefined) {
      ctx.ui.notify("Task creation cancelled", "info");
      return;
    }

    const initialDraft: TaskAuthoringDraft = {
      title,
      description: normalizeOptionalTaskDescription(explanationInput),
      projectName: projectSelection.project.name,
    };

    let finalDraft: TaskAuthoringResult = {
      title: initialDraft.title,
      description: initialDraft.description,
    };

    let wantsTaskAuthoringHelp: boolean;
    try {
      wantsTaskAuthoringHelp = await confirmTaskAuthoring(ctx, initialDraft);
    } catch (error) {
      ctx.ui.notify(formatTasksCommandError(error, "Failed to confirm task authoring"), "error");
      return;
    }

    if (wantsTaskAuthoringHelp) {
      if (!requestTaskAuthoringAssistance) {
        ctx.ui.notify("Task authoring assistance is unavailable", "error");
        return;
      }

      let authoredDraft: TaskAuthoringResult | null;
      try {
        authoredDraft = await requestTaskAuthoringAssistance(ctx, initialDraft);
      } catch (error) {
        ctx.ui.notify(formatTasksCommandError(error, "Failed to complete task authoring"), "error");
        return;
      }

      if (!authoredDraft) {
        ctx.ui.notify("Task creation cancelled", "info");
        return;
      }

      const authoredTitle = authoredDraft.title.trim();
      if (authoredTitle.length === 0) {
        ctx.ui.notify("Task authoring returned an empty title", "error");
        return;
      }

      finalDraft = {
        title: authoredTitle,
        description: normalizeOptionalTaskDescription(authoredDraft.description ?? ""),
      };
    }

    let createdTask: TaskDetail;
    try {
      createdTask = await createTask(
        { taskService },
        {
          title: finalDraft.title,
          projectId: projectSelection.project.id,
          description: finalDraft.description,
        }
      );
    } catch (error) {
      ctx.ui.notify(formatTasksCommandError(error, "Failed to create task"), "error");
      return;
    }

    ctx.ui.notify(`Created task ${createdTask.title}`, "info");

    try {
      await openTaskDetail(ctx, taskService, createdTask.id);
    } catch (error) {
      ctx.ui.notify(
        formatTasksCommandError(
          error,
          `Created task ${createdTask.title} but failed to open task detail`
        ),
        "error"
      );
    }
  };
};

const registerCommands = (
  pi: ExtensionAPI,
  dependencies: RegisterCommandDependencies = {}
): void => {
  getDefaultCurrentTaskContextController(pi);
  getDefaultTaskBrowseFilterContextController(pi);

  pi.registerCommand("tasks", {
    description: "Browse and filter todu tasks",
    handler: createTasksCommandHandler(dependencies),
  });

  pi.registerCommand("task", {
    description: "Show the current task or a specific task by ID",
    handler: createTaskCommandHandler(dependencies),
  });

  pi.registerCommand("task-clear", {
    description: "Clear the current task context",
    handler: createTaskClearCommandHandler(dependencies),
  });

  pi.registerCommand("task-new", {
    description: "Create a new todu task",
    handler: createTaskNewCommandHandler({
      ...dependencies,
      requestTaskAuthoringAssistance:
        dependencies.requestTaskAuthoringAssistance ??
        ((ctx: ExtensionCommandContext, draft: TaskAuthoringDraft) =>
          requestTaskAuthoringAssistance(pi, ctx, draft)),
    }),
  });
};

const loadTasksWithLoader = async (
  ctx: ExtensionCommandContext,
  taskService: TaskService,
  filter: TaskFilter,
  filterSummary: string
): Promise<TaskBrowseLoadResult> =>
  ctx.ui.custom<TaskBrowseLoadResult>((tui, theme, _keybindings, done) => {
    const loader = new BorderedLoader(
      tui,
      theme,
      createTaskLoaderViewModel(`Loading tasks · ${filterSummary}`).label
    );
    let settled = false;

    const settle = (result: TaskBrowseLoadResult): void => {
      if (settled) {
        return;
      }

      settled = true;
      done(result);
    };

    loader.onAbort = () => settle({ status: "cancelled" });

    void browseTasks({ taskService }, filter)
      .then((tasks) => {
        settle({ status: "loaded", tasks });
      })
      .catch((error: unknown) => {
        settle({
          status: "error",
          message: formatTasksCommandError(error, "Failed to load filtered tasks"),
        });
      });

    return loader;
  });

const showTaskBrowseFilterMode = async (
  ctx: ExtensionCommandContext,
  taskService: TaskService,
  currentState: TaskBrowseFilterState
): Promise<EditTaskBrowseFiltersResult> => {
  const projects = [...(await taskService.listProjects())].sort((left, right) =>
    left.name.localeCompare(right.name)
  );
  let draftState = createTaskBrowseFilterState({
    ...currentState,
    hasSavedFilter: true,
  });

  while (true) {
    const action = await selectTaskBrowseFilterModeAction(ctx, draftState, projects);
    if (!action) {
      return { status: "cancelled" };
    }

    if (action === "apply") {
      return { status: "saved", filterState: draftState };
    }

    if (action === "reset") {
      draftState = createSavedTaskBrowseFilterState();
      continue;
    }

    if (action === "status") {
      const nextStatus = await selectOptionalTaskSettingFromList(ctx, {
        title: "Filter by status",
        options: createTaskBrowseStatusOptions(),
        currentValue: draftState.status,
        currentLabel: formatTaskBrowseStatusFilterLabel(draftState.status),
        actionLabel: "status filter",
      });
      if (nextStatus !== undefined) {
        draftState = createTaskBrowseFilterState({
          ...draftState,
          hasSavedFilter: true,
          status: nextStatus,
        });
      }
      continue;
    }

    if (action === "priority") {
      const nextPriority = await selectOptionalTaskSettingFromList(ctx, {
        title: "Filter by priority",
        options: createTaskBrowsePriorityOptions(),
        currentValue: draftState.priority,
        currentLabel: formatTaskBrowsePriorityFilterLabel(draftState.priority),
        actionLabel: "priority filter",
      });
      if (nextPriority !== undefined) {
        draftState = createTaskBrowseFilterState({
          ...draftState,
          hasSavedFilter: true,
          priority: nextPriority,
        });
      }
      continue;
    }

    const nextProject = await selectTaskBrowseProjectFilter(ctx, projects, draftState.projectId);
    if (nextProject !== undefined) {
      draftState = createTaskBrowseFilterState({
        ...draftState,
        hasSavedFilter: true,
        projectId: nextProject.projectId,
        projectName: nextProject.projectName,
      });
    }
  }
};

const selectTaskBrowseViewAction = async (
  ctx: ExtensionCommandContext,
  tasks: TaskSummary[],
  filterState: TaskBrowseFilterState
): Promise<TaskBrowseViewResult> => {
  const items: SelectItem[] = [
    {
      value: "action:change-filters",
      label: "Change filters",
      description: "Edit status, priority, or project filters",
    },
    {
      value: "action:clear-filters",
      label: "Clear filters",
      description: "Reset all filters to Any",
    },
    ...tasks.map((task) => ({
      ...createTaskListItem(task),
      value: `task:${task.id}`,
    })),
  ];

  return ctx.ui.custom<TaskBrowseViewResult>((tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
    container.addChild(new Text(theme.fg("accent", theme.bold("Browse Tasks")), 1, 0));
    container.addChild(
      new Text(theme.fg("muted", `Filters: ${formatTaskBrowseFilterSummary(filterState)}`), 1, 0)
    );

    const selectList = new SelectList(items, Math.min(items.length, 12), {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    });

    selectList.onSelect = (item) => {
      const value = item.value as string;
      if (value === "action:change-filters") {
        done({ status: "change-filters" });
        return;
      }

      if (value === "action:clear-filters") {
        done({ status: "clear-filters" });
        return;
      }

      done({ status: "selected", taskId: value.replace(/^task:/, "") });
    };
    selectList.onCancel = () => done({ status: "closed" });

    container.addChild(selectList);
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc close"), 1, 0));
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });
};

const showEmptyTasksState = async (
  ctx: ExtensionCommandContext,
  filterState: TaskBrowseFilterState
): Promise<EmptyTaskBrowseAction> =>
  ctx.ui.custom<EmptyTaskBrowseAction>((_tui, theme, _keybindings, done) => {
    const items: SelectItem[] = [
      {
        value: "change-filters",
        label: "Change filters",
        description: "Adjust the current task filters",
      },
      {
        value: "clear-filters",
        label: "Clear filters",
        description: "Reset all filters to Any",
      },
      {
        value: "close",
        label: "Close",
        description: "Exit task browsing",
      },
    ];
    const container = new Container();
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
    container.addChild(new Text(theme.fg("accent", theme.bold("Browse Tasks")), 1, 0));
    container.addChild(
      new Text(
        theme.fg(
          "muted",
          `No tasks match the current filters: ${formatTaskBrowseFilterSummary(filterState)}`
        ),
        1,
        1
      )
    );

    const selectList = new SelectList(items, items.length, {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    });

    selectList.onSelect = (item) => done(item.value as EmptyTaskBrowseAction);
    selectList.onCancel = () => done("close");

    container.addChild(selectList);
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc close"), 1, 0));
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        selectList.handleInput(data);
        _tui.requestRender();
      },
    };
  });

type TaskBrowseFilterModeAction = "status" | "priority" | "project" | "apply" | "reset";

const selectTaskBrowseFilterModeAction = async (
  ctx: ExtensionCommandContext,
  filterState: TaskBrowseFilterState,
  projects: ProjectSummary[]
): Promise<TaskBrowseFilterModeAction | null> => {
  const items: SelectItem[] = [
    {
      value: "status",
      label: `Status: ${formatTaskBrowseStatusFilterLabel(filterState.status)}`,
      description: "Choose a status filter or Any",
    },
    {
      value: "priority",
      label: `Priority: ${formatTaskBrowsePriorityFilterLabel(filterState.priority)}`,
      description: "Choose a priority filter or Any",
    },
    {
      value: "project",
      label: `Project: ${formatTaskBrowseProjectFilterLabel(
        filterState.projectId,
        projects.find((project) => project.id === filterState.projectId)?.name ??
          filterState.projectName
      )}`,
      description: "Choose a project filter or Any",
    },
    {
      value: "apply",
      label: "View tasks",
      description: `Open the filtered list (${formatTaskBrowseFilterSummary(filterState)})`,
    },
    {
      value: "reset",
      label: "Reset filters",
      description: "Set status, priority, and project back to Any",
    },
  ];

  return ctx.ui.custom<TaskBrowseFilterModeAction | null>((tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
    container.addChild(new Text(theme.fg("accent", theme.bold("Task Filters")), 1, 0));
    container.addChild(
      new Text(theme.fg("muted", "Set the filters to use when browsing tasks."), 1, 0)
    );

    const selectList = new SelectList(items, items.length, {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    });

    selectList.onSelect = (item) => done(item.value as TaskBrowseFilterModeAction);
    selectList.onCancel = () => done(null);

    container.addChild(selectList);
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0));
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });
};

interface OptionalTaskSettingOption<TValue extends string | null> {
  label: string;
  value: TValue;
}

interface SelectOptionalTaskSettingFromListOptions<TValue extends string | null> {
  title: string;
  options: OptionalTaskSettingOption<TValue>[];
  currentValue: TValue;
  currentLabel: string;
  actionLabel: string;
}

const selectOptionalTaskSettingFromList = async <TValue extends string | null>(
  ctx: ExtensionCommandContext,
  options: SelectOptionalTaskSettingFromListOptions<TValue>
): Promise<TValue | undefined> => {
  const items: SelectItem[] = options.options.map((option) => ({
    value: option.value ?? "__any__",
    label: option.label,
    description:
      option.value === options.currentValue
        ? `${option.label} (current)`
        : `Set ${options.actionLabel} to ${option.label}`,
  }));

  return ctx.ui.custom<TValue | undefined>((tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
    container.addChild(new Text(theme.fg("accent", theme.bold(options.title)), 1, 0));
    container.addChild(
      new Text(theme.fg("muted", `Current ${options.actionLabel}: ${options.currentLabel}`), 1, 0)
    );

    const selectList = new SelectList(items, items.length, {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    });

    selectList.onSelect = (item) => {
      const selectedValue = item.value === "__any__" ? null : (item.value as TValue);
      done(selectedValue as TValue);
    };
    selectList.onCancel = () => done(undefined);

    container.addChild(selectList);
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0));
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });
};

const selectTaskBrowseProjectFilter = async (
  ctx: ExtensionCommandContext,
  projects: ProjectSummary[],
  currentProjectId: string | null
): Promise<{ projectId: string | null; projectName: string | null } | undefined> => {
  const nextProjectId = await selectOptionalTaskSettingFromList(ctx, {
    title: "Filter by project",
    options: [
      { label: "Any", value: null },
      ...projects.map((project) => ({
        label: project.name,
        value: project.id,
      })),
    ],
    currentValue: currentProjectId,
    currentLabel: formatTaskBrowseProjectFilterLabel(
      currentProjectId,
      projects.find((project) => project.id === currentProjectId)?.name ?? null
    ),
    actionLabel: "project filter",
  });

  if (nextProjectId === undefined) {
    return undefined;
  }

  return {
    projectId: nextProjectId,
    projectName: nextProjectId
      ? (projects.find((project) => project.id === nextProjectId)?.name ?? nextProjectId)
      : null,
  };
};

const createTaskBrowseStatusOptions = (): OptionalTaskSettingOption<TaskStatus | null>[] => [
  { label: "Any", value: null },
  ...taskStatusOptions,
];

const createTaskBrowsePriorityOptions = (): OptionalTaskSettingOption<TaskPriority | null>[] => [
  { label: "Any", value: null },
  ...taskPriorityOptions,
];

const createSavedTaskBrowseFilterState = (
  overrides: Partial<TaskBrowseFilterState> = {}
): TaskBrowseFilterState =>
  createTaskBrowseFilterState({
    hasSavedFilter: true,
    ...overrides,
  });

const createTaskFilterFromBrowseState = (filterState: TaskBrowseFilterState): TaskFilter => ({
  statuses: filterState.status ? [filterState.status] : undefined,
  priorities: filterState.priority ? [filterState.priority] : undefined,
  projectId: filterState.projectId ?? undefined,
});

const formatTaskBrowseFilterSummary = (filterState: TaskBrowseFilterState): string =>
  [
    `Status ${formatTaskBrowseStatusFilterLabel(filterState.status)}`,
    `Priority ${formatTaskBrowsePriorityFilterLabel(filterState.priority)}`,
    `Project ${formatTaskBrowseProjectFilterLabel(filterState.projectId, filterState.projectName)}`,
  ].join(" • ");

const formatTaskBrowseStatusFilterLabel = (status: TaskStatus | null): string =>
  status ? formatTaskStatusLabel(status) : "Any";

const formatTaskBrowsePriorityFilterLabel = (priority: TaskPriority | null): string =>
  priority ? formatTaskPriorityLabel(priority) : "Any";

const formatTaskBrowseProjectFilterLabel = (
  projectId: string | null,
  projectName: string | null
): string => {
  if (!projectId) {
    return "Any";
  }

  return projectName ?? projectId;
};

const promptRequiredTaskTitle = async (ctx: ExtensionCommandContext): Promise<string | null> => {
  while (true) {
    const title = await ctx.ui.input("New task title", "What needs to be done?");
    if (title === undefined) {
      return null;
    }

    const trimmedTitle = title.trim();
    if (trimmedTitle.length > 0) {
      return trimmedTitle;
    }

    ctx.ui.notify("Task title is required", "warning");
  }
};

const selectProjectForTaskCreation = async (
  ctx: ExtensionCommandContext,
  taskService: TaskService
): Promise<SelectTaskProjectResult> => {
  const projects = [...(await taskService.listProjects())].sort((left, right) =>
    left.name.localeCompare(right.name)
  );

  if (projects.length === 0) {
    return { status: "unavailable" };
  }

  const selectedProjectId = await selectProjectFromList(ctx, projects);
  if (!selectedProjectId) {
    return { status: "cancelled" };
  }

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  if (!selectedProject) {
    return { status: "cancelled" };
  }

  return {
    status: "selected",
    project: selectedProject,
  };
};

const selectProjectFromList = async (
  ctx: ExtensionCommandContext,
  projects: ProjectSummary[]
): Promise<string | null> => {
  const items: SelectItem[] = projects.map((project) => ({
    value: project.id,
    label: project.name,
    description: `${project.status} • ${project.priority} • ${project.id}`,
  }));

  return ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
    container.addChild(new Text(theme.fg("accent", theme.bold("Select Project")), 1, 0));
    container.addChild(new Text(theme.fg("muted", "Choose the project for the new task."), 1, 0));

    const selectList = new SelectList(items, Math.min(items.length, 10), {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    });

    selectList.onSelect = (item) => done(item.value as string);
    selectList.onCancel = () => done(null);

    container.addChild(selectList);
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0));
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });
};

const editNewTaskExplanation = async (
  ctx: ExtensionCommandContext,
  taskTitle: string
): Promise<string | undefined> =>
  ctx.ui.editor(`Explain the task in your own words (optional) · ${taskTitle}`, "");

const confirmTaskAuthoringHelp = async (
  ctx: ExtensionCommandContext,
  draft: TaskAuthoringDraft
): Promise<boolean> =>
  ctx.ui.confirm(
    "Task authoring",
    `Do you want help with task authoring before creating ${draft.title} in ${draft.projectName}?`
  );

const requestTaskAuthoringAssistance = async (
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  draft: TaskAuthoringDraft
): Promise<TaskAuthoringResult | null> => {
  let pendingError: Error | null = null;

  const result = await ctx.ui.custom<TaskAuthoringResult | null>(
    (tui, theme, _keybindings, done) => {
      const loader = new BorderedLoader(tui, theme, `Refining task draft · ${draft.title}`);
      let settled = false;

      const settle = (value: TaskAuthoringResult | null): void => {
        if (settled) {
          return;
        }

        settled = true;
        done(value);
      };

      loader.onAbort = () => settle(null);

      const commandArgs = ["--mode", "json", "--print", "--no-session", "--no-extensions"];

      if (ctx.model) {
        commandArgs.push("--model", `${ctx.model.provider}/${ctx.model.id}`);
      }

      commandArgs.push(buildTaskAuthoringSkillPrompt(draft));

      void pi
        .exec("pi", commandArgs, { signal: loader.signal, timeout: 120_000 })
        .then((execResult) => {
          if (execResult.code !== 0) {
            const errorOutput = [execResult.stderr, execResult.stdout]
              .map((value) => value.trim())
              .find(Boolean);
            throw new Error(
              errorOutput ?? `Task authoring subprocess failed with exit code ${execResult.code}`
            );
          }

          settle(parseTaskAuthoringResponse(extractAssistantTextFromJsonOutput(execResult.stdout)));
        })
        .catch((error: unknown) => {
          if (loader.signal.aborted) {
            settle(null);
            return;
          }

          pendingError =
            error instanceof Error ? error : new Error("Task authoring subprocess failed");
          settle(null);
        });

      return loader;
    }
  );

  if (pendingError) {
    throw pendingError;
  }

  return result;
};

const buildTaskAuthoringSkillPrompt = (draft: TaskAuthoringDraft): string => {
  const explanation = draft.description ?? "(none provided)";

  return [
    "/skill:task-authoring",
    "This is a task authoring request.",
    "Use task authoring to turn the following rough draft into a finalized task title and markdown description.",
    "Do not ask follow-up questions. Use only the information provided below.",
    "Return the result in this exact format:",
    "Title: <title>",
    "",
    "<markdown description>",
    "",
    "The title should be 60 characters or fewer.",
    "",
    `Project: ${draft.projectName}`,
    `Draft title: ${draft.title}`,
    "User explanation:",
    explanation,
  ].join("\n");
};

const extractAssistantTextFromJsonOutput = (output: string): string => {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    let event: unknown;
    try {
      event = JSON.parse(lines[index] ?? "") as unknown;
    } catch {
      continue;
    }

    if (!isRecord(event) || event.type !== "message_end" || !isRecord(event.message)) {
      continue;
    }

    const { message } = event;
    if (message.role !== "assistant" || !Array.isArray(message.content)) {
      continue;
    }

    const text = message.content
      .filter(
        (block): block is { type: "text"; text: string } =>
          isRecord(block) && block.type === "text" && typeof block.text === "string"
      )
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (text.length > 0) {
      return text;
    }
  }

  throw new Error("Task authoring did not return a response");
};

const parseTaskAuthoringResponse = (responseText: string): TaskAuthoringResult => {
  const jsonResult = parseTaskAuthoringJsonResponse(responseText);
  if (jsonResult) {
    return jsonResult;
  }

  const formattedResult = parseTaskAuthoringFormattedResponse(responseText);
  if (formattedResult) {
    return formattedResult;
  }

  throw new Error("Task authoring did not return a recognizable title and description");
};

const parseTaskAuthoringJsonResponse = (responseText: string): TaskAuthoringResult | null => {
  const rawJson = extractJsonObject(responseText);
  if (!rawJson) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const title = parsed.title;
  if (typeof title !== "string" || title.trim().length === 0) {
    return null;
  }

  const description = parsed.description;
  if (description !== null && description !== undefined && typeof description !== "string") {
    return null;
  }

  return {
    title: title.trim(),
    description:
      typeof description === "string" ? normalizeOptionalTaskDescription(description) : null,
  };
};

const parseTaskAuthoringFormattedResponse = (responseText: string): TaskAuthoringResult | null => {
  const normalizedText = responseText.replace(/\r\n/g, "\n").trim();
  if (normalizedText.length === 0) {
    return null;
  }

  const titleMatch = normalizedText.match(/^Title:\s*(.+)$/im);
  if (titleMatch?.[1]) {
    const title = titleMatch[1].trim();
    const description = normalizedText
      .slice((titleMatch.index ?? 0) + titleMatch[0].length)
      .replace(/^\s*Description:\s*/i, "")
      .trim();

    if (title.length === 0) {
      return null;
    }

    return {
      title,
      description: normalizeOptionalTaskDescription(description),
    };
  }

  const firstLineBreak = normalizedText.indexOf("\n");
  if (firstLineBreak < 0) {
    return null;
  }

  const title = normalizedText.slice(0, firstLineBreak).trim();
  const description = normalizedText.slice(firstLineBreak + 1).trim();
  if (title.length === 0 || description.length === 0) {
    return null;
  }

  if (title.startsWith("#")) {
    return null;
  }

  return {
    title,
    description: normalizeOptionalTaskDescription(description),
  };
};

const extractJsonObject = (value: string): string | null => {
  const trimmedValue = value.trim();
  if (trimmedValue.startsWith("{") && trimmedValue.endsWith("}")) {
    return trimmedValue;
  }

  const fencedMatch = trimmedValue.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBraceIndex = trimmedValue.indexOf("{");
  const lastBraceIndex = trimmedValue.lastIndexOf("}");
  if (firstBraceIndex < 0 || lastBraceIndex <= firstBraceIndex) {
    return null;
  }

  return trimmedValue.slice(firstBraceIndex, lastBraceIndex + 1);
};

const normalizeOptionalTaskDescription = (description: string): string | null => {
  const trimmedDescription = description.trim();
  return trimmedDescription.length > 0 ? trimmedDescription : null;
};

interface OpenTaskDetailDependencies {
  setCurrentTask: (ctx: ExtensionCommandContext, task: TaskDetail) => Promise<void>;
  showTaskDetailView?: (
    ctx: ExtensionCommandContext,
    task: TaskDetail
  ) => Promise<TaskDetailActionKind | null>;
  selectTaskStatus?: (ctx: ExtensionCommandContext, task: TaskDetail) => Promise<TaskStatus | null>;
  selectTaskPriority?: (
    ctx: ExtensionCommandContext,
    task: TaskDetail
  ) => Promise<TaskPriority | null>;
  editTaskComment?: (ctx: ExtensionCommandContext, task: TaskDetail) => Promise<string | null>;
}

const openSelectedTaskDetail = async (
  ctx: ExtensionCommandContext,
  taskService: TaskService,
  taskId: TaskId,
  dependencies: OpenTaskDetailDependencies
): Promise<void> => {
  const task = await showTaskDetail({ taskService }, taskId);
  if (!task) {
    ctx.ui.notify("Selected task no longer exists", "warning");
    return;
  }

  await openTaskDetailHub(ctx, taskService, taskId, dependencies);
};

const openTaskDetailHub = async (
  ctx: ExtensionCommandContext,
  taskService: TaskService,
  taskId: TaskId,
  dependencies: OpenTaskDetailDependencies
): Promise<void> => {
  const showTaskDetailView = dependencies.showTaskDetailView ?? selectTaskDetailAction;
  const selectStatus = dependencies.selectTaskStatus ?? selectTaskStatusFromList;
  const selectPriority = dependencies.selectTaskPriority ?? selectTaskPriorityFromList;
  const editComment = dependencies.editTaskComment ?? editTaskComment;

  while (true) {
    const task = await showTaskDetail({ taskService }, taskId);
    if (!task) {
      ctx.ui.notify("Selected task no longer exists", "warning");
      return;
    }

    const action = await showTaskDetailView(ctx, task);
    if (!action) {
      return;
    }

    if (action === "pickup") {
      await dependencies.setCurrentTask(ctx, task);
      ctx.ui.setEditorText(`pickup task ${task.id}`);
      ctx.ui.notify(`Prepared pickup workflow for ${task.title}`, "info");
      return;
    }

    if (action === "set-current") {
      await dependencies.setCurrentTask(ctx, task);
      ctx.ui.notify(`Current task set to ${task.title}`, "info");
      continue;
    }

    if (action === "update-status") {
      const nextStatus = await selectStatus(ctx, task);
      if (!nextStatus || nextStatus === task.status) {
        continue;
      }

      try {
        const updatedTask = await updateTask(
          { taskService },
          {
            taskId: task.id,
            status: nextStatus,
          }
        );
        await syncCurrentTaskIfFocused(ctx, updatedTask, dependencies.setCurrentTask);
        ctx.ui.notify(`Updated ${task.title} to ${nextStatus}`, "info");
      } catch (error) {
        ctx.ui.notify(formatTasksCommandError(error, "Failed to update task status"), "error");
      }
      continue;
    }

    if (action === "update-priority") {
      const nextPriority = await selectPriority(ctx, task);
      if (!nextPriority || nextPriority === task.priority) {
        continue;
      }

      try {
        const updatedTask = await updateTask(
          { taskService },
          {
            taskId: task.id,
            priority: nextPriority,
          }
        );
        await syncCurrentTaskIfFocused(ctx, updatedTask, dependencies.setCurrentTask);
        ctx.ui.notify(`Updated ${task.title} priority to ${nextPriority}`, "info");
      } catch (error) {
        ctx.ui.notify(formatTasksCommandError(error, "Failed to update task priority"), "error");
      }
      continue;
    }

    const commentContent = await editComment(ctx, task);
    if (!commentContent || commentContent.trim().length === 0) {
      continue;
    }

    await commentOnTask(
      { taskService },
      {
        taskId: task.id,
        content: commentContent.trim(),
      }
    );

    const refreshedTask = await showTaskDetail({ taskService }, task.id);
    if (refreshedTask) {
      await syncCurrentTaskIfFocused(ctx, refreshedTask, dependencies.setCurrentTask);
    }
    ctx.ui.notify(`Added comment to ${task.title}`, "info");
  }
};

const selectTaskDetailAction = async (
  ctx: ExtensionCommandContext,
  task: TaskDetail
): Promise<TaskDetailActionKind | null> => {
  const viewModel = createTaskDetailViewModel(task);
  const actionItems: SelectItem[] = createTaskDetailActionItems(task);

  return ctx.ui.custom<TaskDetailActionKind | null>((tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
    container.addChild(new Text(theme.fg("accent", theme.bold(viewModel.title)), 1, 0));
    container.addChild(new Text(theme.fg("muted", viewModel.body), 1, 0));
    container.addChild(new Text(theme.fg("accent", theme.bold("Quick actions")), 1, 0));

    const selectList = new SelectList(actionItems, actionItems.length, {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    });

    selectList.onSelect = (item) => done(item.value as TaskDetailActionKind);
    selectList.onCancel = () => done(null);

    container.addChild(selectList);
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc close"), 1, 0));
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });
};

const selectTaskStatusFromList = async (
  ctx: ExtensionCommandContext,
  task: TaskDetail
): Promise<TaskStatus | null> =>
  selectTaskSettingFromList(ctx, {
    title: `Update status · ${task.title}`,
    options: taskStatusOptions,
    currentValue: task.status,
    currentLabel: formatTaskStatusLabel(task.status),
    actionLabel: "status",
  });

const selectTaskPriorityFromList = async (
  ctx: ExtensionCommandContext,
  task: TaskDetail
): Promise<TaskPriority | null> =>
  selectTaskSettingFromList(ctx, {
    title: `Update priority · ${task.title}`,
    options: taskPriorityOptions,
    currentValue: task.priority,
    currentLabel: formatTaskPriorityLabel(task.priority),
    actionLabel: "priority",
  });

interface SelectTaskSettingFromListOptions<TValue extends string> {
  title: string;
  options: TaskSettingOption<TValue>[];
  currentValue: TValue;
  currentLabel: string;
  actionLabel: string;
}

const selectTaskSettingFromList = async <TValue extends string>(
  ctx: ExtensionCommandContext,
  options: SelectTaskSettingFromListOptions<TValue>
): Promise<TValue | null> => {
  const items: SelectItem[] = options.options.map((option) => ({
    value: option.value,
    label: option.label,
    description:
      option.value === options.currentValue
        ? `${option.label} (current)`
        : `Set ${options.actionLabel} to ${option.label}`,
  }));

  return ctx.ui.custom<TValue | null>((tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
    container.addChild(new Text(theme.fg("accent", theme.bold(options.title)), 1, 0));
    container.addChild(
      new Text(theme.fg("muted", `Current ${options.actionLabel}: ${options.currentLabel}`), 1, 0)
    );

    const selectList = new SelectList(items, items.length, {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    });

    selectList.onSelect = (item) => done(item.value as TValue);
    selectList.onCancel = () => done(null);

    container.addChild(selectList);
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0));
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });
};

const editTaskComment = async (
  ctx: ExtensionCommandContext,
  task: TaskDetail
): Promise<string | null> => {
  const content = await ctx.ui.editor(`Add comment · ${task.title}`, "");
  return content ?? null;
};

const syncCurrentTaskIfFocused = async (
  ctx: ExtensionCommandContext,
  task: TaskDetail,
  setCurrentTask: (ctx: ExtensionCommandContext, task: TaskDetail) => Promise<void>
): Promise<void> => {
  const currentTaskId = getFocusedTaskId();
  if (currentTaskId !== task.id) {
    return;
  }

  await setCurrentTask(ctx, task);
};

const getFocusedTaskId = (): TaskId | null => {
  try {
    return getDefaultCurrentTaskContextController().getState().currentTaskId;
  } catch {
    return null;
  }
};

const resolveRequestedTaskId = (args: string, currentTaskId: TaskId | null): TaskId | null => {
  const trimmedArgs = args.trim();
  return trimmedArgs.length > 0 ? trimmedArgs : currentTaskId;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const formatTasksCommandError = (error: unknown, prefix: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
};

export {
  createTaskClearCommandHandler,
  createTaskCommandHandler,
  createTaskNewCommandHandler,
  createTasksCommandHandler,
  createSavedTaskBrowseFilterState,
  createTaskFilterFromBrowseState,
  DEFAULT_TASK_BROWSE_FILTER_STATE,
  editTaskComment,
  formatTaskBrowseFilterSummary,
  formatTasksCommandError,
  loadTasksWithLoader,
  openSelectedTaskDetail,
  openTaskDetailHub,
  registerCommands,
  resolveRequestedTaskId,
  selectTaskBrowseViewAction,
  selectTaskDetailAction,
  selectTaskPriorityFromList,
  selectTaskStatusFromList,
  showEmptyTasksState,
  showTaskBrowseFilterMode,
  syncCurrentTaskIfFocused,
};
