import type { NewAuditEvent } from "../../audit/models/audit-event";

/** One stored setting. */
export type StoredSetting = { value: string; updatedBy: string | null; updatedAt: Date };

/** What instance settings need from storage (feature 046). */
export interface SettingsRepository {
  /** The stored value, or null when the setting was never changed. */
  get(key: string): Promise<StoredSetting | null>;
  set(key: string, value: string, updatedBy: string | null, at: Date): Promise<void>;
  transaction<T>(work: (repo: SettingsRepository) => Promise<T>): Promise<T>;
  recordAudit(event: NewAuditEvent, at: Date): Promise<void>;
}
