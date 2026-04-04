import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import type { NoteEntityType, NoteFilter, NoteSummary } from "../domain/note";
import type { NoteService } from "../services/note-service";
import { getSystemTimezone } from "../utils/timezone";

const NOTE_ENTITY_TYPE_VALUES = ["task", "project", "habit"] as const;

const MAX_NOTE_CONTENT_PREVIEW_LENGTH = 200;

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
  author: Type.Optional(Type.String({ description: "Optional author filter" })),
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

const registerNoteReadTools = (
  pi: Pick<ExtensionAPI, "registerTool">,
  dependencies: NoteReadToolDependencies
): void => {
  pi.registerTool(createNoteListToolDefinition(dependencies));
};

const normalizeNoteListFilter = (params: NoteListToolParams): NoteFilter => ({
  entityType: params.entityType ?? undefined,
  entityId: normalizeOptionalText(params.entityId),
  tag: normalizeOptionalText(params.tag),
  author: normalizeOptionalText(params.author),
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
  const preview = truncateContent(note.content, MAX_NOTE_CONTENT_PREVIEW_LENGTH);
  return `${note.id} • ${entityLabel} • ${note.author} • ${tagLabel} • ${note.createdAt}\n    ${preview}`;
};

const truncateContent = (content: string, maxLength: number): string => {
  const singleLine = content.replace(/\r?\n/g, " ").trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }

  return singleLine.slice(0, maxLength - 3) + "...";
};

const formatToolError = (error: unknown, prefix: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
};

export type { NoteListToolDetails, NoteReadToolDependencies };
export {
  createNoteListToolDefinition,
  formatNoteListContent,
  normalizeNoteListFilter,
  registerNoteReadTools,
};
