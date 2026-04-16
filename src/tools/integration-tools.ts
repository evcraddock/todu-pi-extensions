import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import type { ActorSummary } from "../domain/actor";
import type { TaskSummary } from "../domain/task";
import type { ActorService } from "../services/actor-service";
import type {
  IntegrationBinding,
  IntegrationBindingActorMapping,
  IntegrationBindingFilter,
  IntegrationBindingStatus,
  ProjectIntegrationService,
} from "../services/project-integration-service";
import type { ProjectService } from "../services/project-service";
import type { TaskService } from "../services/task-service";

const INTEGRATION_STRATEGY_VALUES = ["bidirectional", "pull", "push", "none"] as const;

const IntegrationListParams = Type.Object({
  provider: Type.Optional(Type.String({ description: "Optional provider filter" })),
  projectId: Type.Optional(Type.String({ description: "Optional project ID filter" })),
  enabled: Type.Optional(Type.Boolean({ description: "Optional enabled-state filter" })),
});

const IntegrationShowParams = Type.Object({
  bindingId: Type.String({ description: "Integration binding ID" }),
});

const IntegrationUpdateParams = Type.Object({
  bindingId: Type.String({ description: "Integration binding ID" }),
  strategy: Type.Optional(
    StringEnum(INTEGRATION_STRATEGY_VALUES, { description: "Optional integration strategy" })
  ),
  enabled: Type.Optional(Type.Boolean({ description: "Optional enabled state" })),
  actorMappings: Type.Optional(
    Type.Array(
      Type.Object({
        actorId: Type.String(),
        externalAccountId: Type.Optional(Type.String()),
        externalLogin: Type.Optional(Type.String()),
        displayName: Type.Optional(Type.String()),
        trusted: Type.Optional(Type.Boolean()),
      })
    )
  ),
  trustActorIds: Type.Optional(Type.Array(Type.String())),
  untrustActorIds: Type.Optional(Type.Array(Type.String())),
});

interface IntegrationToolDependencies {
  getProjectIntegrationService: () => Promise<ProjectIntegrationService>;
  getProjectService?: () => Promise<ProjectService>;
  getTaskService?: () => Promise<TaskService>;
  getActorService?: () => Promise<ActorService>;
}

interface IntegrationListToolDetails {
  kind: "integration_list";
  filter: IntegrationBindingFilter;
  bindings: IntegrationBinding[];
  total: number;
  empty: boolean;
}

interface IntegrationShowToolDetails {
  kind: "integration_show";
  bindingId: string;
  found: boolean;
  binding?: IntegrationBinding;
  status?: IntegrationBindingStatus | null;
  taskWarnings?: IntegrationTaskWarning[];
}

interface IntegrationUpdateToolDetails {
  kind: "integration_update";
  bindingId: string;
  binding: IntegrationBinding;
}

const createIntegrationListToolDefinition = ({
  getProjectIntegrationService,
  getProjectService,
}: IntegrationToolDependencies) => ({
  name: "integration_list",
  label: "Integration List",
  description: "List integration bindings and their high-level state.",
  promptSnippet: "List integration bindings and sync state.",
  parameters: IntegrationListParams,
  async execute(_toolCallId: string, params: IntegrationBindingFilter) {
    try {
      const integrationService = await getProjectIntegrationService();
      const bindings = await integrationService.listIntegrationBindings(
        normalizeIntegrationFilter(params)
      );
      const projectNameMap = await buildProjectNameMap(getProjectService);

      const details: IntegrationListToolDetails = {
        kind: "integration_list",
        filter: normalizeIntegrationFilter(params),
        bindings,
        total: bindings.length,
        empty: bindings.length === 0,
      };

      return {
        content: [
          { type: "text" as const, text: formatIntegrationListContent(bindings, projectNameMap) },
        ],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "integration_list failed"), { cause: error });
    }
  },
});

