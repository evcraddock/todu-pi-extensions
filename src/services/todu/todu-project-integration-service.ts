import type {
  CreateIntegrationBindingInput,
  IntegrationBinding,
  IntegrationBindingFilter,
  IntegrationBindingStatus,
  ProjectIntegrationGateway,
  ProjectIntegrationService,
  RegisterRepositoryProjectInput,
  RepositoryBindingCheckResult,
  RepositoryProjectRegistrationResult,
  UpdateIntegrationBindingInput,
} from "../project-integration-service";
import { createProjectIntegrationService } from "../project-integration-service";
import type { ProjectService } from "../project-service";
import type { RepoContextService } from "../repo-context";
import { ToduDaemonClientError, type ToduDaemonClient } from "./daemon-client";

export class ToduProjectIntegrationServiceError extends Error {
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
    this.name = "ToduProjectIntegrationServiceError";
    this.operation = options.operation;
    this.causeCode = options.causeCode;
    this.details = options.details;
  }
}

export interface ToduProjectIntegrationGatewayDependencies {
  client: ToduDaemonClient;
}

const createToduProjectIntegrationGateway = ({
  client,
}: ToduProjectIntegrationGatewayDependencies): ProjectIntegrationGateway => ({
  listIntegrationBindings: (filter?: IntegrationBindingFilter): Promise<IntegrationBinding[]> =>
    client.listIntegrationBindings(filter),
  createIntegrationBinding: (input: CreateIntegrationBindingInput): Promise<IntegrationBinding> =>
    client.createIntegrationBinding(input),
  getIntegrationBinding: (bindingId: string): Promise<IntegrationBinding | null> =>
    client.getIntegrationBinding(bindingId),
  updateIntegrationBinding: (input: UpdateIntegrationBindingInput): Promise<IntegrationBinding> =>
    client.updateIntegrationBinding(input),
  getIntegrationBindingStatus: (bindingId: string): Promise<IntegrationBindingStatus | null> =>
    client.getIntegrationBindingStatus(bindingId),
});

const createToduProjectIntegrationService = ({
  client,
  projectService,
  repoContextService,
}: {
  client: ToduDaemonClient;
  projectService: ProjectService;
  repoContextService: RepoContextService;
}): ProjectIntegrationService => {
  const gateway = createToduProjectIntegrationGateway({ client });
  const service = createProjectIntegrationService({ projectService, repoContextService, gateway });

  return {
    listIntegrationBindings: (filter) =>
      runProjectIntegrationServiceOperation("listIntegrationBindings", () =>
        service.listIntegrationBindings(filter)
      ),
    getIntegrationBinding: (bindingId) =>
      runProjectIntegrationServiceOperation("getIntegrationBinding", () =>
        service.getIntegrationBinding(bindingId)
      ),
    updateIntegrationBinding: (input) =>
      runProjectIntegrationServiceOperation("updateIntegrationBinding", () =>
        service.updateIntegrationBinding(input)
      ),
    getIntegrationBindingStatus: (bindingId) =>
      runProjectIntegrationServiceOperation("getIntegrationBindingStatus", () =>
        service.getIntegrationBindingStatus(bindingId)
      ),
    checkRepositoryBinding: (input): Promise<RepositoryBindingCheckResult> =>
      runProjectIntegrationServiceOperation("checkRepositoryBinding", () =>
        service.checkRepositoryBinding(input)
      ),
    registerRepositoryProject: (
      input: RegisterRepositoryProjectInput
    ): Promise<RepositoryProjectRegistrationResult> =>
      runProjectIntegrationServiceOperation("registerRepositoryProject", () =>
        service.registerRepositoryProject(input)
      ),
  };
};

const runProjectIntegrationServiceOperation = async <TResult>(
  operation: string,
  action: () => Promise<TResult>
): Promise<TResult> => {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ToduDaemonClientError) {
      throw new ToduProjectIntegrationServiceError({
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

export {
  createToduProjectIntegrationGateway,
  createToduProjectIntegrationService,
  runProjectIntegrationServiceOperation,
};
