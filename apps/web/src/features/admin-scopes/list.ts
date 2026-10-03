import {
  defineList,
  type ListDefinition,
  type ListState,
} from "@/components/ui/data-table/list-query";
import type { ScopePageQuery } from "@/server/domains/items/repositories/scope-repository";

export type ScopesList = ListDefinition<"name" | "created", "q">;
export type ScopesListState = ListState<"name" | "created", "q">;

/**
 * The scope list on /admin/scopes as a server data table (feature 061). It's root's only scope
 * list since the read-only /scopes page went (064).
 */
export const ADMIN_SCOPES_LIST: ScopesList = defineList({
  path: "/admin/scopes",
  sorts: { name: "asc", created: "desc" },
  defaultSort: "name",
  sizes: [25, 50, 100],
  defaultSize: 50,
  filters: { q: "string" },
});

/** The server query for a view. */
export const scopesQueryOf = (state: ScopesListState): Partial<ScopePageQuery> => ({
  sort: state.sort,
  dir: state.dir,
  size: state.size,
  cursor: state.cursor,
  search: state.filters.q || undefined,
});
