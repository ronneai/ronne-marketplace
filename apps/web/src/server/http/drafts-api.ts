import { loadConfig } from "../config";
import type { Authenticated } from "../domains/identity/actions/access-tokens";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { listScopesAs } from "../domains/items/actions/scopes";
import {
  createDraftFromFilesAs,
  listOpenDraftsAs,
  replaceDraftFromFilesAs,
  type UploadedDraft,
  type UploadFile,
} from "../domains/submissions/actions/drafts";
import type { Submission } from "../domains/submissions/models/submission";
import type { StorageAdapter } from "../storage";
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
  /** Where published versions are, to tell a proposal that changes nothing (042). */
  storage?: StorageAdapter;
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
): Parsed<{ name: string; type: string; files: UploadFile[]; base?: string }> => {
  if (!body || typeof body.name !== "string" || typeof body.type !== "string")
    return { ok: false, message: SHAPE };
  if (!Array.isArray(body.files)) return { ok: false, message: SHAPE };
  const files: UploadFile[] = [];
  for (const [index, value] of body.files.entries()) {
    const file = parseFile(value);
    if (!file) return { ok: false, message: `files[${index}] isn't a file. ${SHAPE}` };
    files.push(file);
  }
  if (body.base !== undefined && (typeof body.base !== "string" || !body.base.trim()))
    return { ok: false, message: "`base` is a published version of the item, such as 1.2.0." };
  return {
    ok: true,
    value: {
      name: body.name,
      type: body.type,
      files,
      ...(typeof body.base === "string" ? { base: body.base.trim() } : {}),
    },
  };
};

const publicUrlOf = (deps: DraftsApiDeps): string | null => {
  const url = deps.publicUrl === undefined ? loadConfig().publicUrl : deps.publicUrl;
  return url?.replace(/\/+$/, "") || null;
};

/** An item's name as the API takes it, split; null when it isn't `@scope/name`. */
const splitName = (value: string) => {
  const match = /^@([^/]+)\/([^/]+)$/.exec(value.trim());
  return match ? { scope: match[1] ?? "", name: match[2] ?? "" } : null;
};

const invalidName = (value: string) =>
  errorResponse(400, "invalid_name", `${value || "(empty)"} isn't an item name: use @scope/name.`);

type ReadUpload =
  | {
      ok: true;
      auth: Authenticated;
      input: { scope: string; name: string; type: string; files: UploadFile[]; base?: string };
    }
  | { ok: false; response: Response };

/** An upload's request, in order: the token, the rate, the body's size, its shape, the name. */
const readUpload = async (request: Request, deps: DraftsApiDeps): Promise<ReadUpload> => {
  const guard = await requireToken(request, deps.guard);
  if (!guard.ok) return { ok: false, response: guard.response };
  const rate = (deps.limiter ?? uploadLimiter()).consume(guard.auth.user.id);
  if (!rate.allowed)
    return {
      ok: false,
      response: rateLimitedResponse(
        "Too many uploads: at most 30 in 10 minutes. Wait, then try again.",
        rate.retryAfterSeconds,
      ),
    };
  const read = await readJsonObjectWithin(request, DRAFT_BODY_MAX_BYTES);
  if (!read.ok) return { ok: false, response: read.response };
  const upload = parseUpload(read.body);
  if (!upload.ok)
    return { ok: false, response: errorResponse(400, "invalid_request", upload.message) };
  const itemName = splitName(upload.value.name);
  if (!itemName) return { ok: false, response: invalidName(upload.value.name) };
  return {
    ok: true,
    auth: guard.auth,
    input: {
      ...itemName,
      type: upload.value.type,
      files: upload.value.files,
      ...(upload.value.base ? { base: upload.value.base } : {}),
    },
  };
};

/** Where a submission is: its page, and the full address when the instance has one. */
const placeOf = (deps: DraftsApiDeps, id: string) => {
  const path = `/submissions/${id}`;
  const base = publicUrlOf(deps);
  return { path, url: base ? `${base}${path}` : null };
};

/** 037's answer for a draft that was uploaded: created, or replaced (051). */
const uploadedJson = (
  deps: DraftsApiDeps,
  { draft, issues, submitIssues, proposal }: UploadedDraft,
) => ({
  id: draft.id,
  ...placeOf(deps, draft.id),
  name: `@${draft.scope.name}/${draft.name}`,
  type: draft.type,
  status: draft.status,
  files: draft.files.length,
  bytes: draft.files.reduce((sum, file) => sum + file.size, 0),
  issues,
  submitIssues,
  proposal,
});

/**
 * POST /api/v1/drafts: a draft of a new item with its files, owned by the token's user, who reviews
 * and submits it in the web app. In order: the token, the rate, the body's size, its shape, then
 * the submissions domain's checks. A draft with errors is still created; they're in `issues`.
 */
export const postDraft = async (request: Request, deps: DraftsApiDeps = {}) => {
  const upload = await readUpload(request, deps);
  if (!upload.ok) return upload.response;
  try {
    const created = await createDraftFromFilesAs(
      upload.auth,
      request.headers,
      upload.input,
      deps.app,
      ...(deps.storage ? [deps.storage] : []),
    );
    return Response.json(uploadedJson(deps, created), {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return orDomainError(error);
  }
};

/**
 * PUT /api/v1/drafts/{id}: replaces the files of the token's user's draft, or one sent back for
 * changes, with 037's body (051), when it's the same item: `rmk export` exporting it again. Checked
 * in POST's order, then the draft's: someone else's is `draft_not_found`, a submitted one
 * `not_editable`, another name, type or base `draft_mismatch`.
 */
export const putDraft = async (
  request: Request,
  { id }: { id: string },
  deps: DraftsApiDeps = {},
) => {
  const upload = await readUpload(request, deps);
  if (!upload.ok) return upload.response;
  try {
    const replaced = await replaceDraftFromFilesAs(
      upload.auth,
      request.headers,
      id,
      upload.input,
      deps.app,
      ...(deps.storage ? [deps.storage] : []),
    );
    return Response.json(uploadedJson(deps, replaced), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return orDomainError(error);
  }
};

const openDraftJson = (deps: DraftsApiDeps, submission: Submission) => ({
  id: submission.id,
  ...placeOf(deps, submission.id),
  name: `@${submission.scope.name}/${submission.name}`,
  type: submission.type,
  status: submission.status,
  updatedAt: submission.updatedAt.toISOString(),
  proposal: submission.proposal
    ? {
        item: `@${submission.scope.name}/${submission.name}`,
        baseVersion: submission.proposal.baseVersion,
      }
    : null,
});

/**
 * GET /api/v1/drafts?name=@scope/name: the token's user's drafts, submissions sent back for
 * changes, and submissions in review, of that item (or all of them), newest change first (051).
 * What `rmk export` looks at before deciding to update a draft. Nobody else's are listed.
 */
export const getDrafts = async (request: Request, deps: DraftsApiDeps = {}) => {
  const guard = await requireToken(request, deps.guard);
  if (!guard.ok) return guard.response;
  const name = new URL(request.url).searchParams.get("name");
  if (name !== null && !splitName(name)) return invalidName(name);
  try {
    const drafts = await listOpenDraftsAs(guard.auth, name?.trim() ?? undefined, deps.app);
    return Response.json(
      { drafts: drafts.map((submission) => openDraftJson(deps, submission)) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return orDomainError(error);
  }
};
