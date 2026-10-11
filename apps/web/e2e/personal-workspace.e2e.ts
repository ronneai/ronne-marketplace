import { test } from "@playwright/test";
import { signIn } from "./mobile";
import { releaseInPersonal } from "./personal-workspace";
import { E2E_PERSONAL, E2E_USERS } from "./users";

test("a user releases an item in their personal workspace, which nobody else sees (114)", async ({
  page,
  browser,
}, testInfo) => {
  const { owner, outsider } = E2E_PERSONAL.projects.chromium;
  await signIn(page, E2E_USERS[owner]);
  const other = await (await browser.newContext(testInfo.project.use)).newPage();
  await signIn(other, E2E_USERS[outsider]);
  await releaseInPersonal(page, other, E2E_PERSONAL.workspace(owner));
});
