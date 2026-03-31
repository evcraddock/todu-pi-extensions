import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import type { RecurringTemplateSummary } from "../domain/recurring";
import type { RecurringService } from "../services/recurring-service";

const RecurringListParams = Type.Object({});
const MAX_RECURRING_LIST_PREVIEW_COUNT = 25;

interface RecurringListToolDetails {
  kind: "recurring_list";
  templates: RecurringTemplateSummary[];
  total: number;
  empty: boolean;
}

interface RecurringReadToolDependencies {
  getRecurringService: () => Promise<RecurringService>;
}

const createRecurringListToolDefinition = ({
  getRecurringService,
}: RecurringReadToolDependencies) => ({
  name: "recurring_list",
  label: "Recurring List",
  description: "List recurring task templates.",
  promptSnippet: "List recurring task templates through the native recurring service.",
  promptGuidelines: [
    "Use this tool for backend recurring template lookups in normal chat.",
    "Keep recurring_list unfiltered in the first wave unless the task explicitly widens scope.",
  ],
  parameters: RecurringListParams,
  async execute(_toolCallId: string, _params: Record<string, never>) {
    try {
      const recurringService = await getRecurringService();
      const templates = await recurringService.listRecurring();
      const details: RecurringListToolDetails = {
        kind: "recurring_list",
        templates,
        total: templates.length,
        empty: templates.length === 0,
      };

      return {
        content: [{ type: "text" as const, text: formatRecurringListContent(details) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "recurring_list failed"), { cause: error });
    }
  },
});

const registerRecurringReadTools = (
  pi: Pick<ExtensionAPI, "registerTool">,
  dependencies: RecurringReadToolDependencies
): void => {
  pi.registerTool(createRecurringListToolDefinition(dependencies));
};

const formatRecurringListContent = (details: RecurringListToolDetails): string => {
  if (details.empty) {
    return "No recurring templates found.";
  }

  const previewTemplates = details.templates.slice(0, MAX_RECURRING_LIST_PREVIEW_COUNT);
  const lines = [`Recurring templates (${details.total}):`];

  for (const template of previewTemplates) {
    lines.push(`- ${formatRecurringSummaryLine(template)}`);
  }

  const remainingCount = details.total - previewTemplates.length;
  if (remainingCount > 0) {
    lines.push(`- ... ${remainingCount} more recurring template(s)`);
  }

  return lines.join("\n");
};

const formatRecurringSummaryLine = (template: RecurringTemplateSummary): string => {
  const projectLabel = template.projectName ?? template.projectId;
  const status = template.paused ? "paused" : "active";
  return `${template.id} • ${template.title} • ${status} • ${template.priority} • ${projectLabel}`;
};

const formatToolError = (error: unknown, prefix: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
};

export type { RecurringListToolDetails, RecurringReadToolDependencies };
export {
  createRecurringListToolDefinition,
  formatRecurringListContent,
  registerRecurringReadTools,
};
