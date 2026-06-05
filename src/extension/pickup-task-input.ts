import type {
  ExtensionContext,
  InputEvent,
  InputEventResult,
} from "@earendil-works/pi-coding-agent";

import type { TaskDetail, TaskId } from "../domain/task";
import type { TaskService } from "../services/task-service";

export interface PickupTaskInputDependencies {
  getTaskService: () => Promise<Pick<TaskService, "getTask">>;
  setCurrentTask: (ctx: ExtensionContext, task: TaskDetail) => Promise<void>;
}

const PICKUP_TASK_INPUT_PATTERN =
  /^\s*(?:pick\s+up|pickup)\s+(?:task\s+)?(task-[a-z0-9][a-z0-9-]*)\b/i;

const resolvePickupTaskInputTaskId = (text: string): TaskId | null => {
  const match = PICKUP_TASK_INPUT_PATTERN.exec(text);
  return match?.[1] ?? null;
};

const createPickupTaskInputHandler =
  ({ getTaskService, setCurrentTask }: PickupTaskInputDependencies) =>
  async (event: InputEvent, ctx: ExtensionContext): Promise<InputEventResult> => {
    if (event.source === "extension") {
      return { action: "continue" };
    }

    const taskId = resolvePickupTaskInputTaskId(event.text);
    if (!taskId) {
      return { action: "continue" };
    }

    try {
      const taskService = await getTaskService();
      const task = await taskService.getTask(taskId);
      if (task) {
        await setCurrentTask(ctx, task);
      }
    } catch {
      // Let the pickup pipeline continue even if current-task context cannot refresh.
    }

    return { action: "continue" };
  };

export { createPickupTaskInputHandler, resolvePickupTaskInputTaskId };
