import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { listScopesAs } from "../domains/items/actions/scopes";
import { parseLimit, parseSearch } from "./api-query";
import { domainErrorResponse, errorResponse } from "./errors";
import { requireToken, type TokenGuardDeps } from "./require-token";

/**
 * The API that creates drafts (feature 037): what `rmk export` and the MCP server's export tools
 * call, with a personal access token. Thin, like the read API in registry-api.ts: the domains
 * decide everything; this parses, limits, maps errors and shapes JSON.
 */
export type DraftsApiDeps = { app?: AppAuth; guard?: TokenGuardDeps };

const orDomainError = (error: unknown) => {
  const response = domainErrorResponse(error);
  if (response) return response;
  throw error;
};

/** GET /api/v1/scopes: the scopes a draft can be created in, by name, so the client can ask. */
export const getScopes = async (request: Request, deps: DraftsApiDeps = {}) => {
  const guard = await requireToken(request, deps.guard);
  if (!guard.ok) return guard.response;
  const params = new URL(request.url).searchParams;
  const q = parseSearch(params.get("q"));
  const limit = parseLimit(params.get("limit"));
  if (!q.ok) return errorResponse(400, "invalid_request", q.message);
  if (!limit.ok) return errorResponse(400, "invalid_request", limit.message);
  try {
    const page = await listScopesAs(
      guard.auth.user,
      { search: q.value, cursor: params.get("cursor") ?? undefined, limit: limit.value },
      deps.app,
    );
    return Response.json(
      {
        scopes: page.scopes.map((scope) => ({ name: scope.name, description: scope.description })),
        nextCursor: page.nextCursor,
      },
      { headers: { "cache-control": "private, no-cache" } },
    );
  } catch (error) {
    return orDomainError(error);
  }
};
