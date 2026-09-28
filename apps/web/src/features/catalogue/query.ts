import type { CatalogueQuery } from "@/server/domains/items/actions/catalogue";

export type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/** Reads `?q=`, `?type=`, `?scope=`, `?sort=` and `?cursor=`; the service drops anything unknown. */
export const parseCatalogueQuery = (params: SearchParams): CatalogueQuery => ({
  q: first(params.q),
  type: first(params.type) || undefined,
  scope: first(params.scope) || undefined,
  sort: first(params.sort) || undefined,
  cursor: first(params.cursor) || undefined,
});

type Shown = { q: string; type: string | null; scope: string | null; sort: "recent" | "name" };

/** The catalogue's URL for `query` with `changes`; the default sort and empty values are left out. */
export const catalogueHref = (query: Shown, changes: Partial<Shown> & { cursor?: string } = {}) => {
  const next = { ...query, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.type) params.set("type", next.type);
  if (next.scope) params.set("scope", next.scope);
  if (next.sort !== "recent") params.set("sort", next.sort);
  if (changes.cursor) params.set("cursor", changes.cursor);
  const search = params.toString();
  return search ? `/catalogue?${search}` : "/catalogue";
};
