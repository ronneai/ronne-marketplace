import type { ScimOptions } from "../domains/identity/actions/scim";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { kyselyScimGroupRepository } from "../domains/identity/repositories/kysely-scim-group-repository";
import {
  createScimGroup,
  deleteScimGroup,
  getScimGroup,
  listScimGroups,
  patchScimGroup,
  replaceScimGroup,
} from "../domains/identity/services/scim-groups";
import type { ScimResourceHandler } from "./scim-api";
import { listResponse } from "./scim-discovery";
import { scimError, scimJson } from "./scim-format";
import { readScimBody, scimErrorResponse } from "./scim-users-api";

/**
 * `/api/v1/scim/v2/Groups` (feature 108): the HTTP side of SCIM Groups, after the guard.
 * `excludedAttributes=members` (Entra's habit when it only checks a group exists) leaves the
 * members out of the answer.
 */
const withoutMembers = (request: Request) =>
  (new URL(request.url).searchParams.get("excludedAttributes") ?? "")
    .split(",")
    .some((name) => name.trim().toLowerCase() === "members");

export const scimGroupsHandler =
  (app: AppAuth, options: ScimOptions = {}): ScimResourceHandler =>
  async (request, { caller, method, id, base }) => {
    const deps = { repo: kyselyScimGroupRepository(app.db, app.dialect), now: options.now };
    const who = { providerId: caller.providerId, ip: caller.ip };
    try {
      if (id === null && method === "GET") {
        const params = new URL(request.url).searchParams;
        const page = await listScimGroups(
          deps,
          who,
          {
            filter: params.get("filter"),
            startIndex: params.get("startIndex"),
            count: params.get("count"),
            withMembers: !withoutMembers(request),
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
        const resource = await createScimGroup(deps, who, body.value, base);
        return scimJson(resource, 201, { location: resource.meta.location });
      }
      if (id !== null && method === "GET")
        return scimJson(await getScimGroup(deps, who, id, base, !withoutMembers(request)));
      if (id !== null && (method === "PUT" || method === "PATCH")) {
        const body = await readScimBody(request);
        if (!body.ok) return body.response;
        const resource =
          method === "PUT"
            ? await replaceScimGroup(deps, who, id, body.value, base)
            : await patchScimGroup(deps, who, id, body.value, base);
        return scimJson(resource);
      }
      if (id !== null && method === "DELETE") {
        await deleteScimGroup(deps, who, id);
        return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
      }
      return scimError(405, "That method isn't allowed here.");
    } catch (error) {
      const response = scimErrorResponse(error);
      if (response) return response;
      throw error;
    }
  };
