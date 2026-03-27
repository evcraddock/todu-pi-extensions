import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import type { ProjectSummary } from "../domain/task";
import type { TaskService } from "../services/task-service";

const ProjectListParams = Type.Object({});
const MAX_PROJECT_LIST_PREVIEW_COUNT = 25;

interface ProjectListToolDetails {
  kind: "project_list";
  projects: ProjectSummary[];
  total: number;
  empty: boolean;
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

const registerProjectReadTools = (
  pi: Pick<ExtensionAPI, "registerTool">,
  dependencies: ProjectReadToolDependencies
): void => {
  pi.registerTool(createProjectListToolDefinition(dependencies));
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

const formatProjectSummaryLine = (project: ProjectSummary): string =>
  `${project.id} • ${project.name} • ${project.status} • ${project.priority}`;

const formatToolError = (error: unknown, prefix: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
};

export type { ProjectListToolDetails, ProjectReadToolDependencies };
export { createProjectListToolDefinition, formatProjectListContent, registerProjectReadTools };
