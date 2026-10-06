import {
  defineList,
  type ListDefinition,
  type ListState,
} from "@/components/ui/data-table/list-query";
import type { ScopePageQuery } from "@/server/domains/items/repositories/scope-repository";

/** `workspace` (090) filters by a workspace's name; a workspace's own page doesn't offer it. */
export type ScopeFilter = "q" | "workspace";
export type ScopesList<F extends ScopeFilter = ScopeFilter> = ListDefinition<"name" | "created", F>;
export type ScopesListState<F extends ScopeFilter = ScopeFilter> = ListState<"name" | "created", F>;

const SORTS = { name: "asc", created: "desc" } as const;

/**
 * The scope list on /admin/scopes as a server data table (feature 061). It's root's only scope
 * list since the read-only /scopes page went (064). 090 adds the workspace filter.
 */
export const ADMIN_SCOPES_LIST: ScopesList = defineList({
  path: "/admin/scopes",
  sorts: SORTS,
  defaultSort: "name",
  sizes: [25, 50, 100],
  defaultSize: 50,
  filters: { q: "string", workspace: "string" },
});

/** The same table on a workspace's page (090), at that page's address, searched but not filtered. */
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
