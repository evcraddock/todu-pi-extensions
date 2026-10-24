import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { stringEnum } from "./string-enum";
import {
  IntegrationListDataSchema,
  IntegrationShowDataSchema,
  IntegrationUpdateDataSchema,
} from "./trust-tool-schemas";
import {
  classifyTrustToolError,
  createTrustResultBuilder,
  optionalTrustRead,
  projectTrustData,
  TrustToolInputError,
  type TrustToolWarning,
} from "./trust-tool-results";
import { projectBinding, projectBindingStatus } from "./trust-tool-projections";

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

const integrationListResult = createTrustResultBuilder(
  IntegrationListDataSchema,
  "integration_list"
);
const integrationShowResult = createTrustResultBuilder(
  IntegrationShowDataSchema,
  "integration_show"
);
const integrationUpdateResult = createTrustResultBuilder(
  IntegrationUpdateDataSchema,
  "integration_update"
);

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
    stringEnum(INTEGRATION_STRATEGY_VALUES, { description: "Optional integration strategy" })
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
  outputSchema: integrationListResult.outputSchema,
  async execute(_toolCallId: string, params: IntegrationBindingFilter) {
    const filter = projectTrustData(() => normalizeIntegrationFilter(params));
    let raw: IntegrationBinding[];
    try {
      raw = await (await getProjectIntegrationService()).listIntegrationBindings(filter);
    } catch (error) {
      const status = classifyTrustToolError({ error, tool: "integration_list" });
      return integrationListResult.failure({
        status: status === "not_found" ? "backend_error" : status,
      });
    }
    const bindings = projectTrustData(() => raw.map(projectBinding));
    const warnings: TrustToolWarning[] = [];
    const projectNameMap = await readProjectNames(getProjectService, warnings);
    const details: IntegrationListToolDetails = {
      kind: "integration_list",
      filter,
      bindings,
      total: bindings.length,
      empty: bindings.length === 0,
    };
    const projectIds = new Set(bindings.map((binding) => binding.projectId));
    const projectNames = [...projectNameMap]
      .filter(([id]) => projectIds.has(id))
      .map(([id, name]) => ({ id, name }));
    return integrationListResult.success({
      data: { filter, bindings, projectNames, total: details.total, empty: details.empty },
      details,
      empty: details.empty,
      warnings,
      text: projectTrustData(() => formatIntegrationListContent(bindings, projectNameMap)),
    });
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
  outputSchema: integrationShowResult.outputSchema,
  async execute(_toolCallId: string, params: { bindingId: string }) {
    const bindingId = params.bindingId.trim();
    if (!bindingId) return integrationShowResult.failure({ status: "validation_error" });
    const target = { entityType: "integration" as const, entityId: bindingId };
    let integrationService: ProjectIntegrationService;
    try {
      integrationService = await getProjectIntegrationService();
    } catch (error) {
      const status = classifyTrustToolError({ error, tool: "integration_show" });
      return integrationShowResult.failure({
        status: status === "not_found" ? "backend_error" : status,
      });
    }
    let raw: IntegrationBinding | null;
    try {
      raw = await integrationService.getIntegrationBinding(bindingId);
    } catch (error) {
      return integrationShowResult.failure({
        status: classifyTrustToolError({ error, tool: "integration_show" }),
        target,
      });
    }
    if (raw === null) {
      const details: IntegrationShowToolDetails = {
        kind: "integration_show",
        bindingId,
        found: false,
      };
      return integrationShowResult.failure({
        status: "not_found",
        target,
        details,
        text: `Integration binding not found: ${bindingId}`,
      });
    }
    const binding = projectTrustData(() => projectBinding(raw));
    const warnings: TrustToolWarning[] = [];
    const [rawStatus, projectNameMap, actors, tasks] = await Promise.all([
      optionalTrustRead({
        read: () => integrationService.getIntegrationBindingStatus(bindingId),
        fallback: null,
        warnings,
        code: "status_unavailable",
        message: "Integration status is unavailable; binding details remain available.",
      }),
      readProjectNames(getProjectService, warnings),
      optionalTrustRead({
        read: getActorService
          ? async () =>
              (await (await getActorService()).listActors()).map(
                ({ id, displayName, archived }) => ({ id, displayName, archived })
              )
          : undefined,
        fallback: [] as ActorSummary[],
        warnings,
        code: "actors_unavailable",
        message: "Actor display metadata is unavailable; actor IDs are retained.",
      }),
      optionalTrustRead({
        read: getTaskService
          ? async () => (await getTaskService()).listTasks({ projectId: binding.projectId })
          : undefined,
        fallback: [] as TaskSummary[],
        warnings,
        code: "task_warnings_unavailable",
        message: "Task assignee warnings could not be checked; an empty list is incomplete.",
      }),
    ]);
    if (rawStatus === null) {
      if (!warnings.some((warning) => warning.code === "status_unavailable"))
        warnings.push({
          code: "status_unavailable",
          message: "No integration status is available; binding details remain available.",
        });
    } else if (rawStatus.lastErrorSummary !== null) {
      warnings.push({
        code: "diagnostics_redacted",
        message: "Raw integration error diagnostics are withheld because they may contain secrets.",
      });
    }
    const status = projectTrustData(() => projectBindingStatus(rawStatus));
    const taskWarnings = projectTrustData(() => buildTaskMappingWarnings(binding, tasks, actors));
    for (const warning of taskWarnings)
      warnings.push({
        code: "unmapped_assignees",
        message: "Some task assignees have no outbound actor mapping.",
        target: { entityType: "task", entityId: warning.taskId },
        outboundAssigneeWarning: {
          bindingId,
          provider: binding.provider,
          targetRef: binding.targetRef,
          unmappedActorIds: warning.unmappedActorIds,
          unmappedAssigneeDisplayNames: warning.unmappedAssigneeDisplayNames,
        },
      });
    const details: IntegrationShowToolDetails = {
      kind: "integration_show",
      bindingId,
      found: true,
      binding,
      status,
      taskWarnings,
    };
    return integrationShowResult.success({
      data: {
        binding,
        status,
        projectName: projectNameMap.get(binding.projectId) ?? null,
        actors,
        taskWarnings,
      },
      details,
      warnings,
      text: projectTrustData(() =>
        formatIntegrationShowContent(binding, status, projectNameMap, actors, taskWarnings)
      ),
    });
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
  outputSchema: integrationUpdateResult.outputSchema,
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
    const bindingId = params.bindingId.trim();
    if (!bindingId) return integrationUpdateResult.failure({ status: "validation_error" });
    const target = { entityType: "integration" as const, entityId: bindingId };
    let integrationService: ProjectIntegrationService;
    try {
      integrationService = await getProjectIntegrationService();
    } catch (error) {
      const status = classifyTrustToolError({ error, tool: "integration_update" });
      return integrationUpdateResult.failure({
        status: status === "not_found" ? "backend_error" : status,
      });
    }
    let existing: IntegrationBinding | null;
    try {
      existing = await integrationService.getIntegrationBinding(bindingId);
    } catch (error) {
      return integrationUpdateResult.failure({
        status: classifyTrustToolError({ error, tool: "integration_update" }),
        target,
      });
    }
    if (existing === null)
      return integrationUpdateResult.failure({
        status: "not_found",
        target,
        text: `Integration binding not found: ${bindingId}`,
      });
    let actorMappings: IntegrationBindingActorMapping[];
    try {
      const actorIdsToValidate = [
        ...(params.actorMappings?.map((mapping) => mapping.actorId) ?? []),
        ...(params.trustActorIds ?? []),
        ...(params.untrustActorIds ?? []),
      ];
      await validateActorIds(getActorService, actorIdsToValidate);

      actorMappings = applyMappingUpdates(existing.options?.actorMappings ?? [], params);
      if (
        params.strategy === undefined &&
        params.enabled === undefined &&
        params.actorMappings === undefined &&
        params.trustActorIds === undefined &&
        params.untrustActorIds === undefined
      ) {
        throw new TrustToolInputError();
      }
    } catch (error) {
      const status = classifyTrustToolError({ error, tool: "integration_update" });
      return integrationUpdateResult.failure({
        status: status === "not_found" ? "backend_error" : status,
      });
    }
    let updated: IntegrationBinding;
    try {
      updated = await integrationService.updateIntegrationBinding({
        bindingId,
        strategy: params.strategy,
        enabled: params.enabled,
        options: {
          ...(existing.options ?? {}),
          actorMappings,
        },
      });
    } catch (error) {
      return integrationUpdateResult.failure({
        status: classifyTrustToolError({ error, tool: "integration_update", dispatched: true }),
        target,
      });
    }
    const binding = projectTrustData(() => projectBinding(updated));
    const details: IntegrationUpdateToolDetails = {
      kind: "integration_update",
      bindingId,
      binding,
    };
    return integrationUpdateResult.success({
      data: { binding },
      details,
      text: projectTrustData(() => formatIntegrationUpdateContent(binding)),
    });
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

const readProjectNames = (
  getProjectService: (() => Promise<ProjectService>) | undefined,
  warnings: TrustToolWarning[]
): Promise<Map<string, string>> =>
  optionalTrustRead({
    read: getProjectService ? () => buildProjectNameMap(getProjectService) : undefined,
    fallback: new Map<string, string>(),
    warnings,
    code: "projects_unavailable",
    message: "Project display metadata is unavailable; project IDs are retained.",
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
      throw new TrustToolInputError();
    }
    mapping.trusted = true;
  }

  for (const actorId of params.untrustActorIds ?? []) {
    const mapping = baseMappings.get(actorId);
    if (!mapping) {
      throw new TrustToolInputError();
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
      throw new TrustToolInputError();
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
    `Last error: ${projectBindingStatus(status)?.lastErrorSummary ?? "-"}`,
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

const normalizeOptionalText = (value: string | undefined): string | undefined => {
  const trimmedValue = value?.trim();
  return trimmedValue && trimmedValue.length > 0 ? trimmedValue : undefined;
};

export {
  createIntegrationListToolDefinition,
  createIntegrationShowToolDefinition,
  createIntegrationUpdateToolDefinition,
  formatIntegrationShowContent,
  registerIntegrationTools,
};
