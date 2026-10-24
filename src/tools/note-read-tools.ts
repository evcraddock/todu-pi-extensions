import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { stringEnum } from "./string-enum";
import { NoteListDataSchema, NoteShowDataSchema } from "./trust-tool-schemas";
import {
  classifyTrustToolError,
  createTrustResultBuilder,
  projectTrustData,
} from "./trust-tool-results";
import { projectNote } from "./trust-tool-projections";

import type { NoteEntityType, NoteFilter, NoteSummary } from "../domain/note";
import type { NoteService } from "../services/note-service";
import { formatApprovalSummary } from "../utils/approval-format";
import { getSystemTimezone } from "../utils/timezone";

const noteListResult = createTrustResultBuilder(NoteListDataSchema, "note_list");
const noteShowResult = createTrustResultBuilder(NoteShowDataSchema, "note_show");

const NOTE_ENTITY_TYPE_VALUES = ["task", "project", "habit"] as const;

const NoteShowParams = Type.Object({
  noteId: Type.String({ description: "Note ID" }),
});

const NoteListParams = Type.Object({
  entityType: Type.Optional(
    stringEnum(NOTE_ENTITY_TYPE_VALUES, {
      description: "Optional entity type filter (task, project, habit)",
    })
  ),
  entityId: Type.Optional(
    Type.String({ description: "Optional entity ID filter (task ID, project ID, or habit ID)" })
  ),
  tag: Type.Optional(Type.String({ description: "Optional tag filter" })),
  author: Type.Optional(Type.String({ description: "Optional legacy author display filter" })),
  authorActorId: Type.Optional(Type.String({ description: "Optional author actor ID filter" })),
  from: Type.Optional(Type.String({ description: "Optional created-at start date (YYYY-MM-DD)" })),
  to: Type.Optional(Type.String({ description: "Optional created-at end date (YYYY-MM-DD)" })),
  journal: Type.Optional(
    Type.Boolean({ description: "Filter to standalone journal entries only" })
  ),
  timezone: Type.Optional(Type.String({ description: "IANA timezone (auto-detected if omitted)" })),
});

interface NoteListToolParams {
  entityType?: NoteEntityType;
  entityId?: string;
  tag?: string;
  author?: string;
  authorActorId?: string;
  from?: string;
  to?: string;
  journal?: boolean;
  timezone?: string;
}

interface NoteListToolDetails {
  kind: "note_list";
  filter: NoteFilter;
  notes: NoteSummary[];
  total: number;
  empty: boolean;
}

interface NoteShowToolParams {
  noteId: string;
}

interface NoteShowToolDetails {
  kind: "note_show";
  noteId: string;
  found: boolean;
  note?: NoteSummary;
}

interface NoteReadToolDependencies {
  getNoteService: () => Promise<NoteService>;
}

const createNoteListToolDefinition = ({ getNoteService }: NoteReadToolDependencies) => ({
  name: "note_list",
  label: "Note List",
  description:
    "List notes with optional entity type, entity ID, tag, author, date range, and journal filters.",
  promptSnippet:
    "List notes using structured filters for entity type, entity ID, tag, author, date range, or journal mode.",
  promptGuidelines: [
    "Use this tool for backend note lookups in normal chat.",
    "Use entityType and entityId together to scope notes to a specific task, project, or habit.",
    "Use journal=true to find standalone journal entries without an attached entity.",
  ],
  parameters: NoteListParams,
  outputSchema: noteListResult.outputSchema,
  async execute(_toolCallId: string, params: NoteListToolParams) {
    const filter = projectTrustData(() => normalizeNoteListFilter(params));
    let raw: NoteSummary[];
    try {
      raw = await (await getNoteService()).listNotes(filter);
    } catch (error) {
      const status = classifyTrustToolError({ error, tool: "note_list" });
      return noteListResult.failure({ status: status === "not_found" ? "backend_error" : status });
    }
    const notes = projectTrustData(() => raw.map(projectNote));
    const details: NoteListToolDetails = {
      kind: "note_list",
      filter,
      notes,
      total: notes.length,
      empty: notes.length === 0,
    };
    return noteListResult.success({
      data: { filter, notes, total: details.total, empty: details.empty },
      details,
      empty: details.empty,
      text: projectTrustData(() => formatNoteListContent(details)),
    });
  },
});

