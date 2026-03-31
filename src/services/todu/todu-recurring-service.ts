import type {
  RecurringFilter,
  RecurringTemplateDetail,
  RecurringTemplateSummary,
} from "../../domain/recurring";
import type {
  RecurringService,
  CreateRecurringInput,
  DeleteRecurringResult,
  UpdateRecurringInput,
} from "../recurring-service";
import { ToduDaemonClientError, type ToduDaemonClient } from "./daemon-client";

export class ToduRecurringServiceError extends Error {
  readonly operation: string;
  readonly causeCode: string;
  readonly details?: Record<string, unknown>;

  constructor(options: {
    operation: string;
    causeCode: string;
    message: string;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(options.message, options.cause ? { cause: options.cause } : undefined);
    this.name = "ToduRecurringServiceError";
    this.operation = options.operation;
    this.causeCode = options.causeCode;
    this.details = options.details;
  }
}

export interface ToduRecurringServiceDependencies {
  client: ToduDaemonClient;
}

const createToduRecurringService = ({
  client,
}: ToduRecurringServiceDependencies): RecurringService => ({
  listRecurring: (filter) =>
    runRecurringServiceOperation("listRecurring", () =>
      listRecurringWithProjectNames(client, filter)
    ),
  getRecurring: (recurringId) =>
    runRecurringServiceOperation("getRecurring", async () => {
      const template = await client.getRecurring(recurringId);
      if (!template) {
        return null;
      }

      return hydrateRecurringProjectName(client, template);
    }),
  createRecurring: (input) =>
    runRecurringServiceOperation("createRecurring", async () => {
      const template = await client.createRecurring(input);
      return hydrateRecurringProjectName(client, template);
    }),
  updateRecurring: (input) =>
    runRecurringServiceOperation("updateRecurring", async () => {
      const template = await client.updateRecurring(input);
      return hydrateRecurringProjectName(client, template);
    }),
  deleteRecurring: (recurringId) =>
    runRecurringServiceOperation("deleteRecurring", () => client.deleteRecurring(recurringId)),
});

const listRecurringWithProjectNames = async (
  client: ToduDaemonClient,
  filter?: RecurringFilter
): Promise<RecurringTemplateSummary[]> => {
  const [templates, projects] = await Promise.all([
    client.listRecurring(filter),
    client.listProjects(),
  ]);
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));

  return templates.map((template) => ({
    ...template,
    projectName: projectNames.get(template.projectId) ?? null,
  }));
};

const hydrateRecurringProjectName = async (
  client: ToduDaemonClient,
  template: RecurringTemplateDetail
): Promise<RecurringTemplateDetail> => {
  const project = await client.getProject(template.projectId);
  return {
    ...template,
    projectName: project?.name ?? null,
  };
};

const runRecurringServiceOperation = async <TResult>(
  operation: string,
  action: () => Promise<TResult>
): Promise<TResult> => {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ToduDaemonClientError) {
      throw new ToduRecurringServiceError({
        operation,
        causeCode: error.code,
        message: `${operation} failed: ${error.message}`,
        details: error.details,
        cause: error,
      });
    }

    throw error;
  }
};

const listRecurring = async (recurringService: RecurringService, filter?: RecurringFilter) =>
  recurringService.listRecurring(filter);

const createRecurring = async (recurringService: RecurringService, input: CreateRecurringInput) =>
  recurringService.createRecurring(input);

const updateRecurring = async (recurringService: RecurringService, input: UpdateRecurringInput) =>
  recurringService.updateRecurring(input);

const deleteRecurring = async (
  recurringService: RecurringService,
  recurringId: string
): Promise<DeleteRecurringResult> => recurringService.deleteRecurring(recurringId);

export {
  createRecurring,
  createToduRecurringService,
  deleteRecurring,
  hydrateRecurringProjectName,
  listRecurring,
  listRecurringWithProjectNames,
  runRecurringServiceOperation,
  updateRecurring,
};
