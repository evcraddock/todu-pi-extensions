import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import type { ProjectSummary, TaskPriority } from "../domain/task";
import type {
  CreateProjectInput,
  DeleteProjectResult,
  ProjectService,
  UpdateProjectInput,
} from "../services/project-service";
import { ToduProjectServiceError } from "../services/todu/todu-project-service";

const PROJECT_STATUS_VALUES = ["active", "done", "cancelled"] as const;
const PROJECT_PRIORITY_VALUES = ["low", "medium", "high"] as const;

const ProjectCreateParams = Type.Object({
  name: Type.String({ description: "Project name" }),
  description: Type.Optional(Type.String({ description: "Optional project description" })),
  priority: Type.Optional(
    StringEnum(PROJECT_PRIORITY_VALUES, { description: "Optional project priority" })
  ),
});

const ProjectUpdateParams = Type.Object({
  projectId: Type.String({ description: "Project ID" }),
  name: Type.Optional(Type.String({ description: "Optional replacement project name" })),
  description: Type.Optional(
    Type.String({
      description: "Optional replacement description. Use an empty string to clear it.",
    })
  ),
  status: Type.Optional(
    StringEnum(PROJECT_STATUS_VALUES, { description: "Optional next project status" })
  ),
  priority: Type.Optional(
    StringEnum(PROJECT_PRIORITY_VALUES, { description: "Optional next project priority" })
  ),
});

const ProjectDeleteParams = Type.Object({
  projectId: Type.String({ description: "Project ID" }),
});

interface ProjectCreateToolParams {
  name: string;
  description?: string;
  priority?: TaskPriority;
}

interface ProjectUpdateToolParams {
  projectId: string;
  name?: string;
  description?: string;
  status?: ProjectSummary["status"];
  priority?: TaskPriority;
}

interface ProjectDeleteToolParams {
  projectId: string;
}

interface ProjectCreateToolDetails {
  kind: "project_create";
  input: CreateProjectInput;
  project: ProjectSummary;
}

interface ProjectUpdateToolDetails {
  kind: "project_update";
  input: UpdateProjectInput;
  project: ProjectSummary;
}

interface ProjectDeleteToolDetails {
  kind: "project_delete";
  projectId: string;
  found: boolean;
  deleted: boolean;
  project?: DeleteProjectResult;
}

interface ProjectMutationToolDependencies {
  getProjectService: () => Promise<ProjectService>;
}

