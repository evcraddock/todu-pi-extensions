import type { TaskDetail, TaskEnrichmentSource } from "../../domain/task";

const ENRICHMENT_MESSAGES: Record<TaskEnrichmentSource, string> = {
  comments: "Comments could not be loaded; the returned comment list is incomplete.",
  actors: "Actor metadata could not be loaded; display names and actor state may be incomplete.",
  project:
    "Project metadata could not be loaded; project name and authorization annotations may be incomplete.",
  "integration-warnings":
    "Outbound assignee warnings could not be checked; an empty warning list is incomplete.",
};

export const withEnrichmentWarning = (
  task: TaskDetail,
  source: TaskEnrichmentSource
): TaskDetail => {
  if (task.enrichmentWarnings?.some((warning) => warning.source === source)) {
    return task;
  }
  return {
    ...task,
    enrichmentWarnings: [
      ...(task.enrichmentWarnings ?? []),
      { source, message: ENRICHMENT_MESSAGES[source] },
    ],
  };
};
