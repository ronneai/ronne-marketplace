import { test } from "@playwright/test";
import { deviceFlow } from "./device";
import { E2E_USERS } from "./users";

// Feature 107 on the desktop: approve, deny, expiry and a two-factor account, with a real rmk.
test("rmk login --web: approve in the browser, deny, an expired code, and two-factor", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await deviceFlow({
    page,
    browser,
    user: E2E_USERS.device,
    twoFactorUser: E2E_USERS.deviceTwoFactor,
  });
});
