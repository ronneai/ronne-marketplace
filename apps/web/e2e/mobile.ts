import { expect, type Page, type TestInfo } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

/** The phone and tablet projects (feature 065), each with its own users. */
const PROJECT_USERS = {
  phone: { member: "phoneMember" },
  "phone-webkit": { member: "phoneWebkitMember" },
  tablet: { member: "tabletMember" },
} as const satisfies Record<string, Record<string, keyof typeof E2E_USERS>>;

export type MobileRole = keyof (typeof PROJECT_USERS)["phone"];

/** The email of this project's user for a role. */
export const mobileUser = (testInfo: TestInfo, role: MobileRole): string => {
  const users = PROJECT_USERS[testInfo.project.name as keyof typeof PROJECT_USERS];
  if (!users) throw new Error(`${testInfo.project.name} isn't a phone or tablet project`);
  return E2E_USERS[users[role]];
};

/** Signs in through the form, as a person on a phone would. */
export const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};
