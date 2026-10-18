import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, expect, type Page } from "@playwright/test";
import { createDb } from "../src/server/db/create-db";
import { toDbDate } from "../src/server/db/dates";
import { totpCode } from "../src/server/domains/identity/testing/totp";
import type { Instance } from "./harness";
import { E2E_PASSWORD } from "./users";

// Feature 107 end to end: `rmk login --web` as a real process against the built server, and the
// person in a browser on /device: approve (signing in on the way), deny, a code that expires, and
// an account with two-factor on. Each person signs in once (docs/knowledge/e2e-sign-in-limit.md).

const BIN = fileURLToPath(new URL("../../../packages/cli/dist/bin.js", import.meta.url));
const instance: Instance = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main;
const CODE_LINE = /enter the code\s+([A-Z0-9]{4}-[A-Z0-9]{4})/;

type Rmk = { code: string; done: Promise<{ status: number | null; out: string; err: string }> };

/** `rmk login --web --no-browser` in its own home: the code it printed, and its end. */
export const startRmk = async (home: string, name: string): Promise<Rmk> => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
  };
  delete env.RMK_TOKEN;
  delete env.RMK_REGISTRY;
  const child = spawn(
    process.execPath,
    [BIN, "login", "--web", "--no-browser", "--registry", instance.baseURL, "--name", name],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let out = "";
  let err = "";
  child.stdout.on("data", (chunk) => {
    out += chunk;
  });
  child.stderr.on("data", (chunk) => {
    err += chunk;
  });
  const done = new Promise<{ status: number | null; out: string; err: string }>((resolve) =>
    child.on("close", (status) => resolve({ status, out, err })),
  );
  await expect.poll(() => CODE_LINE.exec(err)?.[1] ?? "", { timeout: 15_000 }).not.toBe("");
  return { code: CODE_LINE.exec(err)?.[1] ?? "", done };
};

export const whoami = (home: string) =>
  execFileSync(process.execPath, [BIN, "whoami"], {
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), RMK_TOKEN: "" },
    encoding: "utf8",
  });

/** Moves a code's expiry into the past, as if its 10 minutes were up. */
const expire = async (userCode: string) => {
  const { db, dialect } = createDb(instance.env.DATABASE_URL ?? "");
  try {
    await db
      .updateTable("device_grants")
      .set({ expires_at: toDbDate(new Date(Date.now() - 1000), dialect) })
      .where("user_code", "=", userCode.replace("-", ""))
      .execute();
  } finally {
    await db.destroy();
  }
};

/** Continue on /device with the code in the input, and check what asked for it. */
export const confirm = async (page: Page, name: string) => {
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(
    page.getByText("Only approve if you just ran rmk login --web yourself"),
  ).toBeVisible();
};

const signInForm = async (page: Page, email: string) => {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
};

export const deviceFlow = async ({
  page,
  browser,
  user,
  twoFactorUser,
}: {
  page: Page;
  browser: Browser;
  user: string;
  twoFactorUser: string;
}) => {
  const homes: string[] = [];
  const home = () => {
    const dir = mkdtempSync(join(tmpdir(), "rmk-e2e-device-"));
    homes.push(dir);
    return dir;
  };
  try {
    // Approve: the link rmk printed sends a signed-out person to sign in and back to the code.
    const approved = home();
    const first = await startRmk(approved, "rmk on e2e-laptop");
    await page.goto(`/device?user_code=${first.code}`);
    await expect(page).toHaveURL(/\/sign-in\?next=/);
    await signInForm(page, user);
    await expect(page).toHaveURL(/\/device\?user_code=/);
    await expect(page.getByLabel("Code")).toHaveValue(first.code);
    await confirm(page, "rmk on e2e-laptop");
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Approved" })).toBeVisible();
    const signedIn = await first.done;
    expect(signedIn.status, signedIn.err).toBe(0);
    expect(signedIn.out).toContain(`as ${user}`);
    expect(whoami(approved)).toContain(user);
    await page.goto("/account/tokens");
    await expect(page.getByText("browser approval")).toBeVisible();

    // Deny: the code typed by hand this time.
    const denied = await startRmk(home(), "rmk on e2e-desk");
    await page.goto("/device");
    await page.getByLabel("Code").fill(denied.code.toLowerCase());
    await confirm(page, "rmk on e2e-desk");
    await page.getByRole("button", { name: "Deny" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Denied" })).toBeVisible();
    const refused = await denied.done;
    expect(refused.status).toBe(1);
    expect(refused.err).toContain("denied in the browser");

    // Expired: rmk stops and says so, and the page says the code isn't valid.
    const late = await startRmk(home(), "rmk on e2e-late");
    await expire(late.code);
    const expired = await late.done;
    expect(expired.status).toBe(1);
    expect(expired.err).toContain("expired before it was approved");
    await page.goto(`/device?user_code=${late.code}`);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("That code isn't valid or has expired.")).toBeVisible();

    // Two-factor on: a password alone makes no token (105), the browser does.
    const context = await browser.newContext();
    const other = await context.newPage();
    let key = "";
    try {
      await other.goto("/sign-in");
      await signInForm(other, twoFactorUser);
      await expect(other).not.toHaveURL(/\/sign-in/);
      await other.goto("/account/security");
      await other.getByLabel("Your password").fill(E2E_PASSWORD);
      await other.getByRole("button", { name: "Set up two-factor" }).click();
      key = (await other.locator("code").first().innerText()).replace(/\s+/g, "");
      await other
        .getByLabel("Code from the app")
        .fill(totpCode(`otpauth://totp/x?secret=${key}`, { step: 0 }));
      await other.getByRole("button", { name: "Turn on" }).click();
      await other.getByRole("button", { name: "I've saved them" }).click();
      await expect(other.getByText("10 backup codes left.")).toBeVisible();

      // A password alone now makes no token.
      const exchange = await other.request.post("/api/v1/auth/token", {
        data: { email: twoFactorUser, password: E2E_PASSWORD },
      });
      expect(exchange.status()).toBe(401);
      expect((await exchange.json()).error.code).toBe("two_factor_required");
    } finally {
      await context.close();
    }

    // Signed out, the code's link goes through the password and the second step, and back.
    const fresh = await browser.newContext();
    const signedOut = await fresh.newPage();
    try {
      const twoFactorHome = home();
      const third = await startRmk(twoFactorHome, "rmk on e2e-2fa");
      await signedOut.goto(`/device?user_code=${third.code}`);
      await signInForm(signedOut, twoFactorUser);
      await expect(signedOut).toHaveURL(/\/sign-in\/two-factor/);
      // The next code: the one that turned it on is used.
      await signedOut
        .getByLabel("Code from your authenticator app")
        .fill(totpCode(`otpauth://totp/x?secret=${key}`, { step: 1 }));
      await signedOut.getByRole("button", { name: "Verify" }).click();
      await expect(signedOut).toHaveURL(/\/device\?user_code=/);
      await confirm(signedOut, "rmk on e2e-2fa");
      await signedOut.getByRole("button", { name: "Approve" }).click();
      await expect(signedOut.getByRole("status").filter({ hasText: "Approved" })).toBeVisible();
      const ok = await third.done;
      expect(ok.status, ok.err).toBe(0);
      expect(whoami(twoFactorHome)).toContain(twoFactorUser);
    } finally {
      await fresh.close();
    }
  } finally {
    for (const dir of homes) rmSync(dir, { recursive: true, force: true });
  }
};
