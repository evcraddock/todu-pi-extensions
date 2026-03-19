import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { TaskService } from "../services/task-service";
import { getDefaultToduTaskServiceRuntime } from "../services/todu/default-task-service";
import { registerTaskMutationTools } from "../tools/task-mutation-tools";
import { registerTaskReadTools } from "../tools/task-read-tools";

export interface RegisterToolDependencies {
  getTaskService?: () => Promise<TaskService>;
}

const registerTools = (pi: ExtensionAPI, dependencies: RegisterToolDependencies = {}): void => {
  const getTaskService =
    dependencies.getTaskService ?? (() => getDefaultToduTaskServiceRuntime().ensureConnected());

  registerTaskReadTools(pi, { getTaskService });
  registerTaskMutationTools(pi, { getTaskService });
};

export { registerTools };
