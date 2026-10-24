import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { stringEnum } from "./string-enum";
import { ApprovalListDataSchema, ApprovalUpdateDataSchema } from "./trust-tool-schemas";
import {
  classifyTrustToolError,
  createTrustResultBuilder,
  optionalTrustRead,
  projectTrustData,
  type TrustToolWarning,
} from "./trust-tool-results";
import { projectApprovalItem } from "./trust-tool-projections";

import type { ApprovalItem, ApprovalItemKind, ApprovalListFilter } from "../domain/approval";
import type { ActorService } from "../services/actor-service";
import type { ApprovalService } from "../services/approval-service";

const approvalListResult = createTrustResultBuilder(ApprovalListDataSchema, "approval_list");
const approveTaskResult = createTrustResultBuilder(
  ApprovalUpdateDataSchema,
  "approval_approve_task_description"
);
const approveNoteResult = createTrustResultBuilder(
  ApprovalUpdateDataSchema,
  "approval_approve_note_content"
);

const APPROVAL_KIND_VALUES = ["taskDescription", "noteContent"] as const;

const ApprovalListParams = Type.Object({
  kind: Type.Optional(
    stringEnum(APPROVAL_KIND_VALUES, { description: "Optional approval item kind filter" })
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
  outputSchema: approvalListResult.outputSchema,
  async execute(_toolCallId: string, params: ApprovalListToolParams) {
    const filter = normalizeApprovalListFilter(params);
    let raw: ApprovalItem[];
    try {
      raw = await (await getApprovalService()).listApprovals(filter);
    } catch (error) {
      const status = classifyTrustToolError({ error, tool: "approval_list" });
      return approvalListResult.failure({
        status: status === "not_found" ? "backend_error" : status,
      });
    }
    const items = projectTrustData(() => raw.map(projectApprovalItem));
    const warnings: TrustToolWarning[] = [];
    const actorMap = await listActorsBestEffort(getActorService, warnings);
    const details = {
      kind: "approval_list" as const,
      filter,
      items,
      total: items.length,
      empty: items.length === 0,
    };
    return approvalListResult.success({
      data: { filter, items, total: details.total, empty: details.empty },
      details,
      text: projectTrustData(() => formatApprovalListContent(items, actorMap)),
      empty: details.empty,
      warnings,
    });
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
  outputSchema: approveTaskResult.outputSchema,
  async execute(_toolCallId: string, params: { taskId: string }) {
    return executeApprovalUpdate({
      getApprovalService,
      getActorService,
      result: approveTaskResult,
      tool: "approval_approve_task_description",
      target: { entityType: "task", entityId: params.taskId },
      approve: (service, id) => service.approveTaskDescription(id),
    });
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
  outputSchema: approveNoteResult.outputSchema,
  async execute(_toolCallId: string, params: { noteId: string }) {
    return executeApprovalUpdate({
      getApprovalService,
      getActorService,
      result: approveNoteResult,
      tool: "approval_approve_note_content",
      target: { entityType: "note", entityId: params.noteId },
      approve: (service, id) => service.approveNoteContent(id),
    });
  },
});

interface ExecuteApprovalUpdateOptions extends ApprovalToolDependencies {
  tool: "approval_approve_task_description" | "approval_approve_note_content";
  target: { entityType: "task" | "note"; entityId: string };
  result: typeof approveTaskResult;
  approve: (service: ApprovalService, id: string) => Promise<ApprovalItem>;
}

const executeApprovalUpdate = async ({
  getApprovalService,
  getActorService,
  tool,
  target,
  result,
  approve,
}: ExecuteApprovalUpdateOptions) => {
  const id = target.entityId.trim();
  if (!id) return result.failure({ status: "validation_error" });
  const normalizedTarget = { ...target, entityId: id };
  let service: ApprovalService;
  try {
    service = await getApprovalService();
  } catch (error) {
    const status = classifyTrustToolError({ error, tool });
    return result.failure({ status: status === "not_found" ? "backend_error" : status });
  }
  let raw: ApprovalItem;
  try {
    raw = await approve(service, id);
  } catch (error) {
    return result.failure({
      status: classifyTrustToolError({ error, tool, dispatched: true }),
      target: normalizedTarget,
    });
  }
  const item = projectTrustData(() => projectApprovalItem(raw));
  const warnings: TrustToolWarning[] = [];
  const actorMap = await listActorsBestEffort(getActorService, warnings);
  return result.success({
    data: { item },
    details: {
      kind: tool,
      ...(target.entityType === "task" ? { taskId: id } : { noteId: id }),
      item,
    },
    text: projectTrustData(() => `Approval updated:\n${formatApprovalItem(item, actorMap)}`),
    warnings,
  });
};

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
  getActorService: (() => Promise<ActorService>) | undefined,
  warnings: TrustToolWarning[]
): Promise<Map<string, string>> => {
  if (!getActorService) return new Map();
  return optionalTrustRead({
    read: async () => {
      const actors = await (await getActorService()).listActors();
      return new Map(actors.map((actor) => [actor.id, actor.displayName]));
    },
    fallback: new Map<string, string>(),
    warnings,
    code: "actors_unavailable",
    message: "Actor display metadata is unavailable; source IDs are retained.",
  });
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

export {
  createApprovalListToolDefinition,
  createApproveNoteContentToolDefinition,
  createApproveTaskDescriptionToolDefinition,
  formatApprovalListContent,
  registerApprovalTools,
};