const createNoteShowToolDefinition = ({ getNoteService }: NoteReadToolDependencies) => ({
  name: "note_show",
  label: "Note Show",
  description: "Show full note details by note ID.",
  promptSnippet: "Show details for a specific note by note ID.",
  promptGuidelines: [
    "Use this tool when the user asks for details about a known note ID.",
    "If the note is missing, report the explicit not-found result instead of guessing.",
  ],
  parameters: NoteShowParams,
  outputSchema: noteShowResult.outputSchema,
  async execute(_toolCallId: string, params: NoteShowToolParams) {
    if (!params.noteId.trim()) return noteShowResult.failure({ status: "validation_error" });
    const target = { entityType: "note" as const, entityId: params.noteId };
    let service: NoteService;
    try {
      service = await getNoteService();
    } catch (error) {
      const status = classifyTrustToolError({ error, tool: "note_show" });
      return noteShowResult.failure({ status: status === "not_found" ? "backend_error" : status });
    }
    let raw: NoteSummary | null;
    try {
      raw = await service.getNote(params.noteId);
    } catch (error) {
      return noteShowResult.failure({
        status: classifyTrustToolError({ error, tool: "note_show" }),
        target,
      });
    }
    if (raw === null) {
      const details: NoteShowToolDetails = {
        kind: "note_show",
        noteId: params.noteId,
        found: false,
      };
      return noteShowResult.failure({
        status: "not_found",
        target,
        details,
        text: `Note not found: ${params.noteId}`,
      });
    }
    const note = projectTrustData(() => projectNote(raw));
    const details: NoteShowToolDetails = {
      kind: "note_show",
      noteId: params.noteId,
      found: true,
      note,
    };
    return noteShowResult.success({
      data: { note },
      details,
      text: projectTrustData(() => formatNoteShowContent(note)),
    });
  },
});

const registerNoteReadTools = (
  pi: Pick<ExtensionAPI, "registerTool">,
  dependencies: NoteReadToolDependencies
): void => {
  pi.registerTool(createNoteListToolDefinition(dependencies));
  pi.registerTool(createNoteShowToolDefinition(dependencies));
};

const normalizeNoteListFilter = (params: NoteListToolParams): NoteFilter => ({
  entityType: params.entityType ?? undefined,
  entityId: normalizeOptionalText(params.entityId),
  tag: normalizeOptionalText(params.tag),
  author: normalizeOptionalText(params.author),
  authorActorId: normalizeOptionalText(params.authorActorId),
  from: normalizeOptionalText(params.from),
  to: normalizeOptionalText(params.to),
  journal: params.journal ?? undefined,
  timezone: normalizeOptionalText(params.timezone) ?? getSystemTimezone(),
});

const normalizeOptionalText = (value: string | null | undefined): string | undefined => {
  const trimmedValue = value?.trim();
  return trimmedValue && trimmedValue.length > 0 ? trimmedValue : undefined;
};

const formatNoteListContent = (details: NoteListToolDetails): string => {
  if (details.empty) {
    return "No notes found.";
  }

  const lines = [`Notes (${details.total}):`];

  for (const note of details.notes) {
    lines.push(`- ${formatNoteSummaryLine(note)}`);
  }

  return lines.join("\n");
};

const formatNoteSummaryLine = (note: NoteSummary): string => {
  const entityLabel = note.entityType ? `${note.entityType}:${note.entityId ?? "?"}` : "journal";
  const tagLabel = note.tags.length > 0 ? note.tags.join(", ") : "no tags";
  const approvalLabel = formatApprovalSummary(note.contentApproval) ?? "no approval metadata";
  return `${note.id} • ${entityLabel} • ${note.authorDisplayName} • ${tagLabel} • ${approvalLabel} • ${note.createdAt}\n    ${note.content}`;
};

const formatNoteShowContent = (note: NoteSummary): string => {
  const entityLabel = note.entityType ? `${note.entityType}:${note.entityId ?? "?"}` : "journal";
  const tagLabel = note.tags.length > 0 ? note.tags.join(", ") : "no tags";

  return [
    `Note ${note.id}`,
    "",
    `Author: ${note.authorDisplayName}`,
    `Entity: ${entityLabel}`,
    `Tags: ${tagLabel}`,
    `Approval: ${formatApprovalSummary(note.contentApproval) ?? "none"}`,
    `Created: ${note.createdAt}`,
    "",
    "Content:",
    note.content.trim().length > 0 ? note.content : "(empty)",
  ].join("\n");
};

export type { NoteListToolDetails, NoteShowToolDetails, NoteReadToolDependencies };
export {
  createNoteListToolDefinition,
  createNoteShowToolDefinition,
  formatNoteListContent,
  formatNoteShowContent,
  normalizeNoteListFilter,
  registerNoteReadTools,
};
