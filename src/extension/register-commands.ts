import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { BorderedLoader, DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, matchesKey, type SelectItem, SelectList, Text } from "@mariozechner/pi-tui";

import type { TaskFilter, TaskId, TaskSummary } from "../domain/task";
import { browseTasks } from "../flows/browse-tasks";
import { showTaskDetail } from "../flows/show-task-detail";
import type { TaskService } from "../services/task-service";
import { getDefaultToduTaskServiceRuntime } from "../services/todu/default-task-service";
import { createTaskDetailViewModel } from "../ui/components/task-detail";
import { createTaskListItem } from "../ui/components/task-list";
import { createTaskLoaderViewModel } from "../ui/components/loaders";

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
  loadTasks?: (
    ctx: ExtensionCommandContext,
    taskService: TaskService
  ) => Promise<TaskBrowseLoadResult>;
  selectTask?: (ctx: ExtensionCommandContext, tasks: TaskSummary[]) => Promise<TaskId | null>;
  showEmptyState?: (ctx: ExtensionCommandContext) => Promise<void>;
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
  const openTaskDetail = dependencies.openTaskDetail ?? openSelectedTaskDetail;

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

const registerCommands = (
  pi: ExtensionAPI,
  dependencies: RegisterCommandDependencies = {}
): void => {
  pi.registerCommand("tasks", {
    description: "Browse active todu tasks",
    handler: createTasksCommandHandler(dependencies),
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

const openSelectedTaskDetail = async (
  ctx: ExtensionCommandContext,
  taskService: TaskService,
  taskId: TaskId
): Promise<void> => {
  const task = await showTaskDetail({ taskService }, taskId);
  if (!task) {
    ctx.ui.notify("Selected task no longer exists", "warning");
    return;
  }

  const viewModel = createTaskDetailViewModel(task);
  ctx.ui.setEditorText(viewModel.body);
  ctx.ui.notify(`Loaded task detail for ${viewModel.title}`, "info");
};

const formatTasksCommandError = (error: unknown, prefix: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
};

export {
  createTasksCommandHandler,
  DEFAULT_BROWSE_TASKS_FILTER,
  formatTasksCommandError,
  loadActiveTasksWithLoader,
  openSelectedTaskDetail,
  registerCommands,
  selectTaskFromList,
  showEmptyTasksState,
};
