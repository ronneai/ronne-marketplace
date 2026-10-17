import { test } from "@playwright/test";
import { mobileUser } from "./mobile";
import { ssoFlow } from "./sso";

// Feature 106 end to end on phones and a tablet: each project's own root, member and provider.
test("an identity provider, from the preset to disable-sso", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  await ssoFlow({
    page,
    browser,
    baseURL,
    root: mobileUser(testInfo, "ssoRoot"),
    member: mobileUser(testInfo, "ssoMember"),
    // A retry gets its own provider: the first attempt's id is taken.
    suffix: `${testInfo.project.name}${testInfo.retry ? `-r${testInfo.retry}` : ""}`,
  });
});
