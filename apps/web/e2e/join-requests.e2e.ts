import { expect, test } from "@playwright/test";
import { approveRequest, askToJoin, seeJoined } from "./join-requests";
import { signIn } from "./mobile";
import { E2E_USERS } from "./users";

/**
 * Asking to join a workspace (094): a user asks from the Workspaces page; the workspace's moderator
 * sees the count next to Requests, opens it and approves; the user is then in it.
 */
test("a user asks to join a workspace and its moderator approves (094)", async ({ browser }) => {
  const message = "I build the e2e skills.";
  const asker = await (await browser.newContext()).newPage();
  await signIn(asker, E2E_USERS.joinAsker);
  await askToJoin(asker, message);

  const moderator = await (await browser.newContext()).newPage();
  await signIn(moderator, E2E_USERS.joinModerator);
  await moderator.goto("/");
  const nav = moderator.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: /Requests/ })).toContainText(/\d/);
  await approveRequest(moderator, E2E_USERS.joinAsker, message);

  await seeJoined(asker);
});
