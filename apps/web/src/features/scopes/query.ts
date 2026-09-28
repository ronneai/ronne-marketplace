import { isValidName } from "@ronneai/core";

export type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/** Reads `?q=` and `?cursor=` (a scope name). Anything malformed is ignored. */
export const parseScopesQuery = (params: SearchParams) => {
  const search = first(params.q).trim().slice(0, 100);
  const cursor = first(params.cursor);
  return { search, cursor: isValidName(cursor) ? cursor : undefined };
};
