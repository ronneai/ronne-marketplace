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

/** Returned by API routes until `pnpm run setup` has configured the instance (feature 005). */
export const setupRequiredResponse = () => {
  return errorResponse(
    503,
    "setup_required",
    "This instance isn't set up yet. Run `pnpm run setup` (in Docker: `docker compose exec web pnpm run setup`), then restart it.",
  );
};
