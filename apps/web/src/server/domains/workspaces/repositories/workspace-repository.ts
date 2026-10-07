import type { KeysetPage, SortDir } from "../../../db/keyset";
import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { WorkspaceRole } from "../../identity/models/user";
import type { Member, Membership, MemberUser } from "../models/member";
import type { Workspace, WorkspaceVisibility } from "../models/workspace";

/** `name` sorts by the name (unique), `created` by the id (a ULID); then the id. */
export type WorkspaceSort = "name" | "created";

export type WorkspacePageQuery = {
  search?: string;
  sort: WorkspaceSort;
  dir: SortDir;
  size: number;
  cursor?: string;
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
  delete(id: string): Promise<void>;
  /** Every workspace, `global` first, then by name: for the selects and filters. */
  list(): Promise<Workspace[]>;
  /** One page for Admin › Workspaces (keyset), `global` left out: the service puts it first. */
  page(query: WorkspacePageQuery): Promise<KeysetPage<Workspace>>;
  /** How many workspaces other than `global` match the search, up to the count cap. */
  count(search?: string): Promise<{ count: number; capped: boolean }>;
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
}
