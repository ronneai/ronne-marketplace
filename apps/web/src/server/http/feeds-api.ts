import { createHash } from "node:crypto";
import { formatItemName } from "@ronneai/core";
import { pluginName } from "@ronneai/core/plugins";
import { loadConfig } from "../config";
import {
  downloadPluginAs,
  findPluginAs,
  isServedTool,
  marketplaceAs,
  type ServedTool,
} from "../domains/feeds/actions/feeds";
import {
  FeedTooLargeError,
  FeedWorkspaceNotFoundError,
  PluginNotFoundError,
  PluginUnavailableError,
} from "../domains/feeds/exceptions/errors";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import type { StorageAdapter } from "../storage";
import { domainErrorResponse, errorResponse } from "./errors";
import { IMMUTABLE, itemRefOf, matchesEtag } from "./registry-api";
import { requireToken, type TokenGuardDeps } from "./require-token";

/**
 * The plugin feeds (feature 077, contract `docs/spec/plugin-feeds.md`): a tool's marketplace file
 * and its plugin zips, with a personal access token like the rest of `/api/v1`. Claude Code reads
 * its marketplace over HTTPS (077); Codex's and Cursor's are for `rmk feed build` (078).
 */
export type FeedsApiDeps = {
  app?: AppAuth;
  guard?: TokenGuardDeps;
  storage?: StorageAdapter;
  /** The instance's PUBLIC_URL, which every URL in a marketplace starts with. */
  publicUrl?: () => string | undefined;
};

const unknownTool = (tool: string) =>
  errorResponse(404, "feed_not_found", `This instance serves no plugin feed for ${tool}.`);

const feedErrorResponse = (error: unknown): Response => {
  if (error instanceof PluginNotFoundError)
    return errorResponse(404, "plugin_not_found", error.message, {
      item: error.itemName,
      version: error.version,
    });
  if (error instanceof PluginUnavailableError)
    return errorResponse(503, "plugin_unavailable", error.message, {
      item: error.itemName,
      version: error.version,
    });
  if (error instanceof FeedWorkspaceNotFoundError)
    return errorResponse(404, "workspace_not_found", error.message, {
      workspace: error.workspace,
    });
  if (error instanceof FeedTooLargeError)
    return errorResponse(507, "feed_too_large", error.message, { plugins: error.plugins });
  const response = domainErrorResponse(error);
  if (response) return response;
  throw error;
};

/**
 * `?workspaces=` for a git mirror (093): only the public workspaces, plus the private ones it names,
 * separated by commas. Absent, everything the caller sees, as Claude Code asks; but an rmk from
 * before 093 builds mirrors without it, so a request from any rmk (`user-agent: rmk/…`) without it
 * gets the public workspaces only. A forged header can only narrow the caller's own view.
 */
const workspacesOf = (request: Request): string[] | null => {
  const value = new URL(request.url).searchParams.get("workspaces");
  if (value === null)
    return (request.headers.get("user-agent") ?? "").startsWith("rmk/") ? [] : null;
  return [
    ...new Set(
      value
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ];
};

/** GET /api/v1/feeds/{tool}/marketplace.json: the tool's marketplace, built from the feed. */
export const getMarketplace = async (
  request: Request,
  params: { tool: string },
  deps: FeedsApiDeps = {},
) => {
  const guard = await requireToken(request, deps.guard);
  if (!guard.ok) return guard.response;
  const tool = decodeURIComponent(params.tool);
  if (!isServedTool(tool)) return unknownTool(tool);
  const publicUrl = (deps.publicUrl ?? (() => loadConfig().publicUrl))();
  if (!publicUrl)
    return errorResponse(
      503,
      "public_url_missing",
      "This instance has no PUBLIC_URL, and a plugin marketplace needs absolute URLs. Ask root to set it.",
    );
  try {
    const bytes = await marketplaceAs(
      guard.auth.user,
      tool,
      publicUrl,
      workspacesOf(request),
      deps.app,
      deps.storage,
    );
    // It changes with every release, so it's checked each time (contract, Endpoints).
    const etag = `"${createHash("sha256").update(bytes).digest("hex")}"`;
    const cache = { etag, "cache-control": "private, no-cache" };
    if (matchesEtag(request.headers.get("if-none-match"), etag))
      return new Response(null, { status: 304, headers: cache });
    return new Response(Uint8Array.from(bytes), {
      headers: {
        ...cache,
        "content-type": "application/json; charset=utf-8",
        "content-length": String(bytes.length),
      },
    });
  } catch (error) {
    return feedErrorResponse(error);
  }
};

/** `{version}.zip`, or null when the last segment isn't a zip's name. */
const versionOfFile = (file: string) => {
  const name = decodeURIComponent(file);
  return name.endsWith(".zip") && name.length > ".zip".length
    ? name.slice(0, -".zip".length)
    : null;
};

/**
 * GET and HEAD /api/v1/feeds/{tool}/plugins/{scope}/{name}/{version}.zip: a version's plugin; a
 * workspace's (118) at /api/v1/feeds/{tool}/workspaces/{workspace}/plugins/{scope}/{name}/….
 * `ETag` is its sha256. Only a full GET is counted as a download; HEAD and a matching
 * `If-None-Match` (304) count nothing.
 */
export const getPluginZip = async (
  request: Request,
  params: { tool: string; workspace?: string; scope: string; name: string; file: string },
  deps: FeedsApiDeps = {},
) => {
  const guard = await requireToken(request, deps.guard);
  if (!guard.ok) return guard.response;
  const tool = decodeURIComponent(params.tool);
  if (!isServedTool(tool)) return unknownTool(tool);
  const version = versionOfFile(params.file);
  if (!version) return errorResponse(404, "not_found", "A plugin's address ends in {version}.zip.");
  const ref = { ...itemRefOf(params), version };
  const served: ServedTool = tool;
  try {
    const found = await findPluginAs(guard.auth.user, served, ref, deps.app, deps.storage);
    const etag = `"${found.sha256}"`;
    // A plugin zip never changes: its version is immutable, and a new builder means a new key.
    const cache = { etag, "cache-control": IMMUTABLE };
    if (matchesEtag(request.headers.get("if-none-match"), etag))
      return new Response(null, { status: 304, headers: cache });
    const headers = {
      ...cache,
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${pluginName(formatItemName(ref))}-${version}.zip"`,
      "x-checksum-sha256": found.sha256,
    };
    if (request.method === "HEAD") return new Response(null, { headers });
    const plugin = await downloadPluginAs(guard.auth.user, served, ref, deps.app, deps.storage);
    // A copy on its own ArrayBuffer: storage may return a view into a shared one.
    return new Response(Uint8Array.from(plugin.bytes), {
      headers: { ...headers, "content-length": String(plugin.bytes.length) },
    });
  } catch (error) {
    return feedErrorResponse(error);
  }
};
