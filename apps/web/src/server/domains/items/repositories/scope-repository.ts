import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { Scope } from "../models/scope";

export type ScopeQuery = {
  /** Part of the name or description, any case. */
  search?: string;
  /** Only scopes after this name (the last name of the previous page). */
  cursor?: string;
  limit: number;
};

/** What the scope services need from storage. Implemented with Kysely in kysely-scope-repository.ts. */
export interface ScopeRepository {
  transaction<T>(work: (repo: ScopeRepository) => Promise<T>): Promise<T>;
  findByName(name: string): Promise<Scope | null>;
  insert(scope: {
    name: string;
    description: string;
    createdBy: string | null;
    createdAt: Date;
  }): Promise<string>;
  updateDescription(id: string, description: string): Promise<void>;
  /** In name order. */
  list(query: ScopeQuery): Promise<Scope[]>;
  recordAudit(event: NewAuditEvent, now: Date): Promise<void>;
}
