export type NoteId = string;

export type NoteEntityType = "task" | "project" | "habit";

export interface NoteSummary {
  id: NoteId;
  content: string;
  author: string;
  entityType: NoteEntityType | null;
  entityId: string | null;
  tags: string[];
  createdAt: string;
}

export interface NoteFilter {
  entityType?: NoteEntityType;
  entityId?: string;
  tag?: string;
  author?: string;
  from?: string;
  to?: string;
  journal?: boolean;
  timezone?: string;
}
