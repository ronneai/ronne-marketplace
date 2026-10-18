import { test } from "@playwright/test";
import { deviceFlow } from "./device";
import { mobileUser } from "./mobile";

// Feature 107 on phones and a tablet: each project's own people (the sign-in limit).
test("rmk login --web on a phone: approve, deny, an expired code, and two-factor", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  await deviceFlow({
    page,
    browser,
    user: mobileUser(testInfo, "device"),
    twoFactorUser: mobileUser(testInfo, "deviceTwoFactor"),
  });
});
