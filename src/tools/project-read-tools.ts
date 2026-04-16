import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import type { ActorSummary } from "../domain/actor";
import type { ProjectSummary, TaskSummary } from "../domain/task";
import type { ActorService } from "../services/actor-service";
import type { ProjectService } from "../services/project-service";
import type { TaskService } from "../services/task-service";

const ProjectListParams = Type.Object({});
const ProjectShowParams = Type.Object({
  projectRef: Type.String({ description: "Project ID or unique project name" }),
});

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
  getProjectService: () => Promise<ProjectService>;
  getActorService?: () => Promise<ActorService>;
  getTaskService?: () => Promise<TaskService>;
}

const createProjectListToolDefinition = ({ getProjectService }: ProjectReadToolDependencies) => ({
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
      const projectService = await getProjectService();
      const projects = await projectService.listProjects();
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

const createProjectShowToolDefinition = ({
  getProjectService,
  getActorService,
  getTaskService,
}: ProjectReadToolDependencies) => ({
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
      const projectService = await getProjectService();
      const project = await resolveProjectByRef(projectService, projectRef);
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

      const [actors, tasks] = await Promise.all([
        getActorService
          ? getActorService().then((service) => service.listActors())
          : Promise.resolve([]),
        getTaskService
          ? getTaskService().then((service) => service.listTasks({ projectId: project.id }))
          : Promise.resolve([]),
      ]);

      return {
        content: [
          { type: "text" as const, text: formatProjectShowContent(project, actors, tasks) },
        ],
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
  projectService: ProjectService,
  projectRef: string
): Promise<ProjectSummary | null> => {
  const project = await projectService.getProject(projectRef);
  if (project) {
    return project;
  }

  const projects = await projectService.listProjects();
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

  const lines = [`Projects (${details.total}):`];

  for (const project of details.projects) {
    lines.push(`- ${formatProjectSummaryLine(project)}`);
  }

  return lines.join("\n");
};

const formatProjectShowContent = (
  project: ProjectSummary,
  actors: ActorSummary[] = [],
  tasks: TaskSummary[] = []
): string => {
  const actorMap = new Map(actors.map((actor) => [actor.id, actor]));
  const authorizedActors =
    project.authorizedAssigneeActorIds.length > 0
      ? project.authorizedAssigneeActorIds.map((actorId) => {
          const actor = actorMap.get(actorId);
          return actor ? `${actor.displayName}${actor.archived ? " (archived)" : ""}` : actorId;
        })
      : ["(none)"];
  const staleUnauthorizedTasks = tasks.filter((task) =>
    task.assigneeActorIds.some((actorId) => !project.authorizedAssigneeActorIds.includes(actorId))
  );

  const lines = [
    `Project ${project.id}: ${project.name}`,
    "",
    `Status: ${project.status}`,
    `Priority: ${project.priority}`,
    `Authorized assignees: ${authorizedActors.join(", ")}`,
    "",
    "Description:",
    project.description?.trim().length ? project.description : "(none)",
  ];

  if (staleUnauthorizedTasks.length > 0) {
    lines.push("", "Stale unauthorized assignees:");
    for (const task of staleUnauthorizedTasks) {
      lines.push(`- ${task.id} • ${task.title} • ${task.assigneeDisplayNames.join(", ")}`);
    }
  }

  return lines.join("\n");
};

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
