import type { NoteFilter, NoteSummary } from "../domain/note";

export interface NoteService {
  listNotes(filter?: NoteFilter): Promise<NoteSummary[]>;
  getNote(noteId: string): Promise<NoteSummary | null>;
}
