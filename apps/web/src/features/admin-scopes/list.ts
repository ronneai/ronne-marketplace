import {
  defineList,
  type ListDefinition,
  type ListState,
} from "@/components/ui/data-table/list-query";
import type { ScopePageQuery } from "@/server/domains/items/repositories/scope-repository";

export type ScopeFilter = "q";
export type ScopesList<F extends ScopeFilter = ScopeFilter> = ListDefinition<"name" | "created", F>;
export type ScopesListState<F extends ScopeFilter = ScopeFilter> = ListState<"name" | "created", F>;

const SORTS = { name: "asc", created: "desc" } as const;

/**
 * A workspace's scopes (090) on its page, at that page's address, searched. Since 115 it's the
 * only scope list: Admin › Scopes went, as every scope is managed on its workspace's page.
 */
export const workspaceScopesList = (path: string): ScopesList<"q"> =>
  defineList({
    path,
    sorts: SORTS,
    defaultSort: "name",
    sizes: [25, 50, 100],
    defaultSize: 50,
    filters: { q: "string" },
  });

/** The server query for a view. */
export const scopesQueryOf = (state: ScopesListState<"q">): Partial<ScopePageQuery> => ({
  sort: state.sort,
  dir: state.dir,
  size: state.size,
  cursor: state.cursor,
  search: state.filters.q || undefined,
});
