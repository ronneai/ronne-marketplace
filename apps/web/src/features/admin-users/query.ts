import { USER_SEARCH_MAX_LENGTH } from "@/server/domains/identity/services/user-admin";

export type SearchParams = Record<string, string | string[] | undefined>;

/** The filters as the form shows them: strings, "" when unset. */
export type UserFilters = { q: string; role: string; status: string };

export type UsersPageQuery = {
  filters: UserFilters;
  search?: string;
  role?: "root" | "moderator" | "user";
  status?: "active" | "disabled";
  cursor?: string;
};

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/** Reads /admin/users' query string. Anything malformed is ignored. */
export const parseUsersQuery = (params: SearchParams): UsersPageQuery => {
  const q = first(params.q).trim().slice(0, USER_SEARCH_MAX_LENGTH);
  const role = first(params.role);
  const status = first(params.status);
  const cursor = first(params.cursor);
  const validRole = role === "root" || role === "moderator" || role === "user" ? role : undefined;
  const validStatus = status === "active" || status === "disabled" ? status : undefined;
  return {
    filters: { q, role: validRole ?? "", status: validStatus ?? "" },
    search: q || undefined,
    role: validRole,
    status: validStatus,
    // Opaque since 061; the server ignores one that isn't its own.
    cursor: cursor && cursor.length <= 1024 ? cursor : undefined,
  };
};

export const usersPageUrl = (filters: UserFilters, cursor?: string): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `/admin/users?${query}` : "/admin/users";
};
