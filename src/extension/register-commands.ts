import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { BorderedLoader, DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, matchesKey, type SelectItem, SelectList, Text } from "@mariozechner/pi-tui";

import type {
  TaskDetail,
  TaskFilter,
  TaskId,
  TaskPriority,
  TaskStatus,
  TaskSummary,
} from "../domain/task";
import { browseTasks } from "../flows/browse-tasks";
import { commentOnTask } from "../flows/comment-on-task";
import { showTaskDetail } from "../flows/show-task-detail";
import { updateTask } from "../flows/update-task";
import type { TaskService } from "../services/task-service";
import { getDefaultToduTaskServiceRuntime } from "../services/todu/default-task-service";
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

const DEFAULT_BROWSE_TASKS_FILTER: TaskFilter = {
  statuses: ["active"],
};

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

export interface RegisterCommandDependencies {
  getTaskService?: () => Promise<TaskService>;
  getCurrentTaskId?: () => TaskId | null;
  loadTasks?: (
    ctx: ExtensionCommandContext,
    taskService: TaskService
  ) => Promise<TaskBrowseLoadResult>;
  selectTask?: (ctx: ExtensionCommandContext, tasks: TaskSummary[]) => Promise<TaskId | null>;
  showEmptyState?: (ctx: ExtensionCommandContext) => Promise<void>;
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
  const loadTasks = dependencies.loadTasks ?? loadActiveTasksWithLoader;
  const selectTask = dependencies.selectTask ?? selectTaskFromList;
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
      const taskService = await getTaskService();
      const loadedTasks = await loadTasks(ctx, taskService);

      if (loadedTasks.status === "cancelled") {
        ctx.ui.notify("Task browse cancelled", "info");
        return;
      }

      if (loadedTasks.status === "error") {
        ctx.ui.notify(loadedTasks.message, "error");
        return;
      }

      if (loadedTasks.tasks.length === 0) {
        await showEmptyState(ctx);
        return;
      }

      const taskId = await selectTask(ctx, loadedTasks.tasks);
      if (!taskId) {
        ctx.ui.notify("Task browse cancelled", "info");
        return;
      }

      await openTaskDetail(ctx, taskService, taskId);
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

const registerCommands = (
  pi: ExtensionAPI,
  dependencies: RegisterCommandDependencies = {}
): void => {
  getDefaultCurrentTaskContextController(pi);

  pi.registerCommand("tasks", {
    description: "Browse active todu tasks",
    handler: createTasksCommandHandler(dependencies),
  });

  pi.registerCommand("task", {
    description: "Show the current task or a specific task by ID",
    handler: createTaskCommandHandler(dependencies),
  });
};

const loadActiveTasksWithLoader = async (
  ctx: ExtensionCommandContext,
  taskService: TaskService
): Promise<TaskBrowseLoadResult> =>
  ctx.ui.custom<TaskBrowseLoadResult>((tui, theme, _keybindings, done) => {
    const loader = new BorderedLoader(
      tui,
      theme,
      createTaskLoaderViewModel("Loading active tasks...").label
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

    void browseTasks({ taskService }, DEFAULT_BROWSE_TASKS_FILTER)
      .then((tasks) => {
        settle({ status: "loaded", tasks });
      })
      .catch((error: unknown) => {
        settle({
          status: "error",
          message: formatTasksCommandError(error, "Failed to load active tasks"),
        });
      });

    return loader;
  });

const selectTaskFromList = async (
  ctx: ExtensionCommandContext,
  tasks: TaskSummary[]
): Promise<TaskId | null> => {
  const items: SelectItem[] = tasks.map((task) => createTaskListItem(task));

  return ctx.ui.custom<TaskId | null>((tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
    container.addChild(new Text(theme.fg("accent", theme.bold("Browse Tasks")), 1, 0));

    const selectList = new SelectList(items, Math.min(items.length, 10), {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    });

    selectList.onSelect = (item) => done(item.value as TaskId);
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

const showEmptyTasksState = async (ctx: ExtensionCommandContext): Promise<void> => {
  await ctx.ui.custom<void>((_tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
    container.addChild(new Text(theme.fg("accent", theme.bold("Browse Tasks")), 1, 0));
    container.addChild(new Text(theme.fg("muted", "No active tasks found."), 1, 1));
    container.addChild(new Text(theme.fg("dim", "Press Enter or Escape to close"), 1, 0));
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        if (matchesKey(data, "enter") || matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
          done(undefined);
        }
      },
    };
  });
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

const formatTasksCommandError = (error: unknown, prefix: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
};

export {
  createTaskCommandHandler,
  createTasksCommandHandler,
  DEFAULT_BROWSE_TASKS_FILTER,
  editTaskComment,
  formatTasksCommandError,
  loadActiveTasksWithLoader,
  openSelectedTaskDetail,
  openTaskDetailHub,
  registerCommands,
  resolveRequestedTaskId,
  selectTaskDetailAction,
  selectTaskFromList,
  selectTaskPriorityFromList,
  selectTaskStatusFromList,
  showEmptyTasksState,
  syncCurrentTaskIfFocused,
};
