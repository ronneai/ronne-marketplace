import { expect, test } from "@playwright/test";
import { createDb } from "../src/server/db/create-db";
import { MAIL_KEYS } from "../src/server/domains/mail/models/mail-settings";
import { type FakeSmtp, startFakeSmtp } from "../src/server/domains/mail/testing/smtp-fake";
import {
  DEFAULT_SIGN_UP_POLICY,
  signUpPolicyRows,
} from "../src/server/domains/settings/models/sign-up-policy";
import { kyselySettingsRepository } from "../src/server/domains/settings/repositories/kysely-settings-repository";
import type { Instance } from "./harness";

const instance: Instance = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main;
const EMAIL = `ana.${Date.now()}@signup.acme.com`;
const PASSWORD = "a long sign-up password";

/** The settings this file turns on, and takes away again, as root would on the Email tab. */
const SETTINGS: Record<string, string> = {
  [MAIL_KEYS.transport]: "smtp",
  [MAIL_KEYS.fromAddress]: "marketplace@acme.com",
  [MAIL_KEYS.replyTo]: "it-help@acme.com",
  [MAIL_KEYS.contact]: "it-help@acme.com",
  [MAIL_KEYS.smtpHost]: "127.0.0.1",
  [MAIL_KEYS.smtpPort]: instance.env.RONNE_E2E_SMTP_PORT ?? "",
  [MAIL_KEYS.smtpTls]: "none",
  ...signUpPolicyRows({
    ...DEFAULT_SIGN_UP_POLICY,
    enabled: true,
    domains: ["signup.acme.com"],
    // The real challenge, solved by the browser's worker.
    challenge: true,
  }),
};

type Settings = ReturnType<typeof kyselySettingsRepository>;
const withDb = async (
  work: (repo: Settings, db: ReturnType<typeof createDb>["db"]) => Promise<void>,
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
  await withDb(async (repo) => {
    for (const [key, value] of Object.entries(SETTINGS))
      await repo.set(key, value, null, new Date());
  });
});

test.afterAll(async () => {
  // Back to an instance with neither email nor sign-up, for the files after this one.
  await withDb(async (_repo, db) => {
    await db.deleteFrom("instance_settings").where("key", "in", Object.keys(SETTINGS)).execute();
  });
  await smtp?.close();
});

test("someone signs up with a code by email, then signs in (190)", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  const opened = Date.now();
  await page.getByLabel("Name").fill("Ana Lima");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await expect(page.getByText("Your browser passed the check.")).toBeVisible({ timeout: 10_000 });
  // A person takes at least 3 seconds; the signed stamp says when the form was drawn.
  await page.waitForTimeout(Math.max(0, 3500 - (Date.now() - opened)));
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/sign-up\/code$/);
  await expect(page.getByText(`If ${EMAIL} can be used here`)).toBeVisible();
  // The email, through the outbox and the scheduler to the fake server.
  await expect
    .poll(() => smtp.received.filter((m) => m.to.includes(EMAIL)).length, {
      timeout: 20_000,
    })
    .toBe(1);
  const data = smtp.received.find((m) => m.to.includes(EMAIL))?.data ?? "";
  const code = /\bis (\d{6})\b/.exec(data)?.[1] ?? "";
  expect(code).toMatch(/^\d{6}$/);
  // The six boxes: the first has focus, and the last digit sends the form.
  await page.getByRole("textbox").first().click();
  await page.keyboard.type(code);

  await expect(page).toHaveURL(/\/sign-in\?.*signedUp=ready/);
  await expect(page.getByText("Your account is ready. Sign in.")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
});

test("a bot that fills the hidden field sees the same code page, and gets no email (190)", async ({
  page,
}) => {
  const email = `bot.${Date.now()}@signup.acme.com`;
  await page.goto("/sign-up");
  const opened = Date.now();
  await page.getByLabel("Name").fill("Bot");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  // The field a person never sees, filled as a bot fills every field.
  await page.locator("#website").fill("https://spam.example", { force: true });
  await expect(page.getByText("Your browser passed the check.")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(Math.max(0, 3500 - (Date.now() - opened)));
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/sign-up\/code$/);
  await expect(page.getByText(`If ${email} can be used here`)).toBeVisible();
  await page.getByRole("textbox").first().click();
  await page.keyboard.type("123456");
  await expect(page.getByText("That code isn't right. Try again.")).toBeVisible();
  expect(smtp.received.some((m) => m.to.includes(email))).toBe(false);
});

test("answers 404 while sign-up is off (190)", async ({ page }) => {
  await withDb((repo) => repo.set("sign_up_enabled", "off", null, new Date()));
  try {
    const response = await page.goto("/sign-up");
    expect(response?.status()).toBe(404);
    await page.goto("/sign-in");
    await expect(page.getByRole("link", { name: "Create an account" })).toHaveCount(0);
  } finally {
    await withDb((repo) => repo.set("sign_up_enabled", "on", null, new Date()));
  }
});
