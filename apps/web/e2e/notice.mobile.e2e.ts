import { expect, type Page, test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";
import { measureOverflow, overflows, smallTargets } from "./sweep";

/**
 * Feature 124 on a phone and a tablet: a long notice wraps instead of stretching the page, the
 * dismiss icon inside the box is a 44px target, and it is in the person's language. Each project's
 * own root sets the notice (only root can) and reads it, then hides it again.
 */
const MESSAGE = `${"unbroken".repeat(30)} and then a sentence with a [status page](https://status.example.com/) that has to wrap on a narrow screen.`;

const setNotice = async (page: Page, shown: boolean) => {
  await page.goto("/admin/settings?tab=notice");
  await page.getByLabel("Message", { exact: true }).fill(MESSAGE);
  await page.getByLabel("Tone").selectOption("warning");
  if (shown) await page.getByLabel("Show the notice").check();
  else await page.getByLabel("Show the notice").uncheck();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Notice saved.")).toBeVisible();
};

test("a long notice wraps, its dismiss icon is a 44px target, and it follows the language", async ({
  page,
  baseURL,
}, testInfo) => {
  await signIn(page, mobileUser(testInfo, "noticeRoot"));
  try {
    await setNotice(page, true);

    await page.goto("/");
    const box = page.getByRole("status").filter({ hasText: "unbroken" });
    await expect(box).toBeVisible();
    await expect(box).toContainText("WARN:");
    const overflow = await measureOverflow(page);
    expect(overflows(overflow), JSON.stringify(overflow)).toBe(false);
    // Under the header, in the flow: not over the page's heading.
    const noticeBox = await box.boundingBox();
    const heading = await page.getByRole("heading", { level: 1 }).boundingBox();
    expect((noticeBox?.y ?? 0) + (noticeBox?.height ?? 0)).toBeLessThanOrEqual(heading?.y ?? 0);
    // The dismiss icon is a 44px tap target (its invisible tap area counts).
    const small = await smallTargets(page);
    expect(
      small.filter((t) => t.element.includes("Dismiss")),
      JSON.stringify(small),
    ).toEqual([]);
    await expect(box.getByRole("button", { name: "Dismiss" })).toBeVisible();
    await expect(box.getByRole("link", { name: "status page" })).toHaveAttribute(
      "href",
      "https://status.example.com/",
    );

    // In Portuguese the icon has its name in Portuguese, and the words are root's own, unchanged.
    await page.context().addCookies([{ name: "ronne-locale", value: "pt", url: baseURL ?? "/" }]);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "pt");
    await expect(box).toContainText("unbroken");
    const pt = await measureOverflow(page);
    expect(overflows(pt), JSON.stringify(pt)).toBe(false);
    await box.getByRole("button", { name: "Dispensar" }).click();
    await expect(page.getByRole("status").filter({ hasText: "unbroken" })).toHaveCount(0);
  } finally {
    await page.context().addCookies([{ name: "ronne-locale", value: "en", url: baseURL ?? "/" }]);
    await setNotice(page, false);
  }
});
