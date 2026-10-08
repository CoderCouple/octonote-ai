import type { NotesFontFamily, NotesFontSize, NotesLineHeight, Theme } from "@octonote/shared";
import type { UserPreference } from "../../../model/user-preference.model";

export interface UserPreferenceDto {
  userId: string;
  notesFontFamily: NotesFontFamily;
  notesFontSize: NotesFontSize;
  notesLineHeight: NotesLineHeight;
  theme: Theme;
  createdAt: string;
  updatedAt: string;
}

export function userPreferenceToDto(pref: UserPreference): UserPreferenceDto {
  return {
    userId: pref.userId,
    notesFontFamily: pref.notesFontFamily,
    notesFontSize: pref.notesFontSize,
    notesLineHeight: pref.notesLineHeight,
    theme: pref.theme,
    createdAt: pref.createdAt.toISOString(),
    updatedAt: pref.updatedAt.toISOString(),
  };
}
