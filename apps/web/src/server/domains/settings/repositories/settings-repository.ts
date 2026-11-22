import type { NewAuditEvent } from "../../audit/models/audit-event";

/** One stored setting. */
export type StoredSetting = { value: string; updatedBy: string | null; updatedAt: Date };

/** What instance settings need from storage (feature 046). */
export interface SettingsRepository {
  /** The stored value, or null when the setting was never changed. */
  get(key: string): Promise<StoredSetting | null>;
  set(key: string, value: string, updatedBy: string | null, at: Date): Promise<void>;
  /**
   * Sets the value only if it is still `expected` (null: the row isn't there yet), so two saves
   * of one form can't both land, whatever the database's isolation. False when it wasn't.
   */
  compareAndSet(
    key: string,
    expected: string | null,
    value: string,
    updatedBy: string | null,
    at: Date,
  ): Promise<boolean>;
  /** A person's name (their pseudonym once erased), or null when they no longer exist. */
  nameOf(userId: string): Promise<string | null>;
  transaction<T>(work: (repo: SettingsRepository) => Promise<T>): Promise<T>;
  recordAudit(event: NewAuditEvent, at: Date): Promise<void>;
}