const createIntegrationShowToolDefinition = ({
  getProjectIntegrationService,
  getProjectService,
  getTaskService,
  getActorService,
}: IntegrationToolDependencies) => ({
  name: "integration_show",
  label: "Integration Show",
  description:
    "Show integration binding details, mappings, trust state, and unmapped assignee warnings.",
  promptSnippet: "Inspect binding-local actor mappings, trust state, and warning summaries.",
  parameters: IntegrationShowParams,
  async execute(_toolCallId: string, params: { bindingId: string }) {
    const bindingId = normalizeRequiredText(params.bindingId, "bindingId");

    try {
      const integrationService = await getProjectIntegrationService();
      const binding = await integrationService.getIntegrationBinding(bindingId);
      if (!binding) {
        const details: IntegrationShowToolDetails = {
          kind: "integration_show",
          bindingId,
          found: false,
        };

        return {
          content: [{ type: "text" as const, text: `Integration binding not found: ${bindingId}` }],
          details,
        };
      }

      const [status, projectNameMap, actors, tasks] = await Promise.all([
        integrationService.getIntegrationBindingStatus(bindingId),
        buildProjectNameMap(getProjectService),
        listActorsBestEffort(getActorService),
        listProjectTasksBestEffort(getTaskService, binding.projectId),
      ]);
      const taskWarnings = buildTaskMappingWarnings(binding, tasks, actors);

      const details: IntegrationShowToolDetails = {
        kind: "integration_show",
        bindingId,
        found: true,
        binding,
        status,
        taskWarnings,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: formatIntegrationShowContent(
              binding,
              status,
              projectNameMap,
              actors,
              taskWarnings
            ),
          },
        ],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "integration_show failed"), { cause: error });
    }
  },
});

