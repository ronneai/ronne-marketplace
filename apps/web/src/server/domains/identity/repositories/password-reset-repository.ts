import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { QueuedMail, QueueResult } from "../../mail/services/outbox";
import type { PasswordSignInPolicy } from "../../settings/models/password-sign-in-policy";
import type { ResetAccount, ResetStep } from "../models/password-reset";
import type { EmailCodeRepository } from "./kysely-email-code-repository";

/** A reset flow's row (194): the token's hash, never the token; no address, no IP. */
export type ResetFlow = {
  id: string;
  tokenHash: string;
  /** Null for an address that gets no code. */
  userId: string | null;
  step: ResetStep;
  expiresAt: Date;
  createdAt: Date;
};

/** Forgot password by email's storage (194), as the reset service sees it. */
export interface PasswordResetRepository {
  /**
   * Runs the work in one transaction; the emails it queued go to the scheduler once it has
   * committed (189), so a code's email exists if and only if its code does.
   */
  transaction<T>(work: (repo: PasswordResetRepository) => Promise<T>): Promise<T>;
  /** The account with this address, compared as the unique index compares it, or null. */
  findAccount(email: string): Promise<ResetAccount | null>;
  /** Who may sign in with a password now (106), as sign-in reads it. */
  passwordPolicy(): Promise<PasswordSignInPolicy>;
  /** The names of the identity providers that are on, for an account linked to none. */
  enabledProviderNames(): Promise<string[]>;
  insertFlow(flow: ResetFlow): Promise<void>;
  /** Holds the account's row until the transaction ends (PostgreSQL, MySQL; SQLite runs one at a time). */
  lockAccount(userId: string): Promise<void>;
  /**
   * Ends the account's earlier reset codes (a new request replaces them). Their flows stay until
   * they expire, so an old flow's page can say its code was replaced.
   */
  endCodesOf(userId: string, now: Date): Promise<void>;
  issueCode: EmailCodeRepository["issue"];
  /** True when this proof-of-work answer is new and now taken; false for a replay (190). */
  takeChallenge(challengeHmac: string, expiresAt: Date): Promise<boolean>;
  queueMail(mail: QueuedMail, now: Date): Promise<QueueResult>;
  /** The reads `queueMail` does, without the insert: a request that sends nothing takes as long. */
  rehearseMail(mail: QueuedMail, now: Date): Promise<void>;
  recordAudit(event: NewAuditEvent, now: Date): Promise<void>;
}
