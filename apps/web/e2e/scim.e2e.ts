import { test } from "@playwright/test";
import { scimFlow } from "./scim";
import { E2E_USERS } from "./users";

// Feature 108 end to end on a desktop (the flow is in scim.ts; scim.mobile.e2e.ts runs it on phones).
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
    // 106's root: it signs in once there, so one more stays under the limit.
    root: E2E_USERS.ssoRoot,
    // A retry gets its own provider and person: the first attempt's are taken.
    suffix: `desktop${testInfo.retry ? `-r${testInfo.retry}` : ""}`,
  });
});
