import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { NewNotification } from "../../notifications/models/notification";
import type { MappedRole } from "../models/identity-provider";
import type { UserSummary } from "../models/user";

/** A sign-in with a provider in progress, kept server-side between the start and the callback. */
export type SsoSignInState = {
  provider: string;
  /** What the provider type keeps (the PKCE verifier, the nonce, the state). */
  keep: Record<string, string>;
  /** Where to go after (already a safe relative path). */
  next: string;
  /** A *Test sign-in* by this root of this version of the provider (task 6), or a real one. */
  test: { by: string; version: string } | null;
};

/** What signing in with a provider needs from storage (feature 106). */
export interface SsoRepository {
  /** Keeps a sign-in in progress under its state's hash, until `expiresAt`. */
  saveState(stateHash: string, state: SsoSignInState, now: Date, expiresAt: Date): Promise<void>;
  /** Deletes the sign-ins in progress that expired before `now` (abandoned at the provider). */
  pruneStates(now: Date): Promise<void>;
  /**
   * Takes a sign-in in progress: returns it and deletes it, so it can be used once. Null when
   * there's none, it expired, or another request took it first.
   */
  takeState(stateHash: string, now: Date): Promise<{ state: SsoSignInState } | null>;
  /** Locks the provider's row, so one sign-in through it decides and writes at a time. */
  lockProvider(providerId: string): Promise<void>;
  /** Whether SCIM is on for the provider (108): its groups are then SCIM's, not the sign-in's. */
  scimEnabled(providerId: string): Promise<boolean>;
  /** The user linked to this provider's subject, compared exactly (MySQL's text isn't). */
  findLinkedUser(providerId: string, subject: string): Promise<string | null>;
  /** The subjects of this provider already linked to the user. */
  linkedSubjects(userId: string, providerId: string): Promise<string[]>;
  linkAccount(userId: string, providerId: string, subject: string, now: Date): Promise<void>;
  findUser(userId: string): Promise<UserSummary | null>;
  findUserByEmail(email: string): Promise<UserSummary | null>;
  /** A new `user`: in `global`, with a personal workspace, no password. Returns its id. */
  createUser(user: { email: string; name: string }, now: Date): Promise<string>;
  /** The provider's group mappings (a deleted workspace's mapping has a null workspace). */
  mappingsFor(
    providerId: string,
  ): Promise<{ group: string; workspaceId: string | null; role: MappedRole }[]>;
  /** The user's memberships, with where each came from and the workspace's name. */
  membershipsOf(
    userId: string,
  ): Promise<
    { workspaceId: string; workspaceName: string; role: MappedRole; source: string | null }[]
  >;
  workspaceName(workspaceId: string): Promise<string | null>;
  addMembership(
    userId: string,
    workspaceId: string,
    role: MappedRole,
    source: string,
    at: Date,
  ): Promise<void>;
  setMembership(
    userId: string,
    workspaceId: string,
    role: MappedRole,
    source: string | null,
    at: Date,
  ): Promise<void>;
  removeMembership(userId: string, workspaceId: string): Promise<void>;
  transaction<T>(work: (repo: SsoRepository) => Promise<T>): Promise<T>;
  recordAudit(event: NewAuditEvent, at: Date): Promise<void>;
  /** Writes a notification (139), in the same transaction as the change it tells about. */
  notify(notification: NewNotification, now: Date): Promise<void>;
}
