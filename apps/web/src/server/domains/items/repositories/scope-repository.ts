import type { ScopeRef } from "@ronneai/core";
import type { KeysetPage, SortDir } from "../../../db/keyset";
import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { Scope } from "../models/scope";

export type ScopeQuery = {
  /** Part of the name or description, any case. */
  search?: string;
  /** Only scopes after this name (the last name of the previous page). */
  cursor?: string;
  /** Only scopes in these workspaces (091); every workspace when left out. */
  workspaceIds?: readonly string[];
  limit: number;
};

/** `name` sorts by the name (unique), `created` by the id (a ULID); then the id (061). */
export type ScopeSort = "name" | "created";

export type ScopePageQuery = {
  search?: string;
  /** Only the scopes in this workspace (feature 090). */
  workspaceId?: string;
  sort: ScopeSort;
  dir: SortDir;
  size: number;
  cursor?: string;
};

/** What the scope services need from storage. Implemented with Kysely in kysely-scope-repository.ts. */
export interface ScopeRepository {
  transaction<T>(work: (repo: ScopeRepository) => Promise<T>): Promise<T>;
  /** By its name in its workspace (118): scope names are unique per workspace. */
  findByName(ref: ScopeRef): Promise<Scope | null>;
  /** A workspace a scope can be created in, by id (feature 090), or null. */
  findWorkspace(id: string): Promise<{ id: string; name: string } | null>;
  insert(scope: {
    name: string;
    description: string;
    workspaceId: string;
    createdBy: string | null;
    createdAt: Date;
  }): Promise<string>;
  updateDescription(id: string, description: string): Promise<void>;
  /** In name order, with the name as cursor: 037's API and the new-draft page. */
  list(query: ScopeQuery): Promise<Scope[]>;
  /** One page for the web tables (keyset, 061). */
  page(query: ScopePageQuery): Promise<KeysetPage<Scope>>;
  /** How many scopes match the search (and workspace), up to the count cap. */
  count(query: {
    search?: string;
    workspaceId?: string;
  }): Promise<{ count: number; capped: boolean }>;
  recordAudit(event: NewAuditEvent, now: Date): Promise<void>;
}
