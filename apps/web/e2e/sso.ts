import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type Browser, expect, type Page } from "@playwright/test";
import {
  type FakeOidc,
  startFakeOidc,
} from "../src/server/domains/identity/testing/fake-oidc-server";
import { confirm, startRmk, whoami } from "./device";
import type { Instance } from "./harness";
import { E2E_PASSWORD, E2E_WORKSPACE } from "./users";

/**
 * Feature 106 end to end, with a fake OpenID Connect provider on 127.0.0.1: root adds a provider
 * from a preset, tests it and turns it on; a new person signs in with it and is created, and a
 * group gives them a role; root chooses Root only; `disable-sso` gives everyone their password
 * back. Each project brings its own root and member: root's sign-ins in a run are spent
 * (e2e-sign-in-limit.md). One test, in order: each step needs the one before.
 */
const signInWithPassword = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
};

/** Runs the real `disable-sso --yes` against the instance under test; returns what it printed. */
const disableSso = () => {
  const instance: { main: Instance } = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}");
  return execFileSync("pnpm", ["exec", "tsx", "scripts/disable-sso.ts", "--yes"], {
    cwd: resolve(import.meta.dirname, ".."),
    env: { ...process.env, ...instance.main.env },
    encoding: "utf8",
  });
};

/** A fresh, signed-out browser. */
const signedOut = async (browser: Browser, baseURL: string | undefined) => {
  const context = await browser.newContext({ baseURL });
  return { context, page: await context.newPage() };
};

/**
 * The whole flow for one project: `root` sets it up, a new person (`ann@<suffix>.e2e.test`) signs
 * in with it, `member` is refused a password under Root only and gets it back after disable-sso.
 */
