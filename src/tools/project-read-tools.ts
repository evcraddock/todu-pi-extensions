import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import type { ProjectSummary } from "../domain/task";
import type { TaskService } from "../services/task-service";

const ProjectListParams = Type.Object({});
const ProjectShowParams = Type.Object({
  projectRef: Type.String({ description: "Project ID or unique project name" }),
});
const MAX_PROJECT_LIST_PREVIEW_COUNT = 25;

interface ProjectListToolDetails {
  kind: "project_list";
  projects: ProjectSummary[];
  total: number;
  empty: boolean;
}

interface ProjectShowToolDetails {
  kind: "project_show";
  projectRef: string;
  found: boolean;
  project?: ProjectSummary;
}

interface ProjectShowToolParams {
  projectRef: string;
}

interface ProjectReadToolDependencies {
  getTaskService: () => Promise<TaskService>;
}

const createProjectListToolDefinition = ({ getTaskService }: ProjectReadToolDependencies) => ({
  name: "project_list",
  label: "Project List",
  description: "List projects.",
  promptSnippet: "List projects using the native backend tool.",
  promptGuidelines: [
    "Use this tool when the user asks to list projects in normal chat.",
    "Keep project_list unfiltered in V1.",
  ],
  parameters: ProjectListParams,
  async execute(_toolCallId: string, _params: Record<string, never>) {
    try {
      const taskService = await getTaskService();
      const projects = await taskService.listProjects();
      const details: ProjectListToolDetails = {
        kind: "project_list",
        projects,
        total: projects.length,
        empty: projects.length === 0,
      };

      return {
        content: [{ type: "text" as const, text: formatProjectListContent(details) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "project_list failed"), { cause: error });
    }
  },
});

const createProjectShowToolDefinition = ({ getTaskService }: ProjectReadToolDependencies) => ({
  name: "project_show",
  label: "Project Show",
  description: "Show project details by ID or unique name.",
  promptSnippet: "Show details for a project by explicit ID or unique name.",
  promptGuidelines: [
    "Use this tool when the user asks for details about a known project.",
    "Resolve by project ID first, then by unique name when needed.",
    "If the project is missing or ambiguous, report that explicitly instead of guessing.",
  ],
  parameters: ProjectShowParams,
  async execute(_toolCallId: string, params: ProjectShowToolParams) {
    const projectRef = normalizeRequiredText(params.projectRef, "projectRef");

    try {
      const taskService = await getTaskService();
      const project = await resolveProjectByRef(taskService, projectRef);
      if (!project) {
        const details: ProjectShowToolDetails = {
          kind: "project_show",
          projectRef,
          found: false,
        };

        return {
          content: [{ type: "text" as const, text: `Project not found: ${projectRef}` }],
          details,
        };
      }

      const details: ProjectShowToolDetails = {
        kind: "project_show",
        projectRef,
        found: true,
        project,
      };

      return {
        content: [{ type: "text" as const, text: formatProjectShowContent(project) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "project_show failed"), { cause: error });
    }
  },
});

const registerProjectReadTools = (
  pi: Pick<ExtensionAPI, "registerTool">,
  dependencies: ProjectReadToolDependencies
): void => {
  pi.registerTool(createProjectListToolDefinition(dependencies));
  pi.registerTool(createProjectShowToolDefinition(dependencies));
};

const resolveProjectByRef = async (
  taskService: TaskService,
  projectRef: string
): Promise<ProjectSummary | null> => {
  const project = await taskService.getProject(projectRef);
  if (project) {
    return project;
  }

  const projects = await taskService.listProjects();
  const nameMatches = projects.filter((candidate) => candidate.name === projectRef);
  if (nameMatches.length === 0) {
    return null;
  }

  if (nameMatches.length > 1) {
    throw new Error(`project_show found multiple projects named: ${projectRef}`);
  }

  return nameMatches[0] ?? null;
};

const formatProjectListContent = (details: ProjectListToolDetails): string => {
  if (details.empty) {
    return "No projects found.";
  }

  const previewProjects = details.projects.slice(0, MAX_PROJECT_LIST_PREVIEW_COUNT);
  const lines = [`Projects (${details.total}):`];

  for (const project of previewProjects) {
    lines.push(`- ${formatProjectSummaryLine(project)}`);
  }

  const remainingCount = details.total - previewProjects.length;
  if (remainingCount > 0) {
    lines.push(`- ... ${remainingCount} more project(s)`);
  }

  return lines.join("\n");
};

const formatProjectShowContent = (project: ProjectSummary): string =>
  [
    `Project ${project.id}: ${project.name}`,
    "",
    `Status: ${project.status}`,
    `Priority: ${project.priority}`,
    "",
    "Description:",
    project.description?.trim().length ? project.description : "(none)",
  ].join("\n");

const formatProjectSummaryLine = (project: ProjectSummary): string =>
  `${project.id} • ${project.name} • ${project.status} • ${project.priority}`;

const normalizeRequiredText = (value: string, fieldName: string): string => {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    throw new Error(`${fieldName} is required`);
  }

  return trimmedValue;
};

const formatToolError = (error: unknown, prefix: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
};

export type { ProjectListToolDetails, ProjectReadToolDependencies, ProjectShowToolDetails };
export {
  createProjectListToolDefinition,
  createProjectShowToolDefinition,
  formatProjectListContent,
  formatProjectShowContent,
  registerProjectReadTools,
  resolveProjectByRef,
};
