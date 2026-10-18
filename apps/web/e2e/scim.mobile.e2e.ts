import { test } from "@playwright/test";
import { mobileUser } from "./mobile";
import { scimFlow } from "./scim";

// Feature 108 end to end on phones and a tablet: each project's own root, provider and person.
test("an identity provider's SCIM client provisions, groups and deprovisions a person", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  await scimFlow({
    page,
    browser,
    baseURL,
    // 106's root for this project: it signs in once there, so one more stays under the limit.
    root: mobileUser(testInfo, "ssoRoot"),
    // A retry gets its own provider and person: the first attempt's are taken.
    suffix: `${testInfo.project.name}${testInfo.retry ? `-r${testInfo.retry}` : ""}`,
  });
});
