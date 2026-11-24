import { type Browser, expect, type Page, test } from "@playwright/test";
import { createDb } from "../src/server/db/create-db";
import { totpCode } from "../src/server/domains/identity/testing/totp";
import { MAIL_KEYS } from "../src/server/domains/mail/models/mail-settings";
import { type FakeSmtp, startFakeSmtp } from "../src/server/domains/mail/testing/smtp-fake";
import { PASSWORD_RESET_KEYS } from "../src/server/domains/settings/models/password-reset-policy";
import { kyselySettingsRepository } from "../src/server/domains/settings/repositories/kysely-settings-repository";
import type { Instance } from "./harness";
import { E2E_NEW_PASSWORD, E2E_PASSWORD, E2E_USERS } from "./users";

// Feature 194: forgot password by email, end to end, with the codes read from a fake mail server.
const instance: Instance = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main;

/** Email through the fake server, and reset by email on, as root would set them. */
const SETTINGS: Record<string, string> = {
  [MAIL_KEYS.transport]: "smtp",
  [MAIL_KEYS.fromAddress]: "marketplace@acme.com",
  [MAIL_KEYS.replyTo]: "it-help@acme.com",
  [MAIL_KEYS.contact]: "it-help@acme.com",
  [MAIL_KEYS.smtpHost]: "127.0.0.1",
  [MAIL_KEYS.smtpPort]: instance.env.RONNE_E2E_SMTP_PORT ?? "",
  [MAIL_KEYS.smtpTls]: "none",
  [PASSWORD_RESET_KEYS.enabled]: "on",
};

const withSettings = async (
  work: (
    repo: ReturnType<typeof kyselySettingsRepository>,
    db: ReturnType<typeof createDb>["db"],
  ) => Promise<void>,
) => {
  const { db, dialect } = createDb(instance.env.DATABASE_URL ?? "");
  try {
    await work(kyselySettingsRepository(db, dialect), db);
  } finally {
    await db.destroy();
  }
};

let smtp: FakeSmtp;

test.beforeAll(async () => {
  smtp = await startFakeSmtp({ mode: "plain", port: Number(instance.env.RONNE_E2E_SMTP_PORT) });
  await withSettings(async (repo) => {
    for (const [key, value] of Object.entries(SETTINGS))
      await repo.set(key, value, null, new Date());
  });
});

test.afterAll(async () => {
  // Back to an instance with neither email nor reset by email, for the files after this one.
  await withSettings(async (_repo, db) => {
    await db.deleteFrom("instance_settings").where("key", "in", Object.keys(SETTINGS)).execute();
  });
  await smtp?.close();
});

const signIn = async (page: Page, email: string, password: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
};

/** A signed-in browser, kept apart: its session must end with the reset. */
const signedInElsewhere = async (browser: Browser, email: string) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, email, E2E_PASSWORD);
  await expect(page).not.toHaveURL(/\/sign-in/);
  return { context, page };
};

/** *Forgot?* → the request page → the code page, and the code from the email. */
const askForCode = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot?" }).click();
  await expect(page).toHaveURL(/\/sign-in\/forgot$/);
  const opened = Date.now();
  await page.getByLabel("Email").fill(email);
  await expect(page.getByText("Your browser is checked.")).toBeVisible({ timeout: 10_000 });
  // A person takes at least 3 seconds; the signed stamp says when the form was drawn.
  await page.waitForTimeout(Math.max(0, 3500 - (Date.now() - opened)));
  await page.getByRole("button", { name: "Send a code" }).click();
  await expect(page).toHaveURL(/\/sign-in\/forgot\/code$/);
  await expect(
    page.getByText("If an account can reset its password with this address"),
  ).toBeVisible();
  await expect
    .poll(() => smtp.received.filter((m) => m.to.includes(email)).length, { timeout: 20_000 })
    .toBeGreaterThan(0);
  const data = smtp.received.filter((m) => m.to.includes(email)).at(-1)?.data ?? "";
  const code = /\bis (\d{6})\b/.exec(data)?.[1] ?? "";
  expect(code).toMatch(/^\d{6}$/);
  return code;
};

const typeCode = async (page: Page, code: string) => {
  await page.getByRole("textbox").first().click();
  await page.keyboard.type(code);
};

const chooseNewPassword = async (page: Page) => {
  await expect(page).toHaveURL(/\/sign-in\/forgot\/new-password$/);
  await page.getByLabel("New password").fill(E2E_NEW_PASSWORD);
  await page.getByLabel("Type it again").fill(E2E_NEW_PASSWORD);
  await page.getByRole("button", { name: "Save the new password" }).click();
  await expect(page).toHaveURL(/\/sign-in\?reset=done/);
  await expect(page.getByText("Your password is changed. Sign in with it.")).toBeVisible();
};

test("a forgotten password is reset with a code by email; every session ends (194)", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const email = E2E_USERS.resetByEmail;
  const elsewhere = await signedInElsewhere(browser, email);
  try {
    await typeCode(page, await askForCode(page, email));
    await chooseNewPassword(page);
    // Not signed in by the reset: the new password signs in, the old one doesn't.
    await signIn(page, email, E2E_PASSWORD);
    await expect(page.getByText("Email or password is wrong")).toBeVisible();
    await signIn(page, email, E2E_NEW_PASSWORD);
    await expect(page).not.toHaveURL(/\/sign-in/);
    // The other browser's session ended with the reset.
    await elsewhere.page.goto("/account/password");
    await expect(elsewhere.page).toHaveURL(/\/sign-in/);
    // A notice to the address, saying it was reset by email.
    await expect
      .poll(
        () =>
          smtp.received.filter(
            (m) => m.to.includes(email) && m.data.includes("was reset with a code"),
          ).length,
        { timeout: 20_000 },
      )
      .toBe(1);
  } finally {
    await elsewhere.context.close();
  }
});

test("with two-factor on, the reset asks for it after the code (194)", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const email = E2E_USERS.resetTwoFactor;
  // Two-factor turned on, as the person does on Account › Security.
  const { context, page: account } = await signedInElsewhere(browser, email);
  let key = "";
  try {
    await account.goto("/account/security");
    await account.getByLabel("Your password").fill(E2E_PASSWORD);
    await account.getByRole("button", { name: "Set up two-factor" }).click();
    key = (await account.locator("code").first().innerText()).replace(/\s+/g, "");
    await account
      .getByLabel("Code from the app")
      .fill(totpCode(`otpauth://totp/x?secret=${key}`, { step: 0 }));
    await account.getByRole("button", { name: "Turn on" }).click();
    await account.getByRole("button", { name: "I've saved them" }).click();
    await expect(account.getByText("10 backup codes left.")).toBeVisible();

    await typeCode(page, await askForCode(page, email));
    await expect(page).toHaveURL(/\/sign-in\/forgot\/two-factor$/);
    // The next period's code: the one that turned it on is spent.
    await typeCode(page, totpCode(`otpauth://totp/x?secret=${key}`, { step: 1 }));
    await chooseNewPassword(page);
    await signIn(page, email, E2E_NEW_PASSWORD);
    // The password, then sign-in's own second step.
    await expect(page).toHaveURL(/\/sign-in\/two-factor/);
  } finally {
    await context.close();
  }
});
