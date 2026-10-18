import type { ScimOptions } from "../domains/identity/actions/scim";
import { ScimRequestError } from "../domains/identity/models/scim-user";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { kyselyScimUserRepository } from "../domains/identity/repositories/kysely-scim-user-repository";
import {
  createScimUser,
  deleteScimUser,
  getScimUser,
  listScimUsers,
  patchScimUser,
  replaceScimUser,
} from "../domains/identity/services/scim-users";
import { SMALL_JSON_MAX_BYTES } from "./read-json";
import type { ScimResourceHandler } from "./scim-api";
import { listResponse } from "./scim-discovery";
import { SCIM_MEDIA_TYPE, scimError, scimJson, scimUnauthorized } from "./scim-format";

/**
 * `/api/v1/scim/v2/Users` (feature 108): the HTTP side of SCIM Users, after the guard. Reads the
 * body in SCIM's terms (RFC 7644 §3.1), calls the service, and turns a `ScimRequestError` into its
 * SCIM error. Anything else is a 500 through `apiRoute`.
 */
const ACCEPTED_TYPES = new Set(["application/json", SCIM_MEDIA_TYPE]);

/** The request's JSON body, or the SCIM error to answer with. */
export const readScimBody = async (
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> => {
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!ACCEPTED_TYPES.has(type))
    return {
      ok: false,
      response: scimError(415, "Send application/scim+json (or application/json)."),
    };
  const text = await request.text();
  if (text.length > SMALL_JSON_MAX_BYTES)
    return { ok: false, response: scimError(413, "The request body is too large.") };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: scimError(400, "The body isn't valid JSON.", "invalidSyntax") };
  }
};

export const scimErrorResponse = (error: unknown): Response | null => {
  if (!(error instanceof ScimRequestError)) return null;
  return error.status === 401
    ? scimUnauthorized()
    : scimError(error.status, error.detail, error.scimType);
};

export const scimUsersHandler =
  (app: AppAuth, options: ScimOptions = {}): ScimResourceHandler =>
  async (request, { caller, method, id, base }) => {
    const deps = { repo: kyselyScimUserRepository(app.db, app.dialect), now: options.now };
    try {
      if (id === null && method === "GET") {
        const params = new URL(request.url).searchParams;
        const page = await listScimUsers(
          deps,
          caller,
          {
            filter: params.get("filter"),
            startIndex: params.get("startIndex"),
            count: params.get("count"),
          },
          base,
        );
        return scimJson(
          listResponse(page.resources, { total: page.total, startIndex: page.startIndex }),
        );
      }
      if (id === null && method === "POST") {
        const body = await readScimBody(request);
        if (!body.ok) return body.response;
        const resource = await createScimUser(deps, caller, body.value, base);
        return scimJson(resource, 201, { location: resource.meta.location });
      }
      if (id !== null && method === "GET")
        return scimJson(await getScimUser(deps, caller, id, base));
      if (id !== null && (method === "PUT" || method === "PATCH")) {
        const body = await readScimBody(request);
        if (!body.ok) return body.response;
        const resource =
          method === "PUT"
            ? await replaceScimUser(deps, caller, id, body.value, base)
            : await patchScimUser(deps, caller, id, body.value, base);
        return scimJson(resource);
      }
      if (id !== null && method === "DELETE") {
        await deleteScimUser(deps, caller, id);
        return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
      }
      return scimError(405, "That method isn't allowed here.");
    } catch (error) {
      const response = scimErrorResponse(error);
      if (response) return response;
      throw error;
    }
  };
