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
  /** When the two-factor step was passed; null when it wasn't. */
  twoFactorAt: Date | null;
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
  /** The flow whose token hashes to this, or null. */
  flowByToken(tokenHash: string): Promise<ResetFlow | null>;
  /**
   * Moves a flow on: a new token, step and expiry, only while its token is still `fromHash`, so a
   * cookie copied earlier, or two submits at once, move it once. False when it had moved.
   */
  advanceFlow(
    id: string,
    fromHash: string,
    to: { tokenHash: string; step: ResetStep; expiresAt: Date; twoFactorAt?: Date },
  ): Promise<boolean>;
  /** Ends a flow and its code: the row goes. */
  endFlow(id: string, now: Date): Promise<void>;
  /** The account by id, as a request reads it by address. */
  accountById(userId: string): Promise<ResetAccount | null>;
  /** When the account's wrong reset codes were typed since `since`, oldest first, from its audit. */
  wrongCodeTimes(userId: string, since: Date): Promise<Date[]>;
  verifyCode: EmailCodeRepository["verify"];
  /** Uses the new-password grant: the flow goes, only while its token is still `tokenHash`. */
  consumeGrant(id: string, tokenHash: string): Promise<boolean>;
  /** Ends every reset flow of the account and their codes. */
  endFlowsOf(userId: string, now: Date): Promise<void>;
  /** Sets the account's password (its credential account's hash). */
  setPassword(userId: string, passwordHash: string, now: Date): Promise<void>;
  /** Clears root's "must change your password" (128). */
  clearPasswordChange(userId: string, now: Date): Promise<void>;
  /** Ends every session of the account; how many. */
  deleteSessions(userId: string): Promise<number>;
  /** Ends the account's sessions created up to `at` (the reset's late cleanup). */
  deleteSessionsUpTo(userId: string, at: Date): Promise<number>;
  /** Revokes the account's active access tokens (162); how many. */
  revokeAccessTokens(userId: string, now: Date): Promise<number>;
  /** Withdraws `rmk login --web` sign-ins approved and not picked up yet (107), as denied. */
  denyApprovedDeviceGrants(userId: string, now: Date): Promise<void>;
  /** The "password reset by email" notice to the account's own address (189). */
  queueResetNotice(userId: string, now: Date): Promise<void>;
  /** Holds the account's row until the transaction ends (PostgreSQL, MySQL; SQLite runs one at a time). */
  lockAccount(userId: string): Promise<void>;
  /**
   * Ends the address's earlier reset codes (a newer request replaces them), found by the HMAC the
   * codes keep. Their flows stay until they expire, so an old flow's page can say it was replaced.
   */
  endCodesFor(email: string, now: Date): Promise<void>;
  issueCode: EmailCodeRepository["issue"];
  /** True when this proof-of-work answer is new and now taken; false for a replay (190). */
  takeChallenge(challengeHmac: string, expiresAt: Date): Promise<boolean>;
  queueMail(mail: QueuedMail, now: Date): Promise<QueueResult>;
  /** The reads `queueMail` does, without the insert: a request that sends nothing takes as long. */
  rehearseMail(mail: QueuedMail, now: Date): Promise<void>;
  recordAudit(event: NewAuditEvent, now: Date): Promise<void>;
}
