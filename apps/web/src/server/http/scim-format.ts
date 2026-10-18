/**
 * SCIM's wire format (RFC 7644, feature 108): `application/scim+json`, never cached, and its own
 * error shape (§3.12), which identity providers parse instead of the API's (MVP §11).
 */
export const SCIM_MEDIA_TYPE = "application/scim+json";

export const SCIM_SCHEMAS = {
  user: "urn:ietf:params:scim:schemas:core:2.0:User",
  group: "urn:ietf:params:scim:schemas:core:2.0:Group",
  serviceProviderConfig: "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig",
  resourceType: "urn:ietf:params:scim:schemas:core:2.0:ResourceType",
  schema: "urn:ietf:params:scim:schemas:core:2.0:Schema",
  listResponse: "urn:ietf:params:scim:api:messages:2.0:ListResponse",
  patchOp: "urn:ietf:params:scim:api:messages:2.0:PatchOp",
  error: "urn:ietf:params:scim:api:messages:2.0:Error",
} as const;

/** RFC 7644 §3.12's `scimType`s that Ronne answers with. */
export type ScimType =
  | "invalidFilter"
  | "tooMany"
  | "uniqueness"
  | "mutability"
  | "invalidSyntax"
  | "invalidPath"
  | "noTarget"
  | "invalidValue";

const HEADERS = { "content-type": SCIM_MEDIA_TYPE, "cache-control": "no-store" };

export const scimJson = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...headers } });

export const scimError = (
  status: number,
  detail: string,
  scimType?: ScimType,
  headers: Record<string, string> = {},
) =>
  scimJson(
    {
      schemas: [SCIM_SCHEMAS.error],
      status: String(status),
      ...(scimType ? { scimType } : {}),
      detail,
    },
    status,
    headers,
  );

/** Every refused token, whatever the reason: one answer, so a caller learns nothing from it. */
export const scimUnauthorized = () =>
  scimError(401, "A valid SCIM bearer token is required.", undefined, {
    "www-authenticate": "Bearer",
  });

export const scimRateLimited = (retryAfterSeconds: number) =>
  scimError(429, "Too many requests. Wait and try again.", undefined, {
    "retry-after": String(retryAfterSeconds),
  });
