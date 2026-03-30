import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  createProjectServiceFromTaskService,
  type ProjectService,
} from "../services/project-service";
import type { TaskService } from "../services/task-service";
import { getDefaultToduTaskServiceRuntime } from "../services/todu/default-task-service";
import { registerProjectMutationTools } from "../tools/project-mutation-tools";
import { registerProjectReadTools } from "../tools/project-read-tools";
import { registerTaskMutationTools } from "../tools/task-mutation-tools";
import { registerTaskReadTools } from "../tools/task-read-tools";

export interface RegisterToolDependencies {
  getTaskService?: () => Promise<TaskService>;
  getProjectService?: () => Promise<ProjectService>;
}

const registerTools = (pi: ExtensionAPI, dependencies: RegisterToolDependencies = {}): void => {
  const runtime = getDefaultToduTaskServiceRuntime();
  const getTaskService = dependencies.getTaskService ?? (() => runtime.ensureConnected());
  const getProjectService =
    dependencies.getProjectService ??
    (dependencies.getTaskService
      ? async () => createProjectServiceFromTaskService(await getTaskService())
      : () => runtime.ensureProjectServiceConnected());

  registerTaskReadTools(pi, { getTaskService });
  registerProjectReadTools(pi, { getProjectService });
  registerProjectMutationTools(pi, { getProjectService });
  registerTaskMutationTools(pi, { getTaskService });
};

export { registerTools };
