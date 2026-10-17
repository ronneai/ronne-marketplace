import { test } from "@playwright/test";
import { ssoFlow } from "./sso";
import { E2E_USERS } from "./users";

// Feature 106 end to end on a desktop (the flow is in sso.ts; sso.mobile.e2e.ts runs it on phones).
test("an identity provider, from the preset to disable-sso", async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  await ssoFlow({
    page,
    browser,
    baseURL,
    root: E2E_USERS.ssoRoot,
    member: E2E_USERS.ssoMember,
    suffix: "desktop",
  });
});
