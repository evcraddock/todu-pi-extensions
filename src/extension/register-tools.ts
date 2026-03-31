import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { ProjectIntegrationService } from "../services/project-integration-service";
import {
  createProjectServiceFromTaskService,
  type ProjectService,
} from "../services/project-service";
import type { RecurringService } from "../services/recurring-service";
import type { TaskService } from "../services/task-service";
import { getDefaultToduTaskServiceRuntime } from "../services/todu/default-task-service";
import { registerProjectIntegrationTools } from "../tools/project-integration-tools";
import { registerProjectMutationTools } from "../tools/project-mutation-tools";
import { registerProjectReadTools } from "../tools/project-read-tools";
import { registerRecurringMutationTools } from "../tools/recurring-mutation-tools";
import { registerRecurringReadTools } from "../tools/recurring-read-tools";
import { registerTaskMutationTools } from "../tools/task-mutation-tools";
import { registerTaskReadTools } from "../tools/task-read-tools";

export interface RegisterToolDependencies {
  getTaskService?: () => Promise<TaskService>;
  getProjectService?: () => Promise<ProjectService>;
  getRecurringService?: () => Promise<RecurringService>;
  getProjectIntegrationService?: () => Promise<ProjectIntegrationService>;
}

const registerTools = (pi: ExtensionAPI, dependencies: RegisterToolDependencies = {}): void => {
  const runtime = getDefaultToduTaskServiceRuntime();
  const getTaskService = dependencies.getTaskService ?? (() => runtime.ensureConnected());
  const getProjectService =
    dependencies.getProjectService ??
    (dependencies.getTaskService
      ? async () => createProjectServiceFromTaskService(await getTaskService())
      : () => runtime.ensureProjectServiceConnected());
  const getRecurringService =
    dependencies.getRecurringService ?? (() => runtime.ensureRecurringServiceConnected());
  const getProjectIntegrationService =
    dependencies.getProjectIntegrationService ??
    (() => runtime.ensureProjectIntegrationServiceConnected());

  registerTaskReadTools(pi, { getTaskService });
  registerProjectReadTools(pi, { getProjectService });
  registerProjectIntegrationTools(pi, { getProjectIntegrationService, getProjectService });
  registerProjectMutationTools(pi, { getProjectService });
  registerRecurringReadTools(pi, { getRecurringService });
  registerRecurringMutationTools(pi, { getRecurringService, getProjectService });
  registerTaskMutationTools(pi, { getTaskService });
};

export { registerTools };
