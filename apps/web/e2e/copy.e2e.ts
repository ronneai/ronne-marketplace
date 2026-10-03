import { networkInterfaces } from "node:os";
import { expect, test } from "@playwright/test";

const baseURL: string = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main.baseURL;

/** This machine's first LAN address, if it has one: not localhost, so not a secure context. */
const lanAddress = Object.values(networkInterfaces())
  .flat()
  .find((net) => net && net.family === "IPv4" && !net.internal)?.address;

/**
 * Feature 067: an instance opened over plain http on a LAN address has no clipboard API, and copy
 * used to fail silently there. The sign-in page's `rmk` commands copy anyway.
 */
test("copy works on a page served over plain http on a LAN address", async ({ page }) => {
  test.skip(!lanAddress, "no LAN address on this machine");
  const url = new URL("/sign-in", baseURL);
  url.hostname = lanAddress ?? "";
  await page.goto(url.toString());
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  expect(await page.evaluate(() => "clipboard" in navigator)).toBe(false);

  // The `npm install` command's own button: its name changes to "copied" once it has copied.
  const copy = page.locator("code", { hasText: "npm install" }).locator("..").getByRole("button");
  // The button is in the server's HTML; it copies once the page has hydrated.
  await expect(async () => {
    await copy.click();
    await expect(copy).toHaveText("copied", { timeout: 500 });
  }).toPass();
});
