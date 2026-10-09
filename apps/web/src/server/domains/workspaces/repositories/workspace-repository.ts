import type { KeysetPage, SortDir } from "../../../db/keyset";
import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { WorkspaceRole } from "../../identity/models/user";
import type { AccessRequest, PendingRequest, RequestWithWorkspace } from "../models/access-request";
import type { Member, Membership, MemberUser } from "../models/member";
import type { Workspace, WorkspaceVisibility } from "../models/workspace";

/** A workspace's Members table (092): part of an email or name, and a role. */
export type MemberFilters = { workspaceId: string; search?: string; role?: WorkspaceRole };
export type MemberSort = "name" | "added";
export type MemberPageQuery = MemberFilters & {
  sort: MemberSort;
  dir: SortDir;
  size: number;
  cursor?: string;
};

/** `name` sorts by the name (unique), `created` by the id (a ULID); then the id. */
export type WorkspaceSort = "name" | "created";

export type WorkspacePageQuery = {
  search?: string;
  sort: WorkspaceSort;
  dir: SortDir;
  size: number;
  cursor?: string;
  /** Only these workspaces (an admin's, 092); every one when left out. */
  ids?: readonly string[];
};

/** What the workspace services need from storage. Implemented with Kysely in kysely-workspace-repository.ts. */
export interface WorkspaceRepository {
  transaction<T>(work: (repo: WorkspaceRepository) => Promise<T>): Promise<T>;
  findByName(name: string): Promise<Workspace | null>;
  insert(workspace: {
    name: string;
    description: string;
    visibility: WorkspaceVisibility;
    createdBy: string | null;
    createdAt: Date;
  }): Promise<string>;
  updateDescription(id: string, description: string, updatedAt: Date): Promise<void>;
  /** Locks its row until the transaction ends (093): releases checking a dependency take it too. */
  lockWorkspace(id: string): Promise<void>;
  /** Sets its visibility (093) and raises the catalogue revision, so plugin feeds rebuild. */
  setVisibility(id: string, visibility: WorkspaceVisibility, updatedAt: Date): Promise<void>;
  /**
   * The released items outside the workspace with a version that isn't yanked and depends on an
   * item in it (093), as `@scope/name`, by name: turning it private is refused while there are any,
   * since those versions would stop installing for people outside it.
   */
  outsideDependents(workspaceId: string): Promise<string[]>;
  /**
   * The open submissions outside the workspace (submitted, changes requested, approved), with
   * their latest revision's ronne.yaml: the ones that depend on its items are listed as a warning.
   */
  openSubmissionsOutside(workspaceId: string): Promise<{ name: string; manifest: string | null }[]>;
  /** The names of the workspace's scopes. */
  scopeNames(workspaceId: string): Promise<string[]>;
  delete(id: string): Promise<void>;
  /** Every workspace, `global` first, then by name: for the selects and filters. */
  list(): Promise<Workspace[]>;
  /** One page for Admin › Workspaces (keyset), `global` left out: the service puts it first. */
  page(query: WorkspacePageQuery): Promise<KeysetPage<Workspace>>;
  /** How many workspaces other than `global` match the search, up to the count cap. */
  count(search?: string, ids?: readonly string[]): Promise<{ count: number; capped: boolean }>;
  findById(id: string): Promise<Workspace | null>;
  /**
   * Locks these users' rows until the transaction ends, in id order, so two roots changing one
   * person's memberships run one after the other instead of deadlocking (092).
   */
  lockUsers(userIds: readonly string[]): Promise<void>;
  /** A user, for the member services (092): their email, name, whether root, whether disabled. */
  memberUser(userId: string): Promise<MemberUser | null>;
  /** A user's memberships, `global` first, then by workspace name. */
  membershipsOf(userId: string): Promise<Membership[]>;
  /** A workspace's members, by name; roots left out, since a root's rows are ignored (091). */
  members(workspaceId: string): Promise<Member[]>;
  /** One page of a workspace's members, searched and filtered by role (092); roots left out. */
  memberPage(query: MemberPageQuery): Promise<KeysetPage<Member>>;
  /** How many members match, up to the count cap. */
  memberCount(filters: MemberFilters): Promise<{ count: number; capped: boolean }>;
  /**
   * Who could be added to the workspace (092): users not in it, not root and not disabled, whose
   * email or name contains `term`, by email; at most `limit`.
   */
  candidates(
    workspaceId: string,
    term: string,
    limit: number,
  ): Promise<{ id: string; email: string; name: string }[]>;
  /** The user's role in the workspace, or null. */
  memberRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null>;
  /** Adds the membership, or sets its role when it exists (the later write wins). */
  putMember(member: {
    workspaceId: string;
    userId: string;
    role: WorkspaceRole;
    addedBy: string | null;
    at: Date;
  }): Promise<void>;
  removeMember(workspaceId: string, userId: string): Promise<void>;
  countMembers(workspaceId: string): Promise<number>;
  recordAudit(event: NewAuditEvent, now: Date): Promise<void>;
  // Requests to join (094), implemented in kysely-access-requests.ts.
  /** Locks the request's row until the transaction ends: the first answer wins. */
  lockAccessRequest(id: string): Promise<void>;
  accessRequest(id: string): Promise<AccessRequest | null>;
  /** The user's latest request to a workspace name, open or not, with or without a workspace. */
  latestRequest(workspaceName: string, userId: string): Promise<AccessRequest | null>;
  /**
   * Whether the user was added to or removed from the workspace after `since` (from the audit log):
   * someone who was a member since a decline asks again at once.
   */
  membershipChangedSince(workspaceName: string, userId: string, since: Date): Promise<boolean>;
  countOpenRequestsBy(userId: string): Promise<number>;
  insertAccessRequest(request: {
    workspaceId: string | null;
    workspaceName: string;
    userId: string;
    message: string | null;
    at: Date;
  }): Promise<string>;
  /** Closes an open request; false when it wasn't open any more. */
  decideAccessRequest(
    id: string,
    decision: {
      status: "approved" | "declined" | "cancelled";
      decidedBy: string | null;
      reason: string | null;
      at: Date;
    },
  ): Promise<boolean>;
  /** The user's open request to the workspace, approved by `decidedBy`: they were added directly. */
  approveOpenRequest(
    workspaceId: string,
    userId: string,
    decidedBy: string | null,
    at: Date,
  ): Promise<AccessRequest | null>;
  /**
   * The open requests in these workspaces (every one for `"all"`), oldest first, at most `limit`;
   * disabled users' and those to names no workspace has left out.
   */
  pendingRequests(
    workspaceIds: "all" | readonly string[],
    limit: number,
  ): Promise<PendingRequest[]>;
  /** How many open requests there are in these workspaces (every one for `"all"`). */
  countPendingRequests(workspaceIds: "all" | readonly string[]): Promise<number>;
  /** The user's requests, newest first, with their workspaces: at most `limit`. */
  requestsOf(userId: string, limit: number): Promise<RequestWithWorkspace[]>;
  /** Gives the open requests to a name no workspace had to the workspace just created with it. */
  attachRequests(workspaceName: string, workspaceId: string): Promise<void>;
}
