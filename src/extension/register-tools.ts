import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { ActorService } from "../services/actor-service";
import type { ApprovalService } from "../services/approval-service";
import type { HabitService } from "../services/habit-service";
import type { NoteService } from "../services/note-service";
import type { ProjectIntegrationService } from "../services/project-integration-service";
import {
  createProjectServiceFromTaskService,
  type ProjectService,
} from "../services/project-service";
import type { RecurringService } from "../services/recurring-service";
import type { TaskService } from "../services/task-service";
import { getDefaultToduTaskServiceRuntime } from "../services/todu/default-task-service";
import { registerActorMutationTools } from "../tools/actor-mutation-tools";
import { registerActorReadTools } from "../tools/actor-read-tools";
import { registerHabitMutationTools } from "../tools/habit-mutation-tools";
import { registerHabitReadTools } from "../tools/habit-read-tools";
import { registerApprovalTools } from "../tools/approval-tools";
import { registerIntegrationTools } from "../tools/integration-tools";
import { registerNoteReadTools } from "../tools/note-read-tools";
import { registerProjectIntegrationTools } from "../tools/project-integration-tools";
import { registerProjectMutationTools } from "../tools/project-mutation-tools";
import { registerProjectReadTools } from "../tools/project-read-tools";
import { registerRecurringMutationTools } from "../tools/recurring-mutation-tools";
import { registerRecurringReadTools } from "../tools/recurring-read-tools";
import { registerTaskMutationTools } from "../tools/task-mutation-tools";
import { registerTaskReadTools } from "../tools/task-read-tools";

export interface RegisterToolDependencies {
  getTaskService?: () => Promise<TaskService>;
  getActorService?: () => Promise<ActorService>;
  getProjectService?: () => Promise<ProjectService>;
  getRecurringService?: () => Promise<RecurringService>;
  getHabitService?: () => Promise<HabitService>;
  getNoteService?: () => Promise<NoteService>;
  getApprovalService?: () => Promise<ApprovalService>;
  getProjectIntegrationService?: () => Promise<ProjectIntegrationService>;
}

const registerTools = (pi: ExtensionAPI, dependencies: RegisterToolDependencies = {}): void => {
  const runtime = getDefaultToduTaskServiceRuntime();
  const getTaskService = dependencies.getTaskService ?? (() => runtime.ensureConnected());
  const getActorService =
    dependencies.getActorService ?? (() => runtime.ensureActorServiceConnected());
  const getProjectService =
    dependencies.getProjectService ??
    (dependencies.getTaskService
      ? async () => createProjectServiceFromTaskService(await getTaskService())
      : () => runtime.ensureProjectServiceConnected());
  const getRecurringService =
    dependencies.getRecurringService ?? (() => runtime.ensureRecurringServiceConnected());
  const getHabitService =
    dependencies.getHabitService ?? (() => runtime.ensureHabitServiceConnected());
  const getNoteService =
    dependencies.getNoteService ?? (() => runtime.ensureNoteServiceConnected());
  const getProjectIntegrationService =
    dependencies.getProjectIntegrationService ??
    (() => runtime.ensureProjectIntegrationServiceConnected());
  const getApprovalService =
    dependencies.getApprovalService ?? (() => runtime.ensureApprovalServiceConnected());

  registerTaskReadTools(pi, { getTaskService });
  registerActorReadTools(pi, { getActorService });
  registerProjectReadTools(pi, { getProjectService, getActorService, getTaskService });
  registerProjectIntegrationTools(pi, { getProjectIntegrationService, getProjectService });
  registerIntegrationTools(pi, {
    getProjectIntegrationService,
    getProjectService,
    getTaskService,
    getActorService,
  });
  registerProjectMutationTools(pi, { getProjectService, getActorService });
  registerRecurringReadTools(pi, { getRecurringService });
  registerRecurringMutationTools(pi, { getRecurringService, getProjectService });
  registerHabitReadTools(pi, { getHabitService });
  registerHabitMutationTools(pi, { getHabitService, getProjectService });
  registerNoteReadTools(pi, { getNoteService });
  registerApprovalTools(pi, { getApprovalService, getActorService });
  registerActorMutationTools(pi, { getActorService });
  registerTaskMutationTools(pi, { getTaskService, getActorService, getProjectService });
};

export { registerTools };
