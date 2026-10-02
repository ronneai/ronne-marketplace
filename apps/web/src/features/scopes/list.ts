import {
  defineList,
  type ListDefinition,
  type ListState,
} from "@/components/ui/data-table/list-query";
import type { ScopePageQuery } from "@/server/domains/items/repositories/scope-repository";

/**
 * The scope list as a server data table (feature 061), on /scopes and /admin/scopes: the same
 * sorts and search, only the path differs.
 */
const scopesList = (path: "/scopes" | "/admin/scopes") =>
  defineList({
    path,
    sorts: { name: "asc", created: "desc" },
    defaultSort: "name",
    sizes: [25, 50, 100],
    defaultSize: 50,
    filters: { q: "string" },
  });

export type ScopesList = ListDefinition<"name" | "created", "q">;
export type ScopesListState = ListState<"name" | "created", "q">;

export const SCOPES_LIST: ScopesList = scopesList("/scopes");
export const ADMIN_SCOPES_LIST: ScopesList = scopesList("/admin/scopes");

/** The server query for a view. */
export const scopesQueryOf = (state: ScopesListState): Partial<ScopePageQuery> => ({
  sort: state.sort,
  dir: state.dir,
  size: state.size,
  cursor: state.cursor,
  search: state.filters.q || undefined,
});