export const ssoFlow = async ({
  page,
  browser,
  baseURL,
  root,
  member,
  suffix,
}: {
  page: Page;
  browser: Browser;
  baseURL: string | undefined;
  root: string;
  member: string;
  suffix: string;
}) => {
  const ID = `e2e-fake-${suffix}`.slice(0, 32);
  const NAME = `Fake SSO ${suffix}`;
  const ANN = `ann@${suffix}.e2e.test`;
  const fake: FakeOidc = await startFakeOidc({
    user: {
      sub: `sub-ann-${suffix}`,
      email: ANN,
      emailVerified: true,
      name: "Ann SSO",
      groups: ["e2e-sso-team"],
    },
  });
  let cleanUp = false;
  try {
    await signInWithPassword(page, root);
    await expect(page).not.toHaveURL(/\/sign-in/);

    // Add it from a preset: the card fills the form, the steps start with the redirect URI.
    await page.goto("/admin/settings?tab=authentication");
    await page.getByRole("link", { name: "Add provider" }).click();
    await page.getByRole("link", { name: /^Other OpenID Connect/ }).click();
    await page.getByLabel("Provider id").fill(ID);
    await expect(page.getByText(`/api/auth/sso/callback/${ID}`).first()).toBeVisible();
    await page.getByLabel("Display name").fill(NAME);
    await page.getByLabel("Issuer URL").fill(fake.issuer);
    await page.getByLabel("Client ID").fill(fake.clientId);
    await page.getByLabel("Client secret").fill(fake.clientSecret);
    await page.getByLabel("Email domains this provider signs in").fill(`${suffix}.e2e.test`);
    await page.getByRole("button", { name: "Add a group" }).click();
    await page.getByLabel("Group", { exact: true }).fill("e2e-sso-team");
    await page.getByLabel("Workspace", { exact: true }).selectOption({ label: E2E_WORKSPACE });
    await page.getByLabel("Role", { exact: true }).selectOption("moderator");
    await page.getByRole("button", { name: "Add provider" }).click();
    await expect(page).toHaveURL(new RegExp(`provider=${ID}$`));
    await expect(page.getByText("Secret saved")).toBeVisible();

    // Can't turn on before the test; Test connection, then Test sign-in in a new tab.
    await expect(page.getByRole("button", { name: "Turn on", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByText("The connection works.")).toBeVisible();
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("button", { name: "Test sign-in" }).click(),
    ]);
    await expect(popup).toHaveURL(new RegExp(`provider=${ID}&test=done`));
    await expect(popup.getByText("Your Test sign-in passed.")).toBeVisible();
    await expect(popup.getByText(`Create the account ${ANN}`)).toBeVisible();
    await expect(popup.getByText(`join ${E2E_WORKSPACE} as moderator`)).toBeVisible();
    await popup.close();
    // The test changed nothing: no account for Ann yet.
    await page.goto(`/admin/users?search=${encodeURIComponent(ANN)}`);
    await expect(page.getByText(ANN)).toHaveCount(0);

    await page.goto(`/admin/settings?tab=authentication&provider=${ID}`);
    await page.getByRole("button", { name: "Turn on", exact: true }).click();
    await expect(page.getByRole("button", { name: "Turn off", exact: true })).toBeVisible();

    // A new person signs in with it: created, and the group gives them moderator in the workspace.
    const ann = await signedOut(browser, baseURL);
    await ann.page.goto("/sign-in?next=/catalogue");
    await ann.page.getByRole("button", { name: `Continue with ${NAME}` }).click();
    // The path itself: the sign-in page's own address (`?next=/catalogue`) ends the same way.
    await expect(ann.page).toHaveURL((url) => url.pathname === "/catalogue");
    await ann.context.close();

    // Ann has no password here: she signs rmk in by approving its code, through the provider (107).
    const rmkHome = mkdtempSync(join(tmpdir(), "rmk-e2e-sso-"));
    try {
      const rmk = await startRmk(rmkHome, `rmk on ${suffix}`);
      const annAgain = await signedOut(browser, baseURL);
      await annAgain.page.goto(`/device?user_code=${rmk.code}`);
      await annAgain.page.getByRole("button", { name: `Continue with ${NAME}` }).click();
      await expect(annAgain.page).toHaveURL(/\/device\?user_code=/);
      await confirm(annAgain.page, `rmk on ${suffix}`);
      await annAgain.page.getByRole("button", { name: "Approve" }).click();
      await expect(annAgain.page.getByRole("status").filter({ hasText: "Approved" })).toBeVisible();
      const done = await rmk.done;
      expect(done.status, done.err).toBe(0);
      expect(whoami(rmkHome)).toContain(ANN);
      await annAgain.context.close();
    } finally {
      rmSync(rmkHome, { recursive: true, force: true });
    }
    await page.goto(`/admin/users?search=${encodeURIComponent(ANN)}`);
    const annRow = page.getByRole("row", { name: new RegExp(ANN) });
    await expect(annRow).toBeVisible();
    await expect(annRow.getByText(/moderator/)).toBeVisible();

    // Root only: everyone else signs in with the provider; root keeps the password.
    await page.goto("/admin/settings?tab=authentication");
    await page.getByRole("radio", { name: /Root only/ }).check();
    await page
      .getByRole("checkbox", { name: /lose their password sign-in|loses their password sign-in/ })
      .check();
    // From here a failure must undo it, even one between saving and the message.
    cleanUp = true;
    await page
      .getByRole("form", { name: "Password sign-in" })
      .getByRole("button", { name: "Save" })
      .click();
    await expect(page.getByText("Password sign-in saved.")).toBeVisible();

    const refused = await signedOut(browser, baseURL);
    await refused.page.goto("/sign-in");
    await expect(refused.page.getByRole("button", { name: `Continue with ${NAME}` })).toBeVisible();
    await refused.page.getByText("Use your password (root)").click();
    await refused.page.getByLabel("Email").fill(member);
    await refused.page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await refused.page.getByRole("button", { name: "Sign in" }).click();
    await expect(refused.page.getByText("Email or password is wrong")).toBeVisible();

    // disable-sso, from the terminal: the provider off, everyone's password back.
    const output = disableSso();
    cleanUp = false;
    // Every provider that's on, this one among them.
    expect(output).toMatch(new RegExp(`Turned off \\d+ identity providers?: .*\\b${ID}\\b`));
    expect(output).toContain("Everyone may sign in with a password again");

    await refused.page.goto("/sign-in");
    await expect(refused.page.getByRole("button", { name: `Continue with ${NAME}` })).toHaveCount(
      0,
    );
    await refused.page.getByLabel("Email").fill(member);
    await refused.page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await refused.page.getByRole("button", { name: "Sign in" }).click();
    await expect(refused.page).not.toHaveURL(/\/sign-in/);
    await refused.context.close();
  } finally {
    // A failure under Root only would leave it on for every later test on the shared instance.
    if (cleanUp) disableSso();
    await fake.close();
  }
};
