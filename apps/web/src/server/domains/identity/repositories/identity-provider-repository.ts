import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { IdentityProvider, MappedRole } from "../models/identity-provider";

/** A provider as stored, with its encrypted secret (never leaves the identity domain). */
export type StoredProvider = { provider: IdentityProvider; secretEnc: string | null };

/** What a save writes; the service decides every value. */
export type ProviderRow = {
  type: string;
  preset: string;
  name: string;
  config: Record<string, unknown>;
  secretEnc: string | null;
  domains: string[];
  linkByEmail: boolean;
  groupsClaim: string | null;
  testedAt: Date | null;
  testedBy: string | null;
  enabled: boolean;
};

/** A membership a provider's group mapping gave (`workspace_members.source`). */
export type SourcedMembership = {
  workspaceId: string;
  workspaceName: string;
  userId: string;
  email: string;
  role: "admin" | "moderator" | "user";
};

/** What identity providers need from storage (feature 106). */
export interface IdentityProviderRepository {
  list(): Promise<IdentityProvider[]>;
  find(id: string): Promise<StoredProvider | null>;
  /** Throws a unique violation when the id is taken. */
  insert(id: string, row: ProviderRow, createdBy: string | null, at: Date): Promise<void>;
  /**
   * Saves the row only if it is still the version `expected` (its `updated_at`), so two saves of
   * one form can't both land, whatever the database's isolation. False when it wasn't.
   */
  update(id: string, row: ProviderRow, at: Date, expected: Date): Promise<boolean>;
  /** Turns it on or off only if it is still the version `expected`; false when it changed since. */
  setEnabled(id: string, enabled: boolean, at: Date, expected: Date): Promise<boolean>;
  /** Records a passing test of the version `expected`; false when the provider changed since. */
  markTested(id: string, by: string, at: Date, expected: Date): Promise<boolean>;
  /** A failed sign-in or test: counts towards *Failing*. */
  recordFailure(id: string, reason: string, at: Date): Promise<void>;
  /** A sign-in that worked: the failures start again from zero. */
  recordSignIn(id: string, at: Date): Promise<void>;
  delete(id: string): Promise<void>;
  /**
   * Undoes every membership this provider's mappings gave, for its deletion: removes them, except
   * in `global`, which nobody leaves (092): those become hand-set `user` rows. Returns both lists,
   * with the role each had, for the audit.
   */
  releaseSourcedMemberships(
    providerId: string,
    at: Date,
  ): Promise<{ removed: SourcedMembership[]; lowered: SourcedMembership[] }>;
  /** Turns every provider off; returns the ids it turned off. */
  disableAll(at: Date): Promise<string[]>;
  /** Every provider's id and encrypted secret, for `rotate-secret`. */
  secrets(): Promise<{ id: string; secretEnc: string }[]>;
  setSecret(id: string, secretEnc: string): Promise<void>;
  /** The provider's mappings, with the workspace's name (null when it was deleted). */
  listMappings(
    providerId: string,
  ): Promise<
    { group: string; workspaceId: string | null; workspaceName: string | null; role: MappedRole }[]
  >;
  /** Replaces all of the provider's mappings. */
  replaceMappings(
    providerId: string,
    mappings: { group: string; workspaceId: string; role: MappedRole }[],
    at: Date,
  ): Promise<void>;
  /** A workspace's name and whether it's someone's personal workspace, or null. */
  findWorkspace(workspaceId: string): Promise<{ name: string; personal: boolean } | null>;
  transaction<T>(work: (repo: IdentityProviderRepository) => Promise<T>): Promise<T>;
  recordAudit(event: NewAuditEvent, at: Date): Promise<void>;
}
