import type { NotesFontFamily, NotesFontSize, NotesLineHeight, Theme } from "@octonote/shared";
import type { UserPreference } from "../../../model/user-preference.model";

export interface UserPreferenceDto {
  userId: string;
  notesFontFamily: NotesFontFamily;
  notesFontSize: NotesFontSize;
  notesLineHeight: NotesLineHeight;
  theme: Theme;
  emailOnShare: boolean;
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
    emailOnShare: pref.emailOnShare,
    createdAt: pref.createdAt.toISOString(),
    updatedAt: pref.updatedAt.toISOString(),
  };
}
