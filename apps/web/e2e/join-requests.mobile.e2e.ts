import { test } from "@playwright/test";
import { approveRequest, askToJoin, seeJoined } from "./join-requests";
import { mobileUser, signIn } from "./mobile";

/** Asking to join a workspace and approving it on a phone or a tablet (094). */
test("a user asks to join a workspace and its moderator approves (094)", async ({
  browser,
  page,
}, testInfo) => {
  const message = `I build the e2e skills on ${testInfo.project.name}.`;
  await signIn(page, mobileUser(testInfo, "joinAsker"));
  await askToJoin(page, message);

  const moderator = await (await browser.newContext(testInfo.project.use)).newPage();
  await signIn(moderator, mobileUser(testInfo, "joinModerator"));
  await approveRequest(moderator, mobileUser(testInfo, "joinAsker"), message);

  await seeJoined(page);
});
