import {
  authenticateScim,
  type ScimCaller,
  type ScimOptions,
} from "../domains/identity/actions/scim";
import { type AppAuth, getAppAuth } from "../domains/identity/repositories/auth-instance";
import {
  listResponse,
  resourceTypeDocuments,
  schemaDocuments,
  serviceProviderConfig,
} from "./scim-discovery";
import { scimError, scimJson, scimRateLimited, scimUnauthorized } from "./scim-format";
import { scimUsersHandler } from "./scim-users-api";

/**
 * `/api/v1/scim/v2/*` (feature 108): the SCIM server an identity provider calls. Outside the API's
 * own bearer guard (009: `rmk_` tokens, users): discovery is public, Users and Groups need the
 * provider's `scim_` token (`authenticateScim`). Every answer is `application/scim+json` and never
 * cached; no cookie is read or set.
 */
export const SCIM_PATH = "/api/v1/scim/v2";

/**
 * What a Users or Groups handler gets: who's calling, the method (`HEAD` arrives as `GET`), the id
 * in the path, and the base URL.
 */
export type ScimContext = {
  caller: ScimCaller;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  id: string | null;
  base: string;
};

export type ScimResourceHandler = (request: Request, context: ScimContext) => Promise<Response>;

export type ScimResources = { Users: ScimResourceHandler; Groups: ScimResourceHandler };

/** Groups land in task 5; until then, an authenticated request learns that. */
const notYet: ScimResourceHandler = async () => scimError(501, "This resource isn't served yet.");

const resourcesFor = (app: AppAuth, options: ScimOptions): ScimResources => ({
  Users: scimUsersHandler(app, options),
  Groups: notYet,
});

export type ScimApiOptions = ScimOptions & { resources?: ScimResources };

/** `<PUBLIC_URL>/api/v1/scim/v2`, from the instance's base URL. */
const scimBase = async (app: AppAuth) => {
  const ctx = await app.auth.$context;
  const base = String(ctx.options.baseURL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${SCIM_PATH}`;
};

/** The path's segments after `/api/v1/scim/v2`, decoded; null when one can't be. */
const segmentsOf = (request: Request): string[] | null => {
  const path = new URL(request.url).pathname;
  const inside = path === SCIM_PATH || path.startsWith(`${SCIM_PATH}/`);
  const rest = inside ? path.slice(SCIM_PATH.length) : "";
  try {
    return rest
      .split("/")
      .filter((part) => part.length > 0)
      .map((part) => decodeURIComponent(part));
  } catch {
    return null;
  }
};

const notFound = () => scimError(404, "There's no such SCIM resource here.");

const methodNotAllowed = (allowed: string) =>
  scimError(405, `Use ${allowed} here.`, undefined, { allow: allowed });

const discovery = (segments: string[], base: string): Response => {
  const [kind, id, extra] = segments;
  if (extra !== undefined) return notFound();
  if (kind === "ServiceProviderConfig")
    return id === undefined ? scimJson(serviceProviderConfig(base)) : notFound();
  const documents = kind === "Schemas" ? schemaDocuments(base) : resourceTypeDocuments(base);
  if (id === undefined) return scimJson(listResponse(documents));
  const found = documents.find((document) => document.id === id);
  return found ? scimJson(found) : notFound();
};

const DISCOVERY = new Set(["ServiceProviderConfig", "ResourceTypes", "Schemas"]);

export const handleScim = async (
  request: Request,
  app: AppAuth = getAppAuth(),
  options: ScimApiOptions = {},
): Promise<Response> => {
  // Next runs GET's handler for HEAD (the route doesn't export HEAD) and drops the body, but the
  // request still says HEAD: it's a GET here, so HEAD works wherever GET does (RFC 9110 §9.1).
  const method = request.method === "HEAD" ? "GET" : request.method;
  const segments = segmentsOf(request);
  if (!segments || segments.length === 0) return notFound();
  const [kind, id, extra] = segments;

  if (DISCOVERY.has(kind as string)) {
    if (method !== "GET") return methodNotAllowed("GET, HEAD");
    return discovery(segments, await scimBase(app));
  }
  if (kind === "Bulk" || kind === "Me")
    return scimError(501, `${kind} isn't supported: see ServiceProviderConfig.`);
  if (kind !== "Users" && kind !== "Groups") return notFound();
  if (extra !== undefined) return notFound();

  const allowed = id === undefined ? ["GET", "POST"] : ["GET", "PUT", "PATCH", "DELETE"];
  if (!allowed.includes(method)) return methodNotAllowed(["HEAD", ...allowed].sort().join(", "));

  const guard = await authenticateScim(request.headers, app, options);
  if (!guard.ok)
    return guard.status === 429 ? scimRateLimited(guard.retryAfterSeconds) : scimUnauthorized();

  const handler = (options.resources ?? resourcesFor(app, options))[kind];
  return handler(request, {
    caller: guard.caller,
    method: method as ScimContext["method"],
    id: id ?? null,
    base: await scimBase(app),
  });
};
