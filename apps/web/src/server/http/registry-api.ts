import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { searchCatalogueAs } from "../domains/items/actions/catalogue";
import { itemPageAs } from "../domains/items/actions/versions";
import { parseLimit, parseSearch, parseSort, parseType } from "./api-query";
import { domainErrorResponse, errorResponse } from "./errors";
import { itemJson, itemSummaryJson } from "./registry-json";
import { requireToken, type TokenGuardDeps } from "./require-token";

/**
 * The registry's read API (feature 019): what `rmk` and the MCP server read, with a personal
 * access token. Thin: the items domain decides everything; this parses, maps errors and shapes JSON.
 */
export type RegistryApiDeps = { app?: AppAuth; guard?: TokenGuardDeps };

/** Search and item responses may change at any time. */
const fresh = (body: unknown) =>
  Response.json(body, { headers: { "cache-control": "private, no-cache" } });

/** An item's name from the path: `platform/code-reviewer`, with an optional `@`. */
export const itemRefOf = (params: { scope: string; name: string }) => ({
  scope: decodeURIComponent(params.scope).replace(/^@/, ""),
  name: decodeURIComponent(params.name),
});

const orDomainError = (error: unknown) => {
  const response = domainErrorResponse(error);
  if (response) return response;
  throw error;
};

/** GET /api/v1/items: search and filter the published items (018's catalogue). */
export const listItems = async (request: Request, deps: RegistryApiDeps = {}) => {
  const guard = await requireToken(request, deps.guard);
  if (!guard.ok) return guard.response;
  const params = new URL(request.url).searchParams;
  const q = parseSearch(params.get("q"));
  const type = parseType(params.get("type"));
  const sort = parseSort(params.get("sort"));
  const limit = parseLimit(params.get("limit"));
  const invalid = (message: string) => errorResponse(400, "invalid_request", message);
  if (!q.ok) return invalid(q.message);
  if (!type.ok) return invalid(type.message);
  if (!sort.ok) return invalid(sort.message);
  if (!limit.ok) return invalid(limit.message);
  try {
    const page = await searchCatalogueAs(
      guard.auth.user,
      {
        q: q.value,
        type: type.value,
        scope: params.get("scope")?.replace(/^@/, "") || null,
        sort: sort.value,
        cursor: params.get("cursor") ?? undefined,
        limit: limit.value,
      },
      deps.app,
    );
    return fresh({ items: page.entries.map(itemSummaryJson), nextCursor: page.nextCursor });
  } catch (error) {
    return orDomainError(error);
  }
};

/** GET /api/v1/items/{scope}/{name}: an item, its dist-tags and its versions. */
export const getItem = async (
  request: Request,
  params: { scope: string; name: string },
  deps: RegistryApiDeps = {},
) => {
  const guard = await requireToken(request, deps.guard);
  if (!guard.ok) return guard.response;
  try {
    return fresh(
      itemJson(await itemPageAs(guard.auth.user, itemRefOf(params), undefined, deps.app)),
    );
  } catch (error) {
    return orDomainError(error);
  }
};