const createIntegrationUpdateToolDefinition = ({
  getProjectIntegrationService,
  getActorService,
}: IntegrationToolDependencies) => ({
  name: "integration_update",
  label: "Integration Update",
  description: "Update integration binding trust state and actor mappings.",
  promptSnippet: "Update binding-local actor mappings or trust state explicitly.",
  parameters: IntegrationUpdateParams,
  async execute(
    _toolCallId: string,
    params: {
      bindingId: string;
      strategy?: "bidirectional" | "pull" | "push" | "none";
      enabled?: boolean;
      actorMappings?: IntegrationBindingActorMapping[];
      trustActorIds?: string[];
      untrustActorIds?: string[];
    }
  ) {
    const bindingId = normalizeRequiredText(params.bindingId, "bindingId");

    try {
      const integrationService = await getProjectIntegrationService();
      const existing = await integrationService.getIntegrationBinding(bindingId);
      if (!existing) {
        throw new Error(`integration binding not found: ${bindingId}`);
      }

      const actorIdsToValidate = [
        ...(params.actorMappings?.map((mapping) => mapping.actorId) ?? []),
        ...(params.trustActorIds ?? []),
        ...(params.untrustActorIds ?? []),
      ];
      await validateActorIds(getActorService, actorIdsToValidate);

      const actorMappings = applyMappingUpdates(existing.options?.actorMappings ?? [], params);
      if (
        params.strategy === undefined &&
        params.enabled === undefined &&
        params.actorMappings === undefined &&
        params.trustActorIds === undefined &&
        params.untrustActorIds === undefined
      ) {
        throw new Error(
          "integration_update requires at least one supported field: strategy, enabled, actorMappings, trustActorIds, or untrustActorIds"
        );
      }

      const updated = await integrationService.updateIntegrationBinding({
        bindingId,
        strategy: params.strategy,
        enabled: params.enabled,
        options: {
          ...(existing.options ?? {}),
          actorMappings,
        },
      });

      const details: IntegrationUpdateToolDetails = {
        kind: "integration_update",
        bindingId,
        binding: updated,
      };

      return {
        content: [{ type: "text" as const, text: formatIntegrationUpdateContent(updated) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "integration_update failed"), { cause: error });
    }
  },
});

const registerIntegrationTools = (
  pi: Pick<ExtensionAPI, "registerTool">,
  dependencies: IntegrationToolDependencies
): void => {
  pi.registerTool(createIntegrationListToolDefinition(dependencies));
  pi.registerTool(createIntegrationShowToolDefinition(dependencies));
  pi.registerTool(createIntegrationUpdateToolDefinition(dependencies));
};

const normalizeIntegrationFilter = (
  filter: IntegrationBindingFilter
): IntegrationBindingFilter => ({
  provider: normalizeOptionalText(filter.provider),
  projectId: normalizeOptionalText(filter.projectId),
  enabled: filter.enabled,
});

const buildProjectNameMap = async (
  getProjectService: (() => Promise<ProjectService>) | undefined
): Promise<Map<string, string>> => {
  if (!getProjectService) {
    return new Map();
  }

  const projectService = await getProjectService();
  const projects = await projectService.listProjects();
  return new Map(projects.map((project) => [project.id, project.name]));
};

const listActorsBestEffort = async (
  getActorService: (() => Promise<ActorService>) | undefined
): Promise<ActorSummary[]> => {
  if (!getActorService) {
    return [];
  }

  try {
    return await (await getActorService()).listActors();
  } catch {
    return [];
  }
};

const listProjectTasksBestEffort = async (
  getTaskService: (() => Promise<TaskService>) | undefined,
  projectId: string
): Promise<TaskSummary[]> => {
  if (!getTaskService) {
    return [];
  }

  try {
    return await (await getTaskService()).listTasks({ projectId });
  } catch {
    return [];
  }
};

interface IntegrationTaskWarning {
  taskId: string;
  title: string;
  unmappedActorIds: string[];
  unmappedAssigneeDisplayNames: string[];
}

const buildTaskMappingWarnings = (
  binding: IntegrationBinding,
  tasks: TaskSummary[],
  actors: ActorSummary[]
): IntegrationTaskWarning[] => {
  const actorMap = new Map(actors.map((actor) => [actor.id, actor]));
  const mappedActorIds = new Set(
    (binding.options?.actorMappings ?? []).map((mapping) => mapping.actorId)
  );

  return tasks.flatMap((task) => {
    const unmappedActorIds = task.assigneeActorIds.filter(
      (actorId) => !mappedActorIds.has(actorId)
    );
    if (unmappedActorIds.length === 0) {
      return [];
    }

    return [
      {
        taskId: task.id,
        title: task.title,
        unmappedActorIds,
        unmappedAssigneeDisplayNames: unmappedActorIds.map((actorId) => {
          const index = task.assigneeActorIds.indexOf(actorId);
          return task.assigneeDisplayNames[index] ?? actorMap.get(actorId)?.displayName ?? actorId;
        }),
      },
    ];
  });
};

const applyMappingUpdates = (
  existingMappings: IntegrationBindingActorMapping[],
  params: {
    actorMappings?: IntegrationBindingActorMapping[];
    trustActorIds?: string[];
    untrustActorIds?: string[];
  }
): IntegrationBindingActorMapping[] => {
  const baseMappings = new Map(
    (params.actorMappings ?? existingMappings).map((mapping) => [mapping.actorId, { ...mapping }])
  );

  for (const actorId of params.trustActorIds ?? []) {
    const mapping = baseMappings.get(actorId);
    if (!mapping) {
      throw new Error(`cannot trust unmapped actor: ${actorId}`);
    }
    mapping.trusted = true;
  }

  for (const actorId of params.untrustActorIds ?? []) {
    const mapping = baseMappings.get(actorId);
    if (!mapping) {
      throw new Error(`cannot untrust unmapped actor: ${actorId}`);
    }
    mapping.trusted = false;
  }

  return [...baseMappings.values()].sort((left, right) =>
    left.actorId.localeCompare(right.actorId)
  );
};

const validateActorIds = async (
  getActorService: (() => Promise<ActorService>) | undefined,
  actorIds: string[]
): Promise<void> => {
  if (!getActorService || actorIds.length === 0) {
    return;
  }

  const actors = await (await getActorService()).listActors();
  const knownActorIds = new Set(actors.map((actor) => actor.id));
  for (const actorId of actorIds) {
    if (!knownActorIds.has(actorId)) {
      throw new Error(`actor not found: ${actorId}`);
    }
  }
};

const formatIntegrationListContent = (
  bindings: IntegrationBinding[],
  projectNameMap: Map<string, string>
): string => {
  if (bindings.length === 0) {
    return "No integration bindings found.";
  }

  return [
    `Integration bindings (${bindings.length}):`,
    ...bindings.map(
      (binding) =>
        `- ${binding.id} • ${binding.provider} • ${projectNameMap.get(binding.projectId) ?? binding.projectId} • ${binding.targetRef} • ${binding.strategy} • ${binding.enabled ? "enabled" : "disabled"}`
    ),
  ].join("\n");
};

const formatIntegrationShowContent = (
  binding: IntegrationBinding,
  status: IntegrationBindingStatus | null,
  projectNameMap: Map<string, string>,
  actors: ActorSummary[],
  taskWarnings: IntegrationTaskWarning[]
): string => {
  const actorMap = new Map(actors.map((actor) => [actor.id, actor]));
  const mappings = binding.options?.actorMappings ?? [];
  const lines = [
    `Integration ${binding.id}`,
    "",
    `Provider: ${binding.provider}`,
    `Project: ${projectNameMap.get(binding.projectId) ?? binding.projectId}`,
    `Target: ${binding.targetKind}:${binding.targetRef}`,
    `Strategy: ${binding.strategy}`,
    `Enabled: ${binding.enabled ? "yes" : "no"}`,
    `State: ${status?.state ?? "unknown"}`,
    `Last error: ${status?.lastErrorSummary ?? "-"}`,
    "",
    `Actor mappings (${mappings.length}):`,
  ];

  if (mappings.length === 0) {
    lines.push("- (none)");
  } else {
    for (const mapping of mappings) {
      const actor = actorMap.get(mapping.actorId);
      lines.push(
        `- ${actor?.displayName ?? mapping.displayName ?? mapping.actorId} (${mapping.actorId}) • ${mapping.externalLogin ?? mapping.externalAccountId ?? "external identity unknown"} • trust: ${mapping.trusted ? "trusted" : "untrusted"}`
      );
    }
  }

  if (taskWarnings.length > 0) {
    lines.push("", "Skipped unmapped outbound assignee warnings:");
    for (const warning of taskWarnings) {
      lines.push(
        `- ${warning.taskId} • ${warning.title} • ${warning.unmappedAssigneeDisplayNames.join(", ")}`
      );
    }
  }

  return lines.join("\n");
};

const formatIntegrationUpdateContent = (binding: IntegrationBinding): string =>
  `Updated integration ${binding.id} • mappings: ${(binding.options?.actorMappings ?? []).length} • strategy: ${binding.strategy} • ${binding.enabled ? "enabled" : "disabled"}`;

const normalizeRequiredText = (value: string, fieldName: string): string => {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    throw new Error(`${fieldName} is required`);
  }

  return trimmedValue;
};

const normalizeOptionalText = (value: string | undefined): string | undefined => {
  const trimmedValue = value?.trim();
  return trimmedValue && trimmedValue.length > 0 ? trimmedValue : undefined;
};

const formatToolError = (error: unknown, prefix: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
};

export {
  createIntegrationListToolDefinition,
  createIntegrationShowToolDefinition,
  createIntegrationUpdateToolDefinition,
  formatIntegrationShowContent,
  registerIntegrationTools,
};
