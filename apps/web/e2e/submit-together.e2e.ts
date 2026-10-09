import { test } from "@playwright/test";
import { signIn } from "./mobile";
import {
  approve,
  installCycle,
  releaseTogether,
  submitTogether,
  uploadCycle,
} from "./submit-together";
import { E2E_USERS } from "./users";

/**
 * Items that need each other (feature 112): two skill drafts, each depending on the other, are
 * submitted together from one's page, approved, released together from one Publish, and installed
 * with `rmk`, both at once.
 */
test("two skills that need each other go through review and release together (112)", async ({
  browser,
  request,
}) => {
  const pair = ["st-ping", "st-pong"] as const;
  const { firstId, secondId } = await uploadCycle(request, E2E_USERS.togetherAuthor, pair);
  const author = await (await browser.newContext()).newPage();
  await signIn(author, E2E_USERS.togetherAuthor);
  await author.goto(`/submissions/${firstId}`);
  await submitTogether(author, pair);

  const moderator = await (await browser.newContext()).newPage();
  await signIn(moderator, E2E_USERS.togetherModerator);
  await approve(moderator, firstId);
  await approve(moderator, secondId);

  await author.goto(`/submissions/${firstId}`);
  await releaseTogether(author, pair);
  await installCycle(request, E2E_USERS.togetherAuthor, pair);
});
