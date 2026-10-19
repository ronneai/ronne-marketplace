import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { handleScim } from "../../../http/scim-api";
import { recordAudit } from "../../audit/actions/audit";
import { ForbiddenError } from "../exceptions/errors";
import type { AppAuth } from "../repositories/auth-instance";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import { kyselySsoRepository } from "../repositories/kysely-sso-repository";
import { cookieHeaders, createTestUser, testAppAuth } from "../testing/test-auth";
import { createScimLimiters } from "./scim";
import {
  generateScimToken,
  revokeScimToken,
  rotateScimToken,
  scimPanel,
  turnOffScim,
  turnOnScim,
} from "./scim-settings";
import { signIn } from "./session";
import { adminListUsers } from "./user-admin";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
// The provider page's SCIM section and Admin › Users' badges, as root sees them (108).
let t: TestDb;
let app: AppAuth;
let asRoot: Headers;
let asUser: Headers;
const password = "correct horse battery";

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(result.error);
  return cookieHeaders(result.headers.get("set-cookie"));
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t, { baseURL: "https://ronne.example" });
  await createTestUser(app, { email: "root@example.com", password, role: "root" });
  await createTestUser(app, { email: "kim@example.com", password });
  asRoot = await signedIn("root@example.com");
  asUser = await signedIn("kim@example.com");
  const at = toDbDate(new Date(), t.dialect);
  await t.db
    .insertInto("identity_providers")
    .values({
      id: "acme",
      type: "oidc",
      preset: "entra",
      name: "Acme SSO",
      config: "{}",
      secret_enc: null,
      domains: "[]",
      groups_claim: null,
      tested_at: null,
      tested_by: null,
      last_signed_in_at: null,
      last_failure_at: null,
      last_failure_reason: null,
      created_by: null,
      created_at: at,
      updated_at: at,
    })
    .execute();
});
afterEach(() => t.cleanup());

describe("the SCIM section's data", () => {
  it("is off with no token at first, and gives the base URL from PUBLIC_URL", async () => {
    expect(await scimPanel(asRoot, "acme", app)).toEqual({
      enabledAt: null,
      base: "https://ronne.example/api/v1/scim/v2",
      tokens: [],
    });
  });

  it("lists the current token and the one before a rotation, with who made them by email", async () => {
    await turnOnScim(asRoot, "acme", app);
    const first = await generateScimToken(asRoot, "acme", app);
    await rotateScimToken(asRoot, "acme", app);
    const panel = await scimPanel(asRoot, "acme", app);
    expect(panel.enabledAt).not.toBeNull();
    expect(panel.tokens).toHaveLength(2);
    expect(panel.tokens.map((tk) => tk.createdBy)).toEqual([
      "root@example.com",
      "root@example.com",
    ]);
    expect(panel.tokens.filter((tk) => tk.expiresAt === null)).toHaveLength(1);
    // Never the token itself.
    expect(JSON.stringify(panel)).not.toContain(first.token);
    await revokeScimToken(asRoot, "acme", app);
    await turnOffScim(asRoot, "acme", app);
    expect(await scimPanel(asRoot, "acme", app)).toMatchObject({ enabledAt: null, tokens: [] });
  });

  it("is root's alone", async () => {
    await expect(scimPanel(asUser, "acme", app)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(turnOnScim(asUser, "acme", app)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("Admin › Users' SCIM badges", () => {
  const scimCall = (token: string, method: string, path: string, body?: unknown) =>
    handleScim(
      new Request(`https://ronne.example/api/v1/scim/v2${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body ? { "content-type": "application/scim+json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
      app,
      { limiters: createScimLimiters() },
    );

  it("say which provider manages, adopted or deprovisioned each account", async () => {
    await turnOnScim(asRoot, "acme", app);
    const { token } = await generateScimToken(asRoot, "acme", app);
    const user = "urn:ietf:params:scim:schemas:core:2.0:User";
    const ann = await (
      await scimCall(token, "POST", "/Users", {
        schemas: [user],
        userName: "ann@example.com",
        externalId: "a",
      })
    ).json();
    // Kim signs in through acme (106), then SCIM adopts her.
    const kim =
      (await kyselyIdentityRepository(t.db, t.dialect).findUserByEmail("kim@example.com"))?.id ??
      "";
    await kyselySsoRepository(t.db, t.dialect).linkAccount(kim, "acme", "sub-kim", new Date());
    await recordAudit(
      t.db,
      t.dialect,
      {
        actorId: kim,
        action: "auth.sso_signed_in",
        target: { type: "user", id: kim },
        metadata: { provider: "acme" },
      },
      new Date(),
    );
    expect(
      (
        await scimCall(token, "POST", "/Users", {
          schemas: [user],
          userName: "kim@example.com",
          externalId: "k",
        })
      ).status,
    ).toBe(201);
    await scimCall(token, "DELETE", `/Users/${ann.id}`);

    const { users } = await adminListUsers(asRoot, {}, app);
    const by = Object.fromEntries(users.map((u) => [u.email, u.scim ?? null]));
    expect(by["root@example.com"]).toBeNull();
    expect(by["kim@example.com"]).toMatchObject({
      providerName: "Acme SSO",
      managed: true,
      deprovisionedAt: null,
    });
    expect(by["kim@example.com"]?.adoptedAt).toBeInstanceOf(Date);
    expect(by["ann@example.com"]).toMatchObject({
      providerName: "Acme SSO",
      managed: false,
      adoptedAt: null,
    });
    expect(by["ann@example.com"]?.deprovisionedAt).toBeInstanceOf(Date);
  });
});
