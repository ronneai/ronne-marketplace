import type { KeysetPage, SortDir } from "../../../db/keyset";
import type { NewAuditEvent } from "../../audit/models/audit-event";
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
  recordAudit(event: NewAuditEvent, now: Date): Promise<void>;
}
