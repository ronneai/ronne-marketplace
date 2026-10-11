import { test } from "@playwright/test";
import { signIn } from "./mobile";
import { moveScopes } from "./move-scope";
import { E2E_MOVE, E2E_USERS } from "./users";

test("an owner asks to move a personal scope, its admin approves, and root moves one at once (115)", async ({
  page,
  browser,
}, testInfo) => {
  const who = E2E_MOVE.projects.chromium;
  const admin = await (await browser.newContext(testInfo.project.use)).newPage();
  const root = await (await browser.newContext(testInfo.project.use)).newPage();
  await signIn(page, E2E_USERS[who.owner]);
  await signIn(admin, E2E_USERS[who.admin]);
  await signIn(root, E2E_USERS[who.root]);
  await moveScopes(page, admin, root, "chromium");
});
