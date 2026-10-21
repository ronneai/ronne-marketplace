import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

/**
 * Feature 124: root sets the instance notice, a member sees it on every page, dismisses it (with
 * and without JavaScript), and sees it again when root changes it. Root and the member each sign
 * in once, as their own users (the sign-in limit, docs/knowledge/e2e-sign-in-limit.md); the notice
 * is hidden again at the end so the other tests' pages are as they were.
 */
type Session = Awaited<ReturnType<BrowserContext["storageState"]>>;
let root: Session;
let member: Session;
/** The member's browser, kept across the tests: the dismiss cookie lives in it. */
let memberBrowser: BrowserContext;

const WARNING = "The demo's data is reset on Friday.";
const MAINTENANCE = "Maintenance tonight at 22:00.";

const signInAs = async (browser: Browser, baseURL: string | undefined, email: string) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  const state = await context.storageState();
  await context.close();
  return state;
};

const browserOf = (
  browser: Browser,
  baseURL: string | undefined,
  state: Session,
  javaScriptEnabled = true,
) => browser.newContext({ baseURL, storageState: state, javaScriptEnabled });

type Values = { message: string; tone?: "info" | "warning"; shown?: boolean };

/** Fills the Notice tab and saves; `shown: false` hides it, keeping the text. */
const save = async (page: Page, values: Values) => {
  await page.goto("/admin/settings?tab=notice");
  await page.getByLabel("Message", { exact: true }).fill(values.message);
  await page.getByLabel("Tone").selectOption(values.tone ?? "info");
  const shown = page.getByLabel("Show the notice");
  if (values.shown === false) await shown.uncheck();
  else await shown.check();
  await page.getByRole("button", { name: "Save" }).click();
};

const banner = (page: Page, text: string) => page.getByRole("status").filter({ hasText: text });

