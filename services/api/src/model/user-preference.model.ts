import type { NotesFontFamily, NotesFontSize, NotesLineHeight, Theme } from "@octonote/shared";
import type { userPreferences } from "../db/schemas/preferences";

export interface UserPreference {
  userId: string;
  notesFontFamily: NotesFontFamily;
  notesFontSize: NotesFontSize;
  notesLineHeight: NotesLineHeight;
  theme: Theme;
  createdAt: Date;
  updatedAt: Date;
}

export function toUserPreference(row: typeof userPreferences.$inferSelect): UserPreference {
  return {
    userId: row.userId,
    notesFontFamily: row.notesFontFamily as NotesFontFamily,
    notesFontSize: row.notesFontSize as NotesFontSize,
    notesLineHeight: row.notesLineHeight as NotesLineHeight,
    theme: row.theme as Theme,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
