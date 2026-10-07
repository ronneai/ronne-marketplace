import {
  defineList,
  type ListDefinition,
  type ListState,
} from "@/components/ui/data-table/list-query";
import { isWorkspaceRole } from "@/server/domains/identity/models/user";

export type MembersList = ListDefinition<"name" | "added", "q" | "role">;
export type MembersListState = ListState<"name" | "added", "q" | "role">;

/**
 * A workspace's Members table (092): a server data table on the workspace's page, under its
 * Members tab, so it keeps `tab=members` and leaves the Scopes table's address alone.
 */
export const workspaceMembersList = (path: string): MembersList =>
  defineList({
    path,
    fixed: { tab: "members" },
    sorts: { name: "asc", added: "desc" },
    defaultSort: "name",
    sizes: [25, 50, 100],
    defaultSize: 50,
    filters: { q: "string", role: "string" },
  });

/** Drops a role the table doesn't know, so the form and chips never show it. */
export const checkedMembersState = (state: MembersListState): MembersListState => ({
  ...state,
  filters: {
    ...state.filters,
    role: isWorkspaceRole(state.filters.role) ? state.filters.role : "",
  },
});

/** The server query for a view. */
export const membersQueryOf = (state: MembersListState) => ({
  sort: state.sort,
  dir: state.dir,
  size: state.size,
  cursor: state.cursor,
  search: state.filters.q || undefined,
  role: isWorkspaceRole(state.filters.role) ? state.filters.role : undefined,
});
