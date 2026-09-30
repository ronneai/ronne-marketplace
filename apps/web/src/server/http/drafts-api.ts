import { loadConfig } from "../config";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { listScopesAs } from "../domains/items/actions/scopes";
import { createDraftFromFilesAs, type UploadFile } from "../domains/submissions/actions/drafts";
import { parseLimit, parseSearch } from "./api-query";
import { domainErrorResponse, errorResponse, rateLimitedResponse } from "./errors";
import { MIB, readJsonObjectWithin } from "./read-json";
import { requireToken, type TokenGuardDeps } from "./require-token";
import { type UploadLimiter, uploadLimiter } from "./upload-rate-limit";

/**
 * The API that creates drafts (feature 037): what `rmk export` and the MCP server's export tools
 * call, with a personal access token. Thin, like the read API in registry-api.ts: the domains
 * decide everything; this parses, limits, maps errors and shapes JSON.
 */
export type DraftsApiDeps = {
  app?: AppAuth;
  guard?: TokenGuardDeps;
  limiter?: UploadLimiter;
  /** The instance's public address, for the draft's `url`; by default PUBLIC_URL, or none. */
  publicUrl?: string | null;
};

/** A full 20 MiB draft as base64 (4/3 of it), plus room for the JSON around it. */
export const DRAFT_BODY_MAX_BYTES = 28 * MIB;

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

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const SHAPE =
  'Send JSON: { "name": "@scope/name", "type", "files": [{ "path", "encoding": "utf8" | "base64", "content", "executable"? }] }.';

const parseFile = (value: unknown): UploadFile | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { path, encoding, content, executable } = value as Record<string, unknown>;
  if (typeof path !== "string" || typeof content !== "string") return null;
  if (encoding !== "utf8" && encoding !== "base64") return null;
  if (executable !== undefined && typeof executable !== "boolean") return null;
  return { path, encoding, content, executable: executable ?? false };
};

const parseUpload = (
  body: Record<string, unknown> | null,
): Parsed<{ name: string; type: string; files: UploadFile[] }> => {
  if (!body || typeof body.name !== "string" || typeof body.type !== "string")
    return { ok: false, message: SHAPE };
  if (!Array.isArray(body.files)) return { ok: false, message: SHAPE };
  const files: UploadFile[] = [];
  for (const [index, value] of body.files.entries()) {
    const file = parseFile(value);
    if (!file) return { ok: false, message: `files[${index}] isn't a file. ${SHAPE}` };
    files.push(file);
  }
  return { ok: true, value: { name: body.name, type: body.type, files } };
};

const publicUrlOf = (deps: DraftsApiDeps): string | null => {
  const url = deps.publicUrl === undefined ? loadConfig().publicUrl : deps.publicUrl;
  return url?.replace(/\/+$/, "") || null;
};

/**
 * POST /api/v1/drafts: a draft of a new item with its files, owned by the token's user, who reviews
 * and submits it in the web app. In order: the token, the rate, the body's size, its shape, then
 * the submissions domain's checks. A draft with errors is still created; they're in `issues`.
 */
export const postDraft = async (request: Request, deps: DraftsApiDeps = {}) => {
  const guard = await requireToken(request, deps.guard);
  if (!guard.ok) return guard.response;
  const rate = (deps.limiter ?? uploadLimiter()).consume(guard.auth.user.id);
  if (!rate.allowed)
    return rateLimitedResponse(
      "Too many uploads: at most 30 in 10 minutes. Wait, then try again.",
      rate.retryAfterSeconds,
    );
  const read = await readJsonObjectWithin(request, DRAFT_BODY_MAX_BYTES);
  if (!read.ok) return read.response;
  const upload = parseUpload(read.body);
  if (!upload.ok) return errorResponse(400, "invalid_request", upload.message);
  const itemName = /^@([^/]+)\/([^/]+)$/.exec(upload.value.name.trim());
  if (!itemName)
    return errorResponse(
      400,
      "invalid_name",
      `${upload.value.name || "(empty)"} isn't an item name: use @scope/name.`,
    );
  try {
    const { draft, issues, submitIssues } = await createDraftFromFilesAs(
      guard.auth,
      request.headers,
      {
        scope: itemName[1] ?? "",
        name: itemName[2] ?? "",
        type: upload.value.type,
        files: upload.value.files,
      },
      deps.app,
    );
    const path = `/submissions/${draft.id}`;
    const base = publicUrlOf(deps);
    return Response.json(
      {
        id: draft.id,
        path,
        url: base ? `${base}${path}` : null,
        name: `@${draft.scope.name}/${draft.name}`,
        type: draft.type,
        status: draft.status,
        files: draft.files.length,
        bytes: draft.files.reduce((sum, file) => sum + file.size, 0),
        issues,
        submitIssues,
      },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return orDomainError(error);
  }
};
