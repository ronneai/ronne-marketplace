import { type Browser, expect, type Page } from "@playwright/test";
import { openUser } from "./helpers";
import { recordSecret } from "./secrets";
import { E2E_PASSWORD, E2E_WORKSPACE } from "./users";

/**
 * Feature 108 end to end: root adds a provider with a group mapping, turns SCIM on and makes a
 * token; this process then plays the provider's SCIM client (Entra's and Okta's request shapes)
 * against the built server: create, find, patch, group, deactivate, reactivate, delete. The
 * browser shows each step: the badge, the mapped role, the account disabled, the session gone.
 * One test, in order: each step needs the one before.
 */
const USER = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP = "urn:ietf:params:scim:schemas:core:2.0:Group";
const PATCH = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

const instance = () => JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main;

/** A SCIM client with the provider's token: the status and the JSON body (null when none). */
const scimClient =
  (baseURL: string, token: string) => async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${baseURL}/api/v1/scim/v2${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/scim+json",
        ...(body ? { "content-type": "application/scim+json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    return { status: response.status, json: text ? JSON.parse(text) : null };
  };

const signInWithPassword = async (page: Page, email: string, password: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

export const scimFlow = async ({
  page,
  browser,
  baseURL,
  root,
  suffix,
}: {
  page: Page;
  browser: Browser;
  baseURL: string | undefined;
  root: string;
  suffix: string;
}) => {
  if (!baseURL) throw new Error("baseURL is required");
  const ID = `e2e-scim-${suffix}`.slice(0, 32);
  const NAME = `SCIM IdP ${suffix}`;
  const GROUP_NAME = `scim-engineers-${suffix}`;
  const KAI = `kai@${suffix}.scim.e2e.test`;
  const usersRow = async () => {
    await page.goto(`/admin/users?q=${encodeURIComponent(KAI)}`);
    return page.getByRole("row").filter({ hasText: KAI });
  };

  // Root adds a provider with a group mapping, turns SCIM on, and makes a token.
  await signInWithPassword(page, root, E2E_PASSWORD);
  await page.goto("/admin/settings?tab=authentication&provider=new");
  await page.getByRole("link", { name: /^Keycloak/ }).click();
  await page.getByLabel("Provider id").fill(ID);
  await page.getByLabel("Display name").fill(NAME);
  await page.getByLabel("Keycloak address").fill("sso.scim.e2e.test");
  await page.getByLabel("Realm").fill("acme");
  await page.getByLabel("Client ID").fill("ronne");
  await page.getByLabel("Client secret").fill("scim-e2e-client-secret");
  await page.getByRole("button", { name: "Add a group" }).click();
  await page.getByLabel("Group", { exact: true }).fill(GROUP_NAME);
  await page.getByLabel("Workspace", { exact: true }).selectOption({ label: E2E_WORKSPACE });
  await page.getByLabel("Role", { exact: true }).selectOption("moderator");
  await page.getByRole("button", { name: "Add provider" }).click();
  await expect(page).toHaveURL(new RegExp(`provider=${ID}$`));

  await page.getByRole("button", { name: "Turn on SCIM" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Turn on SCIM" }).click();
  await expect(page.getByText(/\/api\/v1\/scim\/v2$/).first()).toBeVisible();
  await page.getByRole("button", { name: "Generate token" }).click();
  const token = (await page.getByText(/^scim_[A-Za-z0-9_-]{43}$/).innerText()).trim();
  recordSecret(instance(), token);
  const scim = scimClient(baseURL, token);

  // Create (Okta's shape), the same request again, and find by userName (both providers do).
  const created = await scim("POST", "/Users", {
    schemas: [USER],
    userName: KAI,
    externalId: `ext-kai-${suffix}`,
    name: { givenName: "Kai", familyName: "Scim" },
    emails: [{ primary: true, value: KAI, type: "work" }],
    active: true,
  });
  expect(created.status).toBe(201);
  const kaiId: string = created.json.id;
  expect((await scim("POST", "/Users", { schemas: [USER], userName: KAI })).status).toBe(409);
  const found = await scim("GET", `/Users?filter=${encodeURIComponent(`userName eq "${KAI}"`)}`);
  expect(found.json).toMatchObject({ totalResults: 1, Resources: [{ id: kaiId }] });

  // Patch the name (Entra's shape).
  const renamed = await scim("PATCH", `/Users/${kaiId}`, {
    schemas: [PATCH],
    Operations: [{ op: "Replace", path: "name.givenName", value: "Kaito" }],
  });
  expect(renamed.status).toBe(200);
  expect(renamed.json.name).toMatchObject({ givenName: "Kaito", familyName: "Scim" });

  // A group with Kai in it: the mapping makes Kai a moderator of the workspace.
  const group = await scim("POST", "/Groups", {
    schemas: [GROUP],
    displayName: GROUP_NAME,
    externalId: `ext-group-${suffix}`,
    members: [{ value: kaiId }],
  });
  expect(group.status).toBe(201);
  let row = await usersRow();
  await expect(row.getByText(`Managed by ${NAME}`)).toBeVisible();
  await expect(row).toContainText(/moderator/);

  // Kai has no password: root gives one, and Kai signs in and makes an access token.
  await openUser(page, KAI);
  await page.getByRole("button", { name: "Reset password" }).click();
  const reset = page.getByRole("dialog");
  // This test is about SCIM, not the first-sign-in change of password (128): Kai goes straight in.
  await reset
    .getByRole("checkbox", { name: "Ask them to choose a new password when they sign in" })
    .uncheck();
  await reset.getByRole("button", { name: "Reset password" }).click();
  await expect(reset.getByText("Shown once")).toBeVisible();
  const password = (await reset.locator("code").nth(1).innerText()).trim();
  recordSecret(instance(), password);
  await reset.getByRole("button", { name: "Done" }).click();

  const kaiContext = await browser.newContext({ baseURL });
  try {
    const kai = await kaiContext.newPage();
    await signInWithPassword(kai, KAI, password);
    await kai.goto("/account/tokens");
    await kai.getByRole("button", { name: "Create token" }).click();
    const create = kai.getByRole("dialog");
    await create.getByLabel("Name").fill("kai laptop");
    await create.getByRole("button", { name: "Create token" }).click();
    await expect(create.getByText("Copy it now")).toBeVisible();
    const rmkToken = (await create.locator("code").first().innerText()).trim();
    await create.getByRole("button", { name: "Done" }).click();
    const me = () =>
      fetch(`${baseURL}/api/v1/me`, { headers: { authorization: `Bearer ${rmkToken}` } });
    expect((await me()).status).toBe(200);

    // Out of the group (both providers' remove by filter): the provider's role goes.
    const removed = await scim("PATCH", `/Groups/${group.json.id}`, {
      schemas: [PATCH],
      Operations: [{ op: "Remove", path: `members[value eq "${kaiId}"]` }],
    });
    expect([200, 204]).toContain(removed.status);
    row = await usersRow();
    await expect(row).not.toContainText(/moderator/);

    // Deactivated (Entra's shape): disabled, the session gone, the token refused, at once.
    const off = await scim("PATCH", `/Users/${kaiId}`, {
      schemas: [PATCH],
      Operations: [{ op: "Replace", path: "active", value: "False" }],
    });
    expect(off.status).toBe(200);
    expect(off.json.active).toBe(false);
    await kai.goto("/catalogue");
    await expect(kai).toHaveURL(/\/sign-in/);
    expect((await me()).status).toBe(401);
    row = await usersRow();
    await expect(row).toContainText("disabled");
    await expect(row.getByText(`Managed by ${NAME}`)).toBeVisible();

    // Reactivated (Okta's shape): enabled; the revoked token stays revoked.
    const on = await scim("PATCH", `/Users/${kaiId}`, {
      schemas: [PATCH],
      Operations: [{ op: "replace", value: { active: true } }],
    });
    expect(on.json.active).toBe(true);
    row = await usersRow();
    await expect(row).toContainText("active");
    expect((await me()).status).toBe(401);
    // Enabled again, but the session deactivation deleted stays gone: only this tells a deleted
    // session from a disabled account (a disabled account's session is refused as well).
    await kai.goto("/catalogue");
    await expect(kai).toHaveURL(/\/sign-in/);
    await signInWithPassword(kai, KAI, password);

    // Deleted: disabled again, signed out, *Deprovisioned by*, and the id is gone from SCIM.
    expect((await scim("DELETE", `/Users/${kaiId}`)).status).toBe(204);
    expect((await scim("GET", `/Users/${kaiId}`)).status).toBe(404);
    await kai.goto("/catalogue");
    await expect(kai).toHaveURL(/\/sign-in/);
    row = await usersRow();
    await expect(row).toContainText("disabled");
    await expect(row.getByText(new RegExp(`Deprovisioned by ${NAME} on`))).toBeVisible();
  } finally {
    await kaiContext.close();
  }

  // Leave the instance as it was: the provider goes, with its SCIM links and tokens.
  await page.goto(`/admin/settings?tab=authentication&provider=${ID}`);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete provider" }).click();
  await expect(page).toHaveURL(/tab=authentication$/);
  expect((await scim("GET", "/Users")).status).toBe(401);
};
