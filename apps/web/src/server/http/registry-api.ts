import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { searchCatalogueAs } from "../domains/items/actions/catalogue";
import { downloadArtifactAs, findDownloadAs, itemPageAs } from "../domains/items/actions/versions";
import type { StorageAdapter } from "../storage";
import { parseLimit, parseSearch, parseSort, parseType } from "./api-query";
import { domainErrorResponse, errorResponse } from "./errors";
import { itemJson, itemSummaryJson, versionJson } from "./registry-json";
import { requireToken, type TokenGuardDeps } from "./require-token";

/**
 * The registry's read API (feature 019): what `rmk` and the MCP server read, with a personal
 * access token. Thin: the items domain decides everything; this parses, maps errors and shapes JSON.
 */
export type RegistryApiDeps = { app?: AppAuth; guard?: TokenGuardDeps; storage?: StorageAdapter };

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

type VersionParams = { scope: string; name: string; version: string };

/** GET /api/v1/items/{scope}/{name}/{version}: one version's manifest, files and risk flags. */
export const getVersion = async (
  request: Request,
  params: VersionParams,
  deps: RegistryApiDeps = {},
) => {
  const guard = await requireToken(request, deps.guard);
  if (!guard.ok) return guard.response;
  try {
    const page = await itemPageAs(
      guard.auth.user,
      itemRefOf(params),
      decodeURIComponent(params.version),
      deps.app,
    );
    // A version's files never change, but it can still be deprecated, yanked or re-tagged.
    return fresh(versionJson(page));
  } catch (error) {
    return orDomainError(error);
  }
};

/** An artifact never changes once published (MVP §3.4). */
const IMMUTABLE = "private, max-age=31536000, immutable";

const matchesEtag = (header: string | null, etag: string) =>
  header !== null && header.split(",").some((value) => value.trim().replace(/^W\//, "") === etag);

/**
 * GET and HEAD /api/v1/items/{scope}/{name}/{version}/tarball: the artifact with its checksum.
 * Yanked versions download too (a lockfile may pin one). Only a full GET is counted; HEAD and a
 * matching `If-None-Match` (304) read nothing from storage and count nothing.
 */
export const getTarball = async (
  request: Request,
  params: VersionParams,
  deps: RegistryApiDeps = {},
) => {
  const guard = await requireToken(request, deps.guard);
  if (!guard.ok) return guard.response;
  const ref = itemRefOf(params);
  const version = decodeURIComponent(params.version);
  try {
    const found = await findDownloadAs(guard.auth.user, ref, version, deps.app);
    const etag = `"${found.version.sha256}"`;
    const cache = { etag, "cache-control": IMMUTABLE };
    if (matchesEtag(request.headers.get("if-none-match"), etag))
      return new Response(null, { status: 304, headers: cache });
    const headers = {
      ...cache,
      "content-type": "application/gzip",
      "content-disposition": `attachment; filename="${ref.scope}-${ref.name}-${version}.tgz"`,
      "x-checksum-sha256": found.version.sha256,
    };
    if (request.method === "HEAD")
      return new Response(null, {
        headers: { ...headers, "content-length": String(found.version.size) },
      });
    const artifact = await downloadArtifactAs(
      guard.auth.user,
      ref,
      version,
      deps.app,
      deps.storage,
    );
    // A copy on its own ArrayBuffer: storage may return a view into a shared one.
    return new Response(Uint8Array.from(artifact.bytes), {
      headers: { ...headers, "content-length": String(artifact.size) },
    });
  } catch (error) {
    return orDomainError(error);
  }
};
