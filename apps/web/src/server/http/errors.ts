import { ForbiddenError } from "../domains/identity/exceptions/errors";
import { ItemNotFoundError, VersionNotFoundError } from "../domains/items/exceptions/errors";

/** The one error shape for every API response (MVP §11). `code` is stable; clients may rely on it. */
export type ApiError = {
  error: { code: string; message: string; details?: Record<string, unknown> };
};

export const errorResponse = (
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
  headers: Record<string, string> = {},
) => {
  const body: ApiError = { error: details ? { code, message, details } : { code, message } };
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
};

/**
 * A domain error as an API response (019), or null when it isn't one the API knows: the route then
 * lets it through as a 500. Codes are stable; clients may rely on them (MVP §11).
 */
export const domainErrorResponse = (error: unknown): Response | null => {
  if (error instanceof ItemNotFoundError)
    return errorResponse(404, "item_not_found", error.message);
  if (error instanceof VersionNotFoundError)
    return errorResponse(404, "version_not_found", error.message);
  if (error instanceof ForbiddenError) return errorResponse(403, "forbidden", error.message);
  return null;
};

/** Returned by API routes until `pnpm run setup` has configured the instance (feature 005). */
export const setupRequiredResponse = () => {
  return errorResponse(
    503,
    "setup_required",
    "This instance isn't set up yet. Run `pnpm run setup` (in Docker: `docker compose exec web pnpm run setup`), then restart it.",
  );
};
