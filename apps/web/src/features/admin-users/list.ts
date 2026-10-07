import { defineList, type ListState } from "@/components/ui/data-table/list-query";
import type { UserPageQuery } from "@/server/domains/identity/repositories/identity-repository";

/** /admin/users as a server data table (feature 061): what it sorts and filters by. */
export const USERS_LIST = defineList({
  path: "/admin/users",
  sorts: { created: "desc", email: "asc", name: "asc" },
  defaultSort: "created",
  sizes: [25, 50, 100],
  defaultSize: 50,
  filters: { q: "string", role: "string", status: "string" },
});

export type UsersListState = ListState<"created" | "email" | "name", "q" | "role" | "status">;

const ROLES = ["user", "root"] as const;
const STATUSES = ["active", "disabled"] as const;
type Role = (typeof ROLES)[number];
type Status = (typeof STATUSES)[number];

const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value);
const isStatus = (value: string): value is Status =>
  (STATUSES as readonly string[]).includes(value);

/** Drops a role or status the list doesn't know, so the form and chips never show it. */
export const checkedUsersState = (state: UsersListState): UsersListState => ({
  ...state,
  filters: {
    ...state.filters,
    role: isRole(state.filters.role) ? state.filters.role : "",
    status: isStatus(state.filters.status) ? state.filters.status : "",
  },
});

/** The server query for a view. */
export const usersQueryOf = (state: UsersListState): Partial<UserPageQuery> => {
  const { q, role, status } = state.filters;
  return {
    sort: state.sort,
    dir: state.dir,
    size: state.size,
    cursor: state.cursor,
    search: q || undefined,
    role: isRole(role) ? role : undefined,
    status: isStatus(status) ? status : undefined,
  };
};
