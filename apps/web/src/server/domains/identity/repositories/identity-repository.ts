import type { CurrentUser, RootAccount } from "../models/user";

export type NewUserWithPassword = {
  email: string;
  name: string;
  role: "root" | "moderator" | "user";
  passwordHash: string;
};

/** What the identity services need from storage. Implemented with Kysely in kysely-identity-repository.ts. */
export interface IdentityRepository {
  /** Runs `work` in one database transaction, with a repository bound to it. */
  transaction<T>(work: (repo: IdentityRepository) => Promise<T>): Promise<T>;
  findRoot(): Promise<RootAccount | null>;
  /** The user, or null when they don't exist or are disabled. */
  findActiveUser(userId: string): Promise<CurrentUser | null>;
  /** Creates the user and its credential account together. Returns the new user's id. */
  createUserWithPassword(user: NewUserWithPassword, now: Date): Promise<string>;
  setPassword(userId: string, passwordHash: string, now: Date): Promise<void>;
  enableUser(userId: string, now: Date): Promise<void>;
  deleteSessions(userId: string): Promise<void>;
  revokeAccessTokens(userId: string, now: Date): Promise<void>;
}
