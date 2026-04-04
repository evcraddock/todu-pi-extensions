import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/timezone", () => ({
  getSystemTimezone: () => "America/Chicago",
}));

import type { NoteSummary } from "@/domain/note";
import { registerTools } from "@/extension/register-tools";
import type { NoteService } from "@/services/note-service";
import {
  createNoteListToolDefinition,
  createNoteShowToolDefinition,
  formatNoteListContent,
  formatNoteShowContent,
  normalizeNoteListFilter,
} from "@/tools/note-read-tools";

const createNoteSummary = (overrides: Partial<NoteSummary> = {}): NoteSummary => ({
  id: "note-1",
  content: "This is a test note.",
  author: "user",
  entityType: "task",
  entityId: "task-123",
  tags: ["review"],
  createdAt: "2026-03-20T00:00:00.000Z",
  ...overrides,
});

describe("registerTools", () => {
  it("registers the note_list tool", () => {
    const pi = { registerTool: vi.fn() };

    registerTools(pi as never, {
      getNoteService: vi.fn().mockResolvedValue({} as NoteService),
    });

    const registeredToolNames = pi.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(registeredToolNames).toContain("note_list");
    expect(registeredToolNames).toContain("note_show");
  });
});

describe("normalizeNoteListFilter", () => {
  it("normalizes blank optional values out of the filter", () => {
    expect(
      normalizeNoteListFilter({
        entityId: "   ",
        tag: "   ",
        author: "   ",
        from: "   ",
        to: "   ",
      })
    ).toEqual({
      entityType: undefined,
      entityId: undefined,
      tag: undefined,
      author: undefined,
      from: undefined,
      to: undefined,
      journal: undefined,
      timezone: "America/Chicago",
    });
  });

  it("preserves valid filter values", () => {
    expect(
      normalizeNoteListFilter({
        entityType: "task",
        entityId: "task-123",
        tag: "review",
        author: "user",
        from: "2026-01-01",
        to: "2026-03-31",
        journal: true,
        timezone: "America/Chicago",
      })
    ).toEqual({
      entityType: "task",
      entityId: "task-123",
      tag: "review",
      author: "user",
      from: "2026-01-01",
      to: "2026-03-31",
      journal: true,
      timezone: "America/Chicago",
    });
  });
});

describe("createNoteListToolDefinition", () => {
  it("lists notes with the normalized filter and returns structured details", async () => {
    const notes = [createNoteSummary()];
    const noteService = {
      listNotes: vi.fn().mockResolvedValue(notes),
    } as unknown as NoteService;
    const tool = createNoteListToolDefinition({
      getNoteService: vi.fn().mockResolvedValue(noteService),
    });

    const result = await tool.execute("tool-call-1", {
      entityType: "task",
      entityId: "task-123",
      tag: "review",
    });

    expect(noteService.listNotes).toHaveBeenCalledWith({
      entityType: "task",
      entityId: "task-123",
      tag: "review",
      author: undefined,
      from: undefined,
      to: undefined,
      journal: undefined,
      timezone: "America/Chicago",
    });
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.text).toContain("Notes (1):");
    expect(result.content[0]?.text).toContain("note-1");
    expect(result.details).toEqual({
      kind: "note_list",
      filter: {
        entityType: "task",
        entityId: "task-123",
        tag: "review",
        author: undefined,
        from: undefined,
        to: undefined,
        journal: undefined,
        timezone: "America/Chicago",
      },
      notes,
      total: 1,
      empty: false,
    });
  });

  it("returns a non-error empty result when no notes match", async () => {
    const noteService = {
      listNotes: vi.fn().mockResolvedValue([]),
    } as unknown as NoteService;
    const tool = createNoteListToolDefinition({
      getNoteService: vi.fn().mockResolvedValue(noteService),
    });

    const result = await tool.execute("tool-call-1", {});

    expect(result.content[0]?.text).toBe("No notes found.");
    expect(result.details).toEqual({
      kind: "note_list",
      filter: {
        entityType: undefined,
        entityId: undefined,
        tag: undefined,
        author: undefined,
        from: undefined,
        to: undefined,
        journal: undefined,
        timezone: "America/Chicago",
      },
      notes: [],
      total: 0,
      empty: true,
    });
  });

  it("surfaces service failures with tool-specific context", async () => {
    const tool = createNoteListToolDefinition({
      getNoteService: vi.fn().mockResolvedValue({
        listNotes: vi.fn().mockRejectedValue(new Error("daemon unavailable")),
      } as unknown as NoteService),
    });

    await expect(tool.execute("tool-call-1", {})).rejects.toThrow(
      "note_list failed: daemon unavailable"
    );
  });
});

describe("formatNoteListContent", () => {
  it("formats journal entries with the journal label", () => {
    const content = formatNoteListContent({
      kind: "note_list",
      filter: {},
      notes: [createNoteSummary({ entityType: null, entityId: null })],
      total: 1,
      empty: false,
    });

    expect(content).toContain("journal");
  });
});

describe("createNoteShowToolDefinition", () => {
  it("returns full note details when note is found", async () => {
    const note = createNoteSummary();
    const noteService = {
      listNotes: vi.fn(),
      getNote: vi.fn().mockResolvedValue(note),
    } as unknown as NoteService;
    const tool = createNoteShowToolDefinition({
      getNoteService: vi.fn().mockResolvedValue(noteService),
    });

    const result = await tool.execute("tool-call-1", { noteId: "note-1" });

    expect(noteService.getNote).toHaveBeenCalledWith("note-1");
    expect(result.content[0]?.text).toContain("Note note-1");
    expect(result.content[0]?.text).toContain("user");
    expect(result.content[0]?.text).toContain("review");
    expect(result.content[0]?.text).toContain("task:task-123");
    expect(result.content[0]?.text).toContain("This is a test note.");
    expect(result.details).toEqual({
      kind: "note_show",
      noteId: "note-1",
      found: true,
      note,
    });
  });

  it("returns not-found result when note does not exist", async () => {
    const noteService = {
      listNotes: vi.fn(),
      getNote: vi.fn().mockResolvedValue(null),
    } as unknown as NoteService;
    const tool = createNoteShowToolDefinition({
      getNoteService: vi.fn().mockResolvedValue(noteService),
    });

    const result = await tool.execute("tool-call-1", { noteId: "note-missing" });

    expect(result.content[0]?.text).toBe("Note not found: note-missing");
    expect(result.details).toEqual({
      kind: "note_show",
      noteId: "note-missing",
      found: false,
    });
  });

  it("surfaces service failures with tool-specific context", async () => {
    const tool = createNoteShowToolDefinition({
      getNoteService: vi.fn().mockResolvedValue({
        getNote: vi.fn().mockRejectedValue(new Error("daemon unavailable")),
      } as unknown as NoteService),
    });

    await expect(tool.execute("tool-call-1", { noteId: "note-1" })).rejects.toThrow(
      "note_show failed: daemon unavailable"
    );
  });
});

describe("formatNoteShowContent", () => {
  it("formats full note details", () => {
    const content = formatNoteShowContent(createNoteSummary());

    expect(content).toContain("Note note-1");
    expect(content).toContain("Author: user");
    expect(content).toContain("Entity: task:task-123");
    expect(content).toContain("Tags: review");
    expect(content).toContain("This is a test note.");
  });

  it("formats journal entries without entity binding", () => {
    const content = formatNoteShowContent(createNoteSummary({ entityType: null, entityId: null }));

    expect(content).toContain("Entity: journal");
  });
});
