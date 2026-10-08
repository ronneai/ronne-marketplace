import { test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";
import { saveAndSeeSubmitProblems } from "./submit-problems";

test("a save shows what Submit would refuse, until it's fixed (#142)", async ({
  page,
}, testInfo) => {
  await signIn(page, mobileUser(testInfo, "member"));
  await saveAndSeeSubmitProblems(page, `submit-problems-${testInfo.project.name}`);
});
