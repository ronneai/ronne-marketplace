import { ForbiddenError } from "../domains/identity/exceptions/errors";
import {
  ArtifactUnavailableError,
  ItemNotFoundError,
  VersionNotFoundError,
} from "../domains/items/exceptions/errors";
import {
  DraftLimitError,
  DraftMismatchError,
  DraftQuotaError,
  DraftScopeNotFoundError,
  FileTooLargeError,
  InvalidFileContentError,
  InvalidFilePathError,
  InvalidItemNameError,
  InvalidItemTypeError,
  ManifestRequiredError,
  ProposalBaseNotFoundError,
  SubmissionNotEditableError,
  SubmissionNotFoundError,
  TypeChangedError,
} from "../domains/submissions/exceptions/errors";
import { setupCommand } from "../runtime";

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
  if (error instanceof ArtifactUnavailableError)
    return errorResponse(500, "artifact_unavailable", error.message);
  if (error instanceof ForbiddenError) return errorResponse(403, "forbidden", error.message);
  return submissionErrorResponse(error);
};

/** The submissions domain's errors that uploading (037) or replacing (051) a draft can raise. */
const submissionErrorResponse = (error: unknown): Response | null => {
  if (error instanceof InvalidItemNameError)
    return errorResponse(400, "invalid_name", error.message);
  if (error instanceof InvalidItemTypeError)
    return errorResponse(400, "invalid_type", error.message);
  if (error instanceof InvalidFilePathError)
    return errorResponse(400, "invalid_path", error.message, { path: error.path });
  if (error instanceof InvalidFileContentError)
    return errorResponse(400, "invalid_content", error.message, { path: error.path });
  if (error instanceof ManifestRequiredError)
    return errorResponse(400, "manifest_required", error.message);
  if (error instanceof DraftScopeNotFoundError)
    return errorResponse(404, "scope_not_found", error.message, { scope: error.scopeName });
  if (error instanceof ProposalBaseNotFoundError)
    return error.version
      ? errorResponse(404, "version_not_found", error.message, {
          item: error.itemName,
          version: error.version,
        })
      : errorResponse(404, "item_not_found", error.message, { item: error.itemName });
  if (error instanceof TypeChangedError)
    return errorResponse(400, "type_changed", error.message, {
      item: error.itemName,
      type: error.from,
    });
  if (error instanceof DraftQuotaError)
    return errorResponse(409, "draft_limit", error.message, { limit: error.limit });
  // Replacing a draft (051): missing and someone else's look the same.
  if (error instanceof SubmissionNotFoundError)
    return errorResponse(404, "draft_not_found", "You have no draft with that id.");
  if (error instanceof SubmissionNotEditableError)
    return errorResponse(
      409,
      "not_editable",
      error.status === "submitted"
        ? "That draft is in review. Withdraw it in the web app to change it."
        : error.message,
      error.status ? { status: error.status } : undefined,
    );
  if (error instanceof DraftMismatchError)
    return errorResponse(409, "draft_mismatch", error.message, { ...error.draft });
  if (error instanceof FileTooLargeError)
    return errorResponse(413, "file_too_large", error.message, {
      path: error.path,
      limit: error.max,
    });
  if (error instanceof DraftLimitError)
    return errorResponse(413, "draft_too_large", error.message, {
      limit: error.max,
      of: error.limit === "files" ? "files" : "bytes",
    });
  return null;
};

/** `429 rate_limited`, with `retry-after`. */
export const rateLimitedResponse = (message: string, retryAfterSeconds: number) =>
  errorResponse(
    429,
    "rate_limited",
    message,
    { retryAfterSeconds },
    { "retry-after": String(retryAfterSeconds) },
  );

/** Returned by API routes until the instance is set up (features 005 and 036). */
export const setupRequiredResponse = () => {
  return errorResponse(
    503,
    "setup_required",
    `This instance isn't set up yet. Open it in a browser and follow the setup, or run \`${setupCommand()}\`.`,
  );
};
