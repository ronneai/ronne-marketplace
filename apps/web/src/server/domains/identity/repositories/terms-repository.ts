import type { NewAuditEvent } from "../../audit/models/audit-event";

/** The terms people accepted (190), as the terms service sees them. */
export interface TermsRepository {
  transaction<T>(work: (repo: TermsRepository) => Promise<T>): Promise<T>;
  /** Holds the person's row until the transaction ends: one acceptance at a time for them. */
  lockUser(userId: string): Promise<void>;
  /** Whether the person has accepted this version, at sign-up or since. */
  accepted(userId: string, version: string): Promise<boolean>;
  /** Whether the person has accepted any version at or after this moment. */
  acceptedSince(userId: string, at: Date): Promise<boolean>;
  /** One acceptance, kept: the record a data protection review asks for. */
  record(userId: string, version: string, at: Date): Promise<void>;
  recordAudit(event: NewAuditEvent, at: Date): Promise<void>;
}
