import { test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";
import {
  approve,
  installCycle,
  releaseTogether,
  submitTogether,
  uploadCycle,
} from "./submit-together";

test("two skills that need each other go through review and release together (112)", async ({
  browser,
  page,
  request,
}, testInfo) => {
  const pair = [`st-ping-${testInfo.project.name}`, `st-pong-${testInfo.project.name}`] as const;
  const { firstId, secondId } = await uploadCycle(request, mobileUser(testInfo, "together"), pair);
  await signIn(page, mobileUser(testInfo, "together"));
  await page.goto(`/submissions/${firstId}`);
  await submitTogether(page, pair);

  const moderator = await (await browser.newContext(testInfo.project.use)).newPage();
  await signIn(moderator, mobileUser(testInfo, "togetherModerator"));
  await approve(moderator, firstId);
  await approve(moderator, secondId);
  // Closed when done: a context left open keeps running in the project's one browser, and WebKit
  // slows down until its tests time out.
  await moderator.context().close();

  await page.goto(`/submissions/${firstId}`);
  await releaseTogether(page, pair);
  await installCycle(request, mobileUser(testInfo, "together"), pair);
});
