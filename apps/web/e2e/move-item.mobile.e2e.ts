import { test } from "@playwright/test";
import { signIn } from "./mobile";
import { moveItemDialogFits } from "./move-item";
import { E2E_ITEM_MOVE, E2E_USERS } from "./users";

test("the Move dialog on a phone: asking and confirming fit the screen (134)", async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name as keyof typeof E2E_ITEM_MOVE.projects;
  const who = E2E_ITEM_MOVE.projects[project];
  const moderator = await (await browser.newContext(testInfo.project.use)).newPage();
  await signIn(page, E2E_USERS[who.member]);
  await signIn(moderator, E2E_USERS[who.moderator]);
  await moveItemDialogFits(page, moderator, project);
  // Closed when done: an open context keeps running, and WebKit slows (e2e-open-contexts.md).
  await moderator.context().close();
});
