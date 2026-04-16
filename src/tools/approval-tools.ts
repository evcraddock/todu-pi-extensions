import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import type { ApprovalItem, ApprovalItemKind, ApprovalListFilter } from "../domain/approval";
import type { ActorService } from "../services/actor-service";
import type { ApprovalService } from "../services/approval-service";

const APPROVAL_KIND_VALUES = ["taskDescription", "noteContent"] as const;

const ApprovalListParams = Type.Object({
  kind: Type.Optional(
    StringEnum(APPROVAL_KIND_VALUES, { description: "Optional approval item kind filter" })
  ),
});

const ApprovalApproveTaskParams = Type.Object({
  taskId: Type.String({ description: "Task ID" }),
});

const ApprovalApproveNoteParams = Type.Object({
  noteId: Type.String({ description: "Note ID" }),
});

interface ApprovalListToolParams {
  kind?: ApprovalItemKind;
}

interface ApprovalToolDependencies {
  getApprovalService: () => Promise<ApprovalService>;
  getActorService?: () => Promise<ActorService>;
}

const createApprovalListToolDefinition = ({
  getApprovalService,
  getActorService,
}: ApprovalToolDependencies) => ({
  name: "approval_list",
  label: "Approval List",
  description: "List pending imported-content approval items.",
  promptSnippet: "List approval-needed items for imported content.",
  promptGuidelines: ["Use this tool for approval-needed list/filter lookups in normal chat."],
  parameters: ApprovalListParams,
  async execute(_toolCallId: string, params: ApprovalListToolParams) {
    try {
      const approvalService = await getApprovalService();
      const items = await approvalService.listApprovals(normalizeApprovalListFilter(params));
      const actorMap = await listActorsBestEffort(getActorService);

      return {
        content: [{ type: "text" as const, text: formatApprovalListContent(items, actorMap) }],
        details: {
          kind: "approval_list",
          filter: normalizeApprovalListFilter(params),
          items,
          total: items.length,
          empty: items.length === 0,
        },
      };
    } catch (error) {
      throw new Error(formatToolError(error, "approval_list failed"), { cause: error });
    }
  },
});

const createApproveTaskDescriptionToolDefinition = ({
  getApprovalService,
  getActorService,
}: ApprovalToolDependencies) => ({
  name: "approval_approve_task_description",
  label: "Approve Task Description",
  description: "Approve pending imported task description content.",
  promptSnippet: "Approve imported task description content explicitly.",
  parameters: ApprovalApproveTaskParams,
  async execute(_toolCallId: string, params: { taskId: string }) {
    const taskId = normalizeRequiredText(params.taskId, "taskId");

    try {
      const approvalService = await getApprovalService();
      const item = await approvalService.approveTaskDescription(taskId);
      const actorMap = await listActorsBestEffort(getActorService);

      return {
        content: [
          {
            type: "text" as const,
            text: `Approval updated:\n${formatApprovalItem(item, actorMap)}`,
          },
        ],
        details: { kind: "approval_approve_task_description", taskId, item },
      };
    } catch (error) {
      throw new Error(formatToolError(error, "approval_approve_task_description failed"), {
        cause: error,
      });
    }
  },
});

const createApproveNoteContentToolDefinition = ({
  getApprovalService,
  getActorService,
}: ApprovalToolDependencies) => ({
  name: "approval_approve_note_content",
  label: "Approve Note Content",
  description: "Approve pending imported note or comment content.",
  promptSnippet: "Approve imported note or comment content explicitly.",
  parameters: ApprovalApproveNoteParams,
  async execute(_toolCallId: string, params: { noteId: string }) {
    const noteId = normalizeRequiredText(params.noteId, "noteId");

    try {
      const approvalService = await getApprovalService();
      const item = await approvalService.approveNoteContent(noteId);
      const actorMap = await listActorsBestEffort(getActorService);

      return {
        content: [
          {
            type: "text" as const,
            text: `Approval updated:\n${formatApprovalItem(item, actorMap)}`,
          },
        ],
        details: { kind: "approval_approve_note_content", noteId, item },
      };
    } catch (error) {
      throw new Error(formatToolError(error, "approval_approve_note_content failed"), {
        cause: error,
      });
    }
  },
});

const registerApprovalTools = (
  pi: Pick<ExtensionAPI, "registerTool">,
  dependencies: ApprovalToolDependencies
): void => {
  pi.registerTool(createApprovalListToolDefinition(dependencies));
  pi.registerTool(createApproveTaskDescriptionToolDefinition(dependencies));
  pi.registerTool(createApproveNoteContentToolDefinition(dependencies));
};

const normalizeApprovalListFilter = (params: ApprovalListToolParams): ApprovalListFilter => ({
  kind: params.kind,
});

const listActorsBestEffort = async (
  getActorService: (() => Promise<ActorService>) | undefined
): Promise<Map<string, string>> => {
  if (!getActorService) {
    return new Map();
  }

  try {
    const actors = await (await getActorService()).listActors();
    return new Map(actors.map((actor) => [actor.id, actor.displayName]));
  } catch {
    return new Map();
  }
};

const formatApprovalListContent = (
  items: ApprovalItem[],
  actorMap: Map<string, string>
): string => {
  if (items.length === 0) {
    return "No approval-needed items found.";
  }

  return [
    `Approval-needed items (${items.length}):`,
    ...items.map((item) => `- ${formatApprovalLine(item, actorMap)}`),
  ].join("\n");
};

const formatApprovalItem = (item: ApprovalItem, actorMap: Map<string, string>): string =>
  [
    `Kind: ${formatApprovalKind(item.kind)}`,
    `State: ${item.state}`,
    `Target: ${item.taskId ?? item.noteId ?? "-"}`,
    `Source: ${formatActorRef(item.sourceActorId, actorMap) ?? item.sourceBindingId ?? "-"}`,
    `Preview: ${item.contentPreview}`,
  ].join("\n");

const formatApprovalLine = (item: ApprovalItem, actorMap: Map<string, string>): string =>
  `${formatApprovalKind(item.kind)} • ${item.taskTitle ?? item.taskId ?? item.noteId ?? "-"} • ${item.state} • ${formatActorRef(item.sourceActorId, actorMap) ?? item.sourceBindingId ?? "-"} • ${item.contentPreview}`;

const formatApprovalKind = (kind: ApprovalItemKind): string =>
  kind === "taskDescription" ? "task description" : "note content";

const formatActorRef = (
  actorId: string | undefined,
  actorMap: Map<string, string>
): string | null => (actorId ? `${actorMap.get(actorId) ?? actorId} (${actorId})` : null);

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

export {
  createApprovalListToolDefinition,
  createApproveNoteContentToolDefinition,
  createApproveTaskDescriptionToolDefinition,
  formatApprovalListContent,
  registerApprovalTools,
};
