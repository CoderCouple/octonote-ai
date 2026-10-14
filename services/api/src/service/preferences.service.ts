/**
 * UI preferences for the signed-in user. One row per user, lazy-created on
 * first read so cold-start /me/preferences always returns a usable record.
 */
import { Injectable, Optional } from "@nestjs/common";
import { ProductAnalytics } from "../common/product-analytics.service";
import type { UserPreferenceUpdate } from "../api/v1/request/preferences.request";
import { NotFound } from "../common/error/error-factory";
import { UserPreferencesRepository } from "../db/repository/user-preferences.repository";
import { toUserPreference, type UserPreference } from "../model/user-preference.model";

@Injectable()
export class PreferencesService {
  constructor(
    private readonly prefsRepo: UserPreferencesRepository,
    @Optional() private readonly analytics: ProductAnalytics | null = null,
  ) {}

  async getOrCreate(userId: string): Promise<UserPreference> {
    const existing = await this.prefsRepo.findByUserId(userId);
    if (existing) return toUserPreference(existing);
    await this.prefsRepo.createDefault(userId);
    const seeded = await this.prefsRepo.findByUserId(userId);
    if (!seeded) throw NotFound("Failed to bootstrap preferences.");
    return toUserPreference(seeded);
  }

  async update(userId: string, patch: UserPreferenceUpdate): Promise<UserPreference> {
    await this.getOrCreate(userId);
    const row = await this.prefsRepo.updateByUserId(userId, {
      ...(patch.notesFontFamily !== undefined ? { notesFontFamily: patch.notesFontFamily } : {}),
      ...(patch.notesFontSize !== undefined ? { notesFontSize: patch.notesFontSize } : {}),
      ...(patch.notesLineHeight !== undefined ? { notesLineHeight: patch.notesLineHeight } : {}),
      ...(patch.theme !== undefined ? { theme: patch.theme } : {}),
      ...(patch.emailOnShare !== undefined ? { emailOnShare: patch.emailOnShare } : {}),
      ...(patch.analytics !== undefined ? { analytics: patch.analytics } : {}),
    });
    if (!row) throw NotFound("Preferences not found.");
    if (patch.analytics !== undefined) this.analytics?.forget(userId);
    return toUserPreference(row);
  }
}
