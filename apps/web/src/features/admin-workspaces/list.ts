import {
  defineList,
  type ListDefinition,
  type ListState,
} from "@/components/ui/data-table/list-query";
import type { WorkspacePageQuery } from "@/server/domains/workspaces/repositories/workspace-repository";

export type WorkspacesList = ListDefinition<"name" | "created", "q">;
export type WorkspacesListState = ListState<"name" | "created", "q">;

/** Admin › Workspaces (feature 090) as a server data table. `global` is always first. */
export const ADMIN_WORKSPACES_LIST: WorkspacesList = defineList({
  path: "/admin/workspaces",
  sorts: { name: "asc", created: "desc" },
  defaultSort: "name",
  sizes: [25, 50, 100],
  defaultSize: 50,
  filters: { q: "string" },
});

/** The server query for a view. */
export const workspacesQueryOf = (state: WorkspacesListState): Partial<WorkspacePageQuery> => ({
  sort: state.sort,
  dir: state.dir,
  size: state.size,
  cursor: state.cursor,
  search: state.filters.q || undefined,
});

/** A workspace's page in Admin › Workspaces. */
export const workspacePath = (name: string) => `/admin/workspaces/${encodeURIComponent(name)}`;
