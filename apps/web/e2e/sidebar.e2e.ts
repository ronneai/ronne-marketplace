import { expect, test } from "@playwright/test";
import { headerName, sidebar } from "./helpers";
import { E2E_NAMES, E2E_PASSWORD, E2E_USERS } from "./users";

/**
 * Feature 119: from `lg` the navigation is a sidebar. It folds into a rail of named icons, and stays
 * folded across a reload; the workspace switcher opens a workspace's page.
 */
test("the sidebar folds and stays folded; the switcher opens a workspace", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.sidebar);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(headerName(page, E2E_NAMES.sidebar)).toBeVisible();

  const aside = sidebar(page);
  const nav = aside.getByRole("navigation", { name: "Main" });
  // The header is the top bar from lg (139): over the content, never over the sidebar, with the
  // bell, and without the logo and the Menu that the sidebar replaces.
  const bar = page.getByRole("banner");
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("button", { name: /^Notifications/ })).toBeVisible();
  await expect(bar.getByRole("button", { name: /^Menu/ })).toBeHidden();
  await expect(bar.getByRole("link", { name: "Ronne AI" })).toBeHidden();
  const [barBox, asideBox] = [await bar.boundingBox(), await aside.boundingBox()];
  expect(barBox?.x).toBeGreaterThanOrEqual((asideBox?.x ?? 0) + (asideBox?.width ?? 0) - 1);
  // The fold button sticks out of the sidebar, half over the page where the bar is: it must be the
  // top element there, not hidden under the bar (owner, 2026-10-31).
  const foldOnTop = () =>
    aside.getByRole("button", { name: /fold the sidebar/i }).evaluate((button) => {
      const box = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(box.right - 2, box.top + box.height / 2));
    });
  expect(await foldOnTop()).toBe(true);
  await expect(aside.getByText("Discover", { exact: true })).toBeVisible();
  await expect(aside.getByRole("link", { name: "Propose item" })).toHaveAttribute(
    "href",
    "/submissions/new",
  );

  // The logo is one picture in both states: folding wipes its wordmark away and slides its mark to
  // the middle of the rail (centred on x=32, the rail's middle), instead of swapping it for another.
  const markCentre = () =>
    aside
      .locator("a[aria-label=Home]")
      .first()
      .locator("svg")
      .evaluate((svg) => {
        const boxes = [...svg.querySelectorAll("path")].map((path) => path.getBoundingClientRect());
        return (Math.min(...boxes.map((b) => b.left)) + Math.max(...boxes.map((b) => b.right))) / 2;
      });

  // Neither state scrolls sideways (a faded label that still took room once made the rail scroll):
  // the nav and the other blocks under the logo fit their width, and so does the page. (The logo's
  // row is left out: the fold button sticks out of it on purpose, half over the page.)
  const scrollsSideways = () =>
    aside.evaluate((el) => {
      const blocks = [...el.children].slice(1) as HTMLElement[];
      return [
        ...blocks.map((box) => box.scrollWidth - box.clientWidth),
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ];
    });
  const fits = (widths: number[]) => widths.every((w) => w <= 0);
  expect(fits(await scrollsSideways())).toBe(true);

  // Folding and unfolding are animated: the width passes through values between the two, then the
  // rail's content replaces the full one (and with reduced motion nothing is in between).
  const widths = () =>
    aside.evaluate(
      (el) =>
        new Promise<number[]>((resolve) => {
          const seen: number[] = [];
          const start = performance.now();
          const tick = () => {
            seen.push(Math.round(el.getBoundingClientRect().width));
            if (performance.now() - start < 450) requestAnimationFrame(tick);
            else resolve(seen);
          };
          requestAnimationFrame(tick);
        }),
    );
  const fold = aside.getByRole("button", { name: "Fold the sidebar" });
  const [folding] = await Promise.all([widths(), fold.click()]);
  expect(
    folding.some((w) => w > 80 && w < 240),
    `widths ${folding}`,
  ).toBe(true);
  expect(folding.at(-1)).toBe(64);
  await expect.poll(async () => fits(await scrollsSideways())).toBe(true);

  // The rail names every icon, and the next page renders folded.
  const unfold = aside.getByRole("button", { name: "Unfold the sidebar" });
  await expect(unfold).toHaveAttribute("aria-expanded", "false");
  await expect(aside.getByText("Discover", { exact: true })).toBeHidden();
  await expect.poll(markCentre).toBeGreaterThan(31);
  expect(await markCentre()).toBeLessThan(33);
  await expect(aside.locator("a[aria-label=Home]").first().locator("svg")).toHaveCSS(
    "clip-path",
    /inset/,
  );
  await expect(nav.getByRole("link", { name: "Catalogue", exact: true })).toBeVisible();
  expect((await aside.boundingBox())?.width ?? 0).toBeLessThanOrEqual(65);
  const [unfolding] = await Promise.all([widths(), unfold.click()]);
  expect(
    unfolding.some((w) => w > 80 && w < 240),
    `widths ${unfolding}`,
  ).toBe(true);
  expect(unfolding.at(-1)).toBe(256);
  await expect(aside.getByText("Discover", { exact: true })).toBeVisible();
  // Reduced motion: no animation, the content swaps at once.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const [instant] = await Promise.all([widths(), fold.click()]);
  expect(
    instant.every((w) => w === 64 || w === 256),
    `widths ${instant}`,
  ).toBe(true);
  await expect(unfold).toBeVisible();
  await unfold.click();
  await expect(fold).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await fold.click();
  await page.reload();
  await expect(unfold).toBeVisible();
  await nav.getByRole("link", { name: "Catalogue", exact: true }).click();
  await expect(page).toHaveURL(/\/catalogue$/);
  await expect(unfold).toBeVisible();
  await unfold.click();
  await expect(aside.getByRole("button", { name: "Fold the sidebar" })).toBeVisible();

  // The switcher (120): All workspaces at first; choosing their personal workspace makes it the
  // current one and stays on the page; each row also opens its workspace's page.
  const switcher = aside.locator("details").first();
  const summary = switcher.locator("summary");
  await expect(summary).toContainText("All workspaces");
  await summary.click();
  const personal = switcher.getByRole("link").filter({ hasText: "personal" });
  await personal.click();
  await expect(page).toHaveURL(/\/catalogue(\?|$)/);
  await expect(summary).toContainText("Personal workspace");
  const name = (await summary.locator("span span").first().textContent()) ?? "";
  await summary.click();
  await expect(personal).toHaveAttribute("aria-current", "true");
  await switcher.getByRole("link", { name: `Open ${name}'s page` }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${name}$`));
  await expect(nav.getByRole("link", { name: "Workspaces", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // All workspaces again, then Manage workspaces opens the list.
  await summary.click();
  await switcher.getByRole("link", { name: "All workspaces" }).click();
  await expect(summary).toContainText("All workspaces");
  await summary.click();
  await switcher.getByRole("link", { name: "Manage workspaces" }).click();
  await expect(page).toHaveURL(/\/workspaces$/);
});
