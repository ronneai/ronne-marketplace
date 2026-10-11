import { test } from "@playwright/test";
import { signIn } from "./mobile";
import { moveScopes } from "./move-scope";
import { E2E_MOVE, E2E_USERS } from "./users";

test("moving scopes on a phone: asked and approved, and root's at once (115)", async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name as keyof typeof E2E_MOVE.projects;
  const who = E2E_MOVE.projects[project];
  const admin = await (await browser.newContext(testInfo.project.use)).newPage();
  const root = await (await browser.newContext(testInfo.project.use)).newPage();
  await signIn(page, E2E_USERS[who.owner]);
  await signIn(admin, E2E_USERS[who.admin]);
  await signIn(root, E2E_USERS[who.root]);
  await moveScopes(page, admin, root, project);
});