test.describe
  .serial("the instance notice", () => {
    test.beforeAll(async ({ browser, baseURL }) => {
      root = await signInAs(browser, baseURL, E2E_USERS.noticeRoot);
      member = await signInAs(browser, baseURL, E2E_USERS.noticeMember);
      memberBrowser = await browserOf(browser, baseURL, member);
    });

    test.afterAll(async ({ browser, baseURL }) => {
      await memberBrowser.close();
      // Whatever happened, hide it: the other tests' pages mustn't carry it.
      const context = await browserOf(browser, baseURL, root);
      const page = await context.newPage();
      await page.goto("/admin/settings?tab=notice");
      const shown = page.getByLabel("Show the notice");
      if (await shown.isChecked()) {
        await shown.uncheck();
        await page.getByRole("button", { name: "Save" }).click();
        await expect(page.getByText("Notice saved.")).toBeVisible();
      }
      await context.close();
    });

    test("refuses a bad link beside its field and saves nothing", async ({ browser, baseURL }) => {
      const context = await browserOf(browser, baseURL, root);
      const page = await context.newPage();
      await save(page, { message: "This must not be saved. [Click](javascript:alert)" });
      await expect(
        page.getByText("Use an address that starts with https:// or a single /, with no spaces"),
      ).toBeVisible();
      await expect(page.getByLabel("Message", { exact: true })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      const seen = await memberBrowser.newPage();
      await seen.goto("/");
      await expect(banner(seen, "This must not be saved.")).toHaveCount(0);
      await seen.close();
      await context.close();
    });

    test("root sets a Warning notice; a member sees it on every page, as text", async ({
      browser,
      baseURL,
    }) => {
      const context = await browserOf(browser, baseURL, root);
      const page = await context.newPage();
      await save(page, {
        message: `${WARNING} <b>not bold</b> See the [catalogue](/catalogue).`,
        tone: "warning",
      });
      // The preview draws the link inside the sentence while it is being edited.
      await expect(
        page.getByRole("region", { name: "Preview" }).getByRole("link", { name: "catalogue" }),
      ).toBeVisible();
      await expect(page.getByText("Notice saved.")).toBeVisible();
      await expect(page.getByText("Last changed by Notice Root")).toBeVisible();

      const seen = await memberBrowser.newPage();
      for (const path of ["/", "/catalogue", "/account/password"]) {
        await seen.goto(path);
        const box = banner(seen, WARNING);
        await expect(box, path).toBeVisible();
        await expect(box).toContainText("WARN:");
        // The tag is shown as typed, not drawn.
        await expect(box).toContainText("<b>not bold</b>");
        await expect(box.locator("b")).toHaveCount(0);
        await expect(box.getByRole("link", { name: "catalogue" })).toHaveAttribute(
          "href",
          "/catalogue",
        );
      }
      await seen.close();

      // It is not on the sign-in page.
      const signedOut = await browser.newContext({ baseURL });
      const out = await signedOut.newPage();
      await out.goto("/sign-in");
      await expect(out.getByLabel("Email")).toBeVisible();
      await expect(banner(out, WARNING)).toHaveCount(0);
      await signedOut.close();
      await context.close();
    });

    test("a member dismisses it with the icon in the box; it stays gone in that browser only", async ({
      browser,
      baseURL,
    }) => {
      const page = await memberBrowser.newPage();
      await page.goto("/");
      // Inside the box, an icon with a name, not a button beside it.
      await banner(page, WARNING).getByRole("button", { name: "Dismiss" }).click();
      await expect(banner(page, WARNING)).toHaveCount(0);
      for (const path of ["/", "/catalogue"]) {
        await page.goto(path);
        await expect(banner(page, WARNING), path).toHaveCount(0);
      }
      await page.close();

      // Another browser, the same person, still has it.
      const other = await browserOf(browser, baseURL, member);
      const otherPage = await other.newPage();
      await otherPage.goto("/");
      await expect(banner(otherPage, WARNING)).toBeVisible();
      await other.close();
    });

    test("root changes it, and it comes back in the browser that dismissed the old one", async ({
      browser,
      baseURL,
    }) => {
      const context = await browserOf(browser, baseURL, root);
      const page = await context.newPage();
      await save(page, { message: MAINTENANCE, tone: "info" });
      await expect(page.getByText("Notice saved.")).toBeVisible();
      await context.close();

      const seen = await memberBrowser.newPage();
      await seen.goto("/");
      const box = banner(seen, MAINTENANCE);
      await expect(box).toBeVisible();
      await expect(box).toContainText("INFO:");
      await expect(banner(seen, WARNING)).toHaveCount(0);
      await seen.close();
    });

    test("dismisses without JavaScript: the form posts and the same page comes back without it", async ({
      browser,
      baseURL,
    }) => {
      const context = await browserOf(browser, baseURL, member, false);
      const page = await context.newPage();
      await page.goto("/catalogue");
      await banner(page, MAINTENANCE).getByRole("button", { name: "Dismiss" }).click();
      await expect(page).toHaveURL(/\/catalogue$/);
      await expect(banner(page, MAINTENANCE)).toHaveCount(0);
      await page.reload();
      await expect(banner(page, MAINTENANCE)).toHaveCount(0);
      await context.close();
    });

    test("hiding it keeps the text, and it is gone for everyone while hidden", async ({
      browser,
      baseURL,
    }) => {
      const context = await browserOf(browser, baseURL, root);
      const page = await context.newPage();
      await save(page, { message: MAINTENANCE, tone: "info", shown: false });
      await expect(page.getByText("Notice saved.")).toBeVisible();
      await page.goto("/admin/settings?tab=notice");
      await expect(page.getByLabel("Message", { exact: true })).toHaveValue(MAINTENANCE);
      await expect(page.getByLabel("Show the notice")).not.toBeChecked();
      await context.close();

      // A browser that never dismissed it sees nothing while it is hidden.
      const other = await browserOf(browser, baseURL, member);
      const otherPage = await other.newPage();
      await otherPage.goto("/");
      await expect(banner(otherPage, MAINTENANCE)).toHaveCount(0);
      await other.close();
    });

    test("only root has the tab", async ({ browser, baseURL }) => {
      const context = await browserOf(browser, baseURL, member);
      const page = await context.newPage();
      const response = await page.goto("/admin/settings?tab=notice");
      expect(response?.status()).toBe(404);
      await context.close();
    });
  });
