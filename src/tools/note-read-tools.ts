import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import type { NoteEntityType, NoteFilter, NoteSummary } from "../domain/note";
import type { NoteService } from "../services/note-service";
import { formatApprovalSummary } from "../utils/approval-format";
import { getSystemTimezone } from "../utils/timezone";

const NOTE_ENTITY_TYPE_VALUES = ["task", "project", "habit"] as const;

const NoteShowParams = Type.Object({
  noteId: Type.String({ description: "Note ID" }),
});

const NoteListParams = Type.Object({
  entityType: Type.Optional(
    StringEnum(NOTE_ENTITY_TYPE_VALUES, {
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
  async execute(_toolCallId: string, params: NoteListToolParams) {
    const filter = normalizeNoteListFilter(params);

    try {
      const noteService = await getNoteService();
      const notes = await noteService.listNotes(filter);
      const details: NoteListToolDetails = {
        kind: "note_list",
        filter,
        notes,
        total: notes.length,
        empty: notes.length === 0,
      };

      return {
        content: [{ type: "text" as const, text: formatNoteListContent(details) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "note_list failed"), { cause: error });
    }
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
  async execute(_toolCallId: string, params: NoteShowToolParams) {
    try {
      const noteService = await getNoteService();
      const note = await noteService.getNote(params.noteId);
      if (!note) {
        const details: NoteShowToolDetails = {
          kind: "note_show",
          noteId: params.noteId,
          found: false,
        };

        return {
          content: [{ type: "text" as const, text: `Note not found: ${params.noteId}` }],
          details,
        };
      }

      const details: NoteShowToolDetails = {
        kind: "note_show",
        noteId: params.noteId,
        found: true,
        note,
      };

      return {
        content: [{ type: "text" as const, text: formatNoteShowContent(note) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "note_show failed"), { cause: error });
    }
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

const formatToolError = (error: unknown, prefix: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
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
