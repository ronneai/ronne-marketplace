import type { CatalogueQuery } from "@/server/domains/items/actions/catalogue";

export type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/**
 * Reads `?q=`, `?type=` (once per type, any of them), `?scope=`, `?workspace=` (090), `?tool=`,
 * `?favorites=1` (125), `?sort=` and `?cursor=`;
 * the service drops anything unknown.
 */
export const parseCatalogueQuery = (params: SearchParams): CatalogueQuery => ({
  q: first(params.q),
  type: [params.type ?? []].flat().filter(Boolean),
  scope: first(params.scope) || undefined,
  workspace: first(params.workspace) || undefined,
  tool: first(params.tool) || undefined,
  favorites: first(params.favorites) === "1" ? "1" : undefined,
  sort: first(params.sort) || undefined,
  cursor: first(params.cursor) || undefined,
});

type Shown = {
  q: string;
  types: readonly string[];
  scope: string | null;
  workspace: string | null;
  tool: string | null;
  favorites: boolean;
  sort: "recent" | "installs" | "name";
};

/**
 * The catalogue's URL for `query` with `changes`; the default sort and empty values are left out.
 * With `keepAll` (a current workspace is set, 120), all workspaces is written as an empty
 * `?workspace=`: left out, the page would redirect to the current workspace.
 */
export const catalogueHref = (
  query: Shown,
  changes: Partial<Shown> & { cursor?: string } = {},
  keepAll = false,
) => {
  const next = { ...query, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  for (const type of next.types) params.append("type", type);
  if (next.scope) params.set("scope", next.scope);
  if (next.workspace) params.set("workspace", next.workspace);
  else if (keepAll) params.set("workspace", "");
  if (next.tool) params.set("tool", next.tool);
  if (next.favorites) params.set("favorites", "1");
  if (next.sort !== "recent") params.set("sort", next.sort);
  if (changes.cursor) params.set("cursor", changes.cursor);
  const search = params.toString();
  return search ? `/catalogue?${search}` : "/catalogue";
};