const createProjectCreateToolDefinition = ({
  getProjectService,
}: ProjectMutationToolDependencies) => ({
  name: "project_create",
  label: "Project Create",
  description: "Create a plain project record.",
  promptSnippet: "Create a plain project record through the native project service.",
  promptGuidelines: [
    "Use this tool for plain project record creation in normal chat.",
    "Do not use it for repository registration or integration-binding behavior.",
  ],
  parameters: ProjectCreateParams,
  async execute(_toolCallId: string, params: ProjectCreateToolParams) {
    try {
      const input = normalizeCreateProjectInput(params);
      const projectService = await getProjectService();
      const project = await projectService.createProject(input);
      const details: ProjectCreateToolDetails = {
        kind: "project_create",
        input,
        project,
      };

      return {
        content: [{ type: "text" as const, text: formatProjectCreateContent(project) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "project_create failed"), { cause: error });
    }
  },
});

const createProjectUpdateToolDefinition = ({
  getProjectService,
}: ProjectMutationToolDependencies) => ({
  name: "project_update",
  label: "Project Update",
  description: "Update a plain project's name, description, status, or priority.",
  promptSnippet: "Update a plain project record by explicit project ID.",
  promptGuidelines: [
    "Use this tool for plain project-record updates in normal chat.",
    "Supported fields are name, description, status, and priority.",
    "Do not use it for repo inspection or integration-binding changes.",
  ],
  parameters: ProjectUpdateParams,
  async execute(_toolCallId: string, params: ProjectUpdateToolParams) {
    try {
      const input = normalizeUpdateProjectInput(params);
      const projectService = await getProjectService();
      const project = await projectService.updateProject(input);
      const details: ProjectUpdateToolDetails = {
        kind: "project_update",
        input,
        project,
      };

      return {
        content: [{ type: "text" as const, text: formatProjectUpdateContent(project, input) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "project_update failed"), { cause: error });
    }
  },
});

const createProjectDeleteToolDefinition = ({
  getProjectService,
}: ProjectMutationToolDependencies) => ({
  name: "project_delete",
  label: "Project Delete",
  description: "Delete a plain project record by explicit project ID.",
  promptSnippet: "Delete a plain project record by explicit project ID.",
  promptGuidelines: [
    "Use this tool for plain project deletion in normal chat.",
    "Do not use it for repository unregister or integration-binding changes.",
  ],
  parameters: ProjectDeleteParams,
  async execute(_toolCallId: string, params: ProjectDeleteToolParams) {
    const projectId = normalizeRequiredText(params.projectId, "projectId");

    try {
      const projectService = await getProjectService();
      const project = await projectService.deleteProject(projectId);
      const details: ProjectDeleteToolDetails = {
        kind: "project_delete",
        projectId,
        found: true,
        deleted: true,
        project,
      };

      return {
        content: [{ type: "text" as const, text: formatProjectDeleteContent(details) }],
        details,
      };
    } catch (error) {
      if (isProjectNotFoundError(error)) {
        const details: ProjectDeleteToolDetails = {
          kind: "project_delete",
          projectId,
          found: false,
          deleted: false,
        };

        return {
          content: [{ type: "text" as const, text: formatProjectDeleteContent(details) }],
          details,
        };
      }

      throw new Error(formatToolError(error, "project_delete failed"), { cause: error });
    }
  },
});

const registerProjectMutationTools = (
  pi: Pick<ExtensionAPI, "registerTool">,
  dependencies: ProjectMutationToolDependencies
): void => {
  pi.registerTool(createProjectCreateToolDefinition(dependencies));
  pi.registerTool(createProjectUpdateToolDefinition(dependencies));
  pi.registerTool(createProjectDeleteToolDefinition(dependencies));
};

const normalizeCreateProjectInput = (params: ProjectCreateToolParams): CreateProjectInput => ({
  name: normalizeRequiredText(params.name, "name"),
  description: normalizeOptionalDescription(params, "description"),
  priority: params.priority,
});

const normalizeUpdateProjectInput = (params: ProjectUpdateToolParams): UpdateProjectInput => {
  const input: UpdateProjectInput = {
    projectId: normalizeRequiredText(params.projectId, "projectId"),
    status: params.status,
    priority: params.priority,
  };

  if (hasOwn(params, "name")) {
    input.name = normalizeRequiredText(params.name ?? "", "name");
  }

  if (hasOwn(params, "description")) {
    input.description = normalizeNullableText(params.description);
  }

  if (
    input.name === undefined &&
    input.status === undefined &&
    input.priority === undefined &&
    !hasOwn(input, "description")
  ) {
    throw new Error(
      "project_update requires at least one supported field: name, description, status, or priority"
    );
  }

  return input;
};

const normalizeOptionalDescription = <TValue extends { description?: string }>(
  params: TValue,
  fieldName: "description"
): string | null | undefined => {
  if (!hasOwn(params, fieldName)) {
    return undefined;
  }

  return normalizeNullableText(params[fieldName]);
};

const normalizeRequiredText = (value: string, fieldName: string): string => {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    throw new Error(`${fieldName} is required`);
  }

  return trimmedValue;
};

const normalizeNullableText = (value: string | null | undefined): string | null => {
  const trimmedValue = value?.trim() ?? "";
  return trimmedValue.length > 0 ? trimmedValue : null;
};

const hasOwn = <TObject extends object>(value: TObject, property: keyof TObject): boolean =>
  Object.prototype.hasOwnProperty.call(value, property);

const isProjectNotFoundError = (error: unknown): error is ToduProjectServiceError =>
  error instanceof ToduProjectServiceError && error.causeCode === "not-found";

const formatProjectCreateContent = (project: ProjectSummary): string =>
  [
    `Created project ${project.id}: ${project.name}`,
    `Status: ${project.status}`,
    `Priority: ${project.priority}`,
  ].join("\n");

const formatProjectUpdateContent = (project: ProjectSummary, input: UpdateProjectInput): string => {
  const changedFields = [
    input.name !== undefined ? `name=${JSON.stringify(input.name)}` : null,
    input.status !== undefined ? `status=${input.status}` : null,
    input.priority !== undefined ? `priority=${input.priority}` : null,
    hasOwn(input, "description")
      ? `description=${input.description === null ? "cleared" : "updated"}`
      : null,
  ].filter((value): value is string => value !== null);

  return [
    `Updated project ${project.id}: ${project.name}`,
    `Changes: ${changedFields.join(", ")}`,
  ].join("\n");
};

const formatProjectDeleteContent = (details: ProjectDeleteToolDetails): string =>
  details.found
    ? `Deleted project ${details.projectId}.`
    : `Project not found: ${details.projectId}`;

const formatToolError = (error: unknown, prefix: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
};

export type {
  ProjectCreateToolDetails,
  ProjectMutationToolDependencies,
  ProjectUpdateToolDetails,
  ProjectDeleteToolDetails,
};
export {
  createProjectCreateToolDefinition,
  createProjectDeleteToolDefinition,
  createProjectUpdateToolDefinition,
  normalizeCreateProjectInput,
  normalizeUpdateProjectInput,
  registerProjectMutationTools,
};
