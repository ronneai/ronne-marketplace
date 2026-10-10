import { expect, test } from "@playwright/test";
import { signIn } from "./mobile";
import { E2E_USERS, E2E_VAULT } from "./users";

/** This project's member of e2e-vault and someone who isn't (093). */
const PRIVATE_USERS = {
  phone: { member: "phonePrivateMember", outsider: "phonePrivateOutsider" },
  "phone-webkit": { member: "phoneWebkitPrivateMember", outsider: "phoneWebkitPrivateOutsider" },
  tablet: { member: "tabletPrivateMember", outsider: "tabletPrivateOutsider" },
} as const satisfies Record<string, Record<string, keyof typeof E2E_USERS>>;

/** "Private · @acme/scope/name", with the comma only a screen reader hears (093, 118). */
const lockLabel = (item: string) => new RegExp(`Private · (, )?${item.replaceAll("/", "\\/")}`);
// Its full name names its workspace (118).
const VAULT_ITEM = `@${E2E_VAULT.workspace}/${E2E_VAULT.scope}/${E2E_VAULT.item}`;
const vaultPage = `/workspaces/${E2E_VAULT.workspace}/items/${E2E_VAULT.scope}/${E2E_VAULT.item}`;

/**
 * Private workspaces on phones and tablets (093): the member sees the lock label on the card and
 * the item page, without the page scrolling sideways; someone else gets the 404 an unknown name
 * gets.
 */
test("a private workspace's item: its lock for a member, a 404 for anyone else", async ({
  browser,
}, testInfo) => {
  const users = PRIVATE_USERS[testInfo.project.name as keyof typeof PRIVATE_USERS];
  if (!users) throw new Error(`${testInfo.project.name} isn't a phone or tablet project`);
  const device = testInfo.project.use;

  const member = await (await browser.newContext(device)).newPage();
  await signIn(member, E2E_USERS[users.member]);
  await member.goto(`/catalogue?q=${E2E_VAULT.item}`);
  const card = member.getByRole("article").filter({ hasText: VAULT_ITEM });
  await expect(card).toContainText(lockLabel(VAULT_ITEM));
  await expect(card.locator("svg.lucide-lock")).toBeVisible();
  await member.goto(vaultPage);
  await expect(member.getByRole("heading", { level: 1 })).toHaveText(lockLabel(VAULT_ITEM));
  expect(
    await member.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  // Closed when done: a context left open keeps running in the project's one browser, and WebKit
  // slows down until its tests time out.
  await member.context().close();

  const outsider = await (await browser.newContext(device)).newPage();
  await signIn(outsider, E2E_USERS[users.outsider]);
  expect((await outsider.goto(vaultPage))?.status()).toBe(404);
  await outsider.goto(`/catalogue?q=${E2E_VAULT.item}`);
  await expect(outsider.getByRole("article").filter({ hasText: VAULT_ITEM })).toHaveCount(0);
  await outsider.context().close();
});
