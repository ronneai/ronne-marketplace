import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { QueuedMail, QueueResult } from "../../mail/services/outbox";
import type { AccountRules } from "../../settings/models/account-rules";
import type { EmailCodeRepository } from "./kysely-email-code-repository";

/** A sign-up waiting for its code (190): nothing is in `user` until the code is right. */
export type PendingSignUp = {
  id: string;
  email: string;
  name: string;
  /** Null for an address that has an account: the same answer, and no account to make. */
  passwordHash: string | null;
  locale: string;
  termsVersion: string | null;
  termsAcceptedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
};

/** An account an address already has, as stored (MySQL may call another address equal to it). */
export type ExistingAccount = { id: string; email: string };

/** What a right code writes. */
export type NewSignedUpAccount = {
  email: string;
  name: string;
  passwordHash: string;
  locale: string;
  approval: boolean;
  termsVersion: string | null;
  termsAcceptedAt: Date | null;
  now: Date;
};

/** Self-registration's storage (190), as the sign-up service sees it. */
export interface SignUpRepository {
  /**
   * Runs the work in one transaction; the emails it queued go to the scheduler once it has
   * committed (189), so a code's email exists if and only if its code does.
   */
  transaction<T>(work: (repo: SignUpRepository) => Promise<T>): Promise<T>;
  /** Who may create accounts (191): the block list, as stored, read in this transaction. */
  accountRules(): Promise<AccountRules>;
  /** The account with this address, compared as the unique index compares it. */
  findAccount(email: string): Promise<ExistingAccount | null>;
  insertPending(pending: PendingSignUp): Promise<void>;
  pending(id: string): Promise<PendingSignUp | null>;
  /** Ends a sign-up and its codes. */
  deletePending(id: string, now: Date): Promise<void>;
  extendPending(id: string, expiresAt: Date): Promise<void>;
  /** When the sign-up's latest code was sent, for the page's countdown. */
  lastCodeAt(id: string): Promise<Date | null>;
  issueCode: EmailCodeRepository["issue"];
  verifyCode: EmailCodeRepository["verify"];
  /** True when this proof-of-work answer is new and now taken; false for a replay. */
  takeChallenge(challengeHmac: string, expiresAt: Date): Promise<boolean>;
  queueMail(mail: QueuedMail, now: Date): Promise<QueueResult>;
  /** The reads `queueMail` does, without the insert: a bot's email takes as long, unsent. */
  rehearseMail(mail: QueuedMail, now: Date): Promise<void>;
  /**
   * The account a right code makes: the same write as Create user (a `user` in `global`, a
   * personal workspace, a credential account), never root, its address proven, its language the
   * sign-up's, waiting for approval when root asks, and the terms it accepted on record.
   */
  createAccount(account: NewSignedUpAccount): Promise<string>;
  recordAudit(event: NewAuditEvent, now: Date): Promise<void>;
  /** Tells every root an account waits for their approval (139, 190). */
  notifyAwaitingApproval(userId: string, email: string, at: Date): Promise<void>;
}
