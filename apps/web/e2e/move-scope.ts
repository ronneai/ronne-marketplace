import { expect, type Locator, type Page } from "@playwright/test";
import { describeOverflow, measureOverflow, overflows } from "./sweep";
import { E2E_MOVE } from "./users";

/**
 * The phone sweep's check (065) on the page as it is, at its own width and at 360px and 320px:
 * nothing scrolls sideways or sticks out.
 */
export const fits = async (page: Page, what: string) => {
  const size = page.viewportSize() ?? { width: 412, height: 915 };
  for (const width of [size.width, 360, 320]) {
    await page.setViewportSize({ width, height: size.height });
    const overflow = await measureOverflow(page);
    expect(overflows(overflow), `${what} at ${width}px: ${describeOverflow(overflow)}`).toBe(false);
  }
  await page.setViewportSize(size);
};

/**
 * Nothing in a dialog scrolls sideways (115): the sweep leaves what's inside a scrolling box to
 * the box, so the dialog's own body is checked here. Its buttons stay in view.
 */
export const noSideScroll = async (page: Page, dialog: Locator, what: string) => {
  const size = page.viewportSize() ?? { width: 412, height: 915 };
  for (const width of [size.width, 360, 320]) {
    await page.setViewportSize({ width, height: size.height });
    // Polled: WebKit can measure mid-layout just after a resize; a real overflow stays.
    await expect
      .poll(
        () =>
          dialog.evaluate((el) =>
            [el, ...el.querySelectorAll("*")]
              .filter(
                (node) =>
                  // A screen-reader-only label is 1px wide on purpose.
                  node.clientWidth > 1 &&
                  node.scrollWidth > node.clientWidth + 1 &&
                  getComputedStyle(node).overflowX !== "visible",
              )
              .map(
                (node) =>
                  `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 60)} ${node.scrollWidth}>${node.clientWidth}`,
              ),
          ),
        { message: `${what} at ${width}px`, timeout: 2000 },
      )
      .toEqual([]);
  }
  await page.setViewportSize(size);
};

/**
 * Feature 115, on every screen. The owner asks to move a scope out of their personal workspace into
 * a team workspace, and its admin approves it from the Requests page. Then root moves a scope out
 * of `global` directly: Enter goes to the confirmation, not past it, and the second confirmation
 * takes the scope's name typed. The signed-in pages are the owner's, the admin's and root's.
 */
export const moveScopes = async (
  owner: Page,
  admin: Page,
  root: Page,
  project: keyof typeof E2E_MOVE.projects,
) => {
  const team = E2E_MOVE.team(project);
  const personal = E2E_MOVE.personal(E2E_MOVE.projects[project].owner);
  const scope = E2E_MOVE.personalScope;

  // The owner asks: they don't run the team, so it's a request with a message.
  await owner.goto(`/workspaces/${personal}`);
  await owner.getByRole("button", { name: `Move @${scope}`, exact: true }).click();
  const ask = owner.getByRole("dialog", { name: `Move @${scope}` });
  await ask.getByLabel("Where to").selectOption(team);
  await expect(ask.getByText(`${team}’s admins or root will answer.`)).toBeVisible();
  await expect(ask.getByText("Who will see them:")).toBeVisible();
  await ask.getByLabel("Message (optional)").fill("Our team runs these now.");
  await fits(owner, "the Move dialog");
  await noSideScroll(owner, ask, "the Move dialog");
  await ask.getByRole("button", { name: "Ask to move" }).click();
  await expect(ask.getByText(`Asked to move @${scope} to ${team}.`)).toBeVisible();
  await ask.getByRole("button", { name: "Done" }).click();
  await expect(owner.getByText(`Moving to ${team}`)).toBeVisible();

  // The team's admin approves it from the Requests page, which the nav counts.
  await admin.goto("/workspaces/requests");
  const moves = admin.getByRole("region", { name: "Scope moves" });
  await expect(moves.getByText("Our team runs these now.")).toBeVisible();
  await fits(admin, "the Scope moves table");
  await moves
    .getByRole("button", { name: `Approve moving @${personal}/${scope} to ${team}` })
    .click();
  await expect(moves.getByText("No moves waiting.")).toBeVisible();
  // It's the team's now, under its new name.
  await admin.goto(`/workspaces/${team}`);
  await expect(admin.getByRole("cell", { name: `@${scope}`, exact: true })).toBeVisible();

  // Root moves a scope out of global at once: two confirmations, the second typed.
  const rootScope = E2E_MOVE.rootScope(project);
  await root.goto(`/workspaces/global?q=${rootScope}`);
  const moveButton = root.getByRole("button", { name: `Move @${rootScope}`, exact: true });
  await moveButton.click();
  const move = root.getByRole("dialog", { name: `Move @${rootScope}` });
  await move.getByLabel("Where to").selectOption(team);
  await expect(move.getByRole("button", { name: "Move scope" })).toBeEnabled();
  // Enter in the name field goes to the confirmation, never past it.
  await move.getByLabel("Its name there").press("Enter");
  await expect(
    move.getByText(`Move @${rootScope} and its 0 items to ${team}, as @${team}/${rootScope}?`),
  ).toBeVisible();
  await fits(root, "the move's confirmation");
  await noSideScroll(root, move, "the move's confirmation");
  await move.getByRole("button", { name: "Continue" }).click();
  const typed = move.getByLabel("Scope name");
  await expect(move.getByRole("button", { name: "Move scope" })).toBeDisabled();
  await noSideScroll(root, move, "the typed confirmation");
  await typed.fill(rootScope);
  await move.getByRole("button", { name: "Move scope" }).click();
  await expect(move.getByText(`Moved @${rootScope} to ${team}.`)).toBeVisible();
  await noSideScroll(root, move, "the move's result");
  await move.getByRole("button", { name: "Done" }).click();
  // Closing refreshes the page: the scope has left global.
  await expect(move).toBeHidden();
  await expect(moveButton).toHaveCount(0);
  await root.goto(`/workspaces/${team}`);
  await expect(root.getByRole("cell", { name: `@${rootScope}`, exact: true })).toBeVisible();
};
