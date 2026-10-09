import { test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";
import { pinAnExactVersion } from "./version-pin";

test("the dependency menu offers an exact version, and saves it bare (#143)", async ({
  page,
}, testInfo) => {
  await signIn(page, mobileUser(testInfo, "versionPin"));
  await pinAnExactVersion(page, `version-pin-${testInfo.project.name}`);
});
