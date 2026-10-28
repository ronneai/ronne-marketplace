import { test } from "@playwright/test";
import { signIn } from "./mobile";
import { moveItemEndToEnd } from "./move-item";
import { E2E_ITEM_MOVE, E2E_USERS } from "./users";

test("moving an item: asked by a member, approved by a moderator, installed by both names, and moved back at once (134)", async ({
  page,
  browser,
  request,
}) => {
  const who = E2E_ITEM_MOVE.projects.chromium;
  const moderator = await (await browser.newContext()).newPage();
  await signIn(page, E2E_USERS[who.member]);
  await signIn(moderator, E2E_USERS[who.moderator]);
  await moveItemEndToEnd(page, moderator, "chromium", request);
  // Closed when done: an open context keeps running (e2e-open-contexts.md).
  await moderator.context().close();
});
