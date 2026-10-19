import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { recordSecret } from "./secrets";
import { E2E_ERASE, E2E_PASSWORD, E2E_SCOPE, E2E_USERS } from "./users";

const signIn = async (page: Page, email: string, password: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Signed in: the page left /sign-in (the header shows the name, not the email).
  await expect(page).not.toHaveURL(/\/sign-in/);
};

/** A user's row, by the exact email cell (one email can be part of another). */
const rowOf = (page: Page, email: string) =>
  page.getByRole("row").filter({ has: page.getByRole("cell", { name: email, exact: true }) });

// One root sign-in for all of user admin (docs/knowledge/e2e-sign-in-limit.md), so 059's
// promote and demote checks live in this test too.
test("root creates a user, who signs in with the shown password; disabling them ends it", async ({
  browser,
}) => {
  const root = await browser.newPage();
  await signIn(root, E2E_USERS.root, E2E_PASSWORD);
  await root
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Users", exact: true })
    .click();
  await expect(root.getByRole("heading", { name: "Users" })).toBeVisible();

  // Create, with a generated password. Choosing root warns first (059).
  const email = "created-by-root@e2e.test";
  await root.getByRole("button", { name: "Create user" }).click();
  const create = root.getByRole("dialog");
  await create.getByLabel("Role").selectOption("root");
  await expect(create.getByText("Root can do everything.")).toBeVisible();
  await create.getByLabel("Role").selectOption("user");
  await expect(create.getByText("Root can do everything.")).toBeHidden();
  await create.getByLabel("Email").fill(email);
  await create.getByLabel("Name").fill("Created By Root");
  await create.getByRole("button", { name: "Create user" }).click();
  await expect(create.getByText("Shown once")).toBeVisible();
  const password = (await create.locator("code").nth(1).innerText()).trim();
  expect(password).toHaveLength(20);
  recordSecret(JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main, password);
  await create.getByRole("button", { name: "Done" }).click();
  await expect(root.getByRole("cell", { name: email, exact: true })).toBeVisible();

  // The list sorts on the server (061): by email from its header, the view kept in the URL.
  await root.getByRole("link", { name: "Email" }).click();
  await expect(root).toHaveURL(/sort=email/);
  await expect(root.getByRole("columnheader", { name: "Email" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await expect(root.getByRole("cell", { name: email, exact: true })).toBeVisible();

  // Their workspaces (092): they start as a user in global (their personal workspace, 114, isn't
  // listed); root adds one, as a user by default, makes them moderator there, then takes it away.
  await rowOf(root, email)
    .getByRole("button", { name: `Workspaces of ${email}: 1` })
    .click();
  const memberships = root.getByRole("dialog", { name: `Workspaces of ${email}` });
  await expect(memberships.getByLabel("Role in global")).toHaveValue("user");
  await expect(memberships.getByRole("button", { name: "Remove global" })).toHaveCount(0);
  await memberships.getByRole("button", { name: "Add workspace" }).click();
  await memberships.getByLabel("Workspace 2").selectOption({ label: "e2e-acme" });
  await expect(memberships.getByLabel("Role in e2e-acme")).toHaveValue("user");
  await memberships.getByLabel("Role in e2e-acme").selectOption("moderator");
  await memberships.getByRole("button", { name: "Save" }).click();
  await expect(memberships.getByText("Saved: 1 workspace added.")).toBeVisible();
  await memberships.getByRole("button", { name: "Done" }).click();
  await expect(rowOf(root, email)).toContainText(/moderator\s*1\s*user\s*1/);
  await rowOf(root, email)
    .getByRole("button", { name: `Workspaces of ${email}: 2` })
    .click();
  await expect(memberships.getByLabel("Role in e2e-acme")).toHaveValue("moderator");
  await memberships.getByRole("button", { name: "Remove e2e-acme" }).click();
  await memberships.getByRole("button", { name: "Save" }).click();
  await expect(memberships.getByText("Saved: 1 workspace removed.")).toBeVisible();
  await memberships.getByRole("button", { name: "Done" }).click();
  await expect(rowOf(root, email)).not.toContainText(/moderator/);

  // The new user signs in with it.
  const user = await browser.newPage();
  await signIn(user, email, password);

  // Root's own row is read-only; the user isn't an admin yet. Searched for: with more than a page
  // of e2e users, root's row may not be on the first.
  await root.goto(`/admin/users?q=${encodeURIComponent(E2E_USERS.root)}`);
  await expect(
    rowOf(root, E2E_USERS.root).getByRole("button", {
      name: "Why can't I change my own account here?",
    }),
  ).toBeVisible();
  await expect(root.getByRole("group", { name: `Actions for ${E2E_USERS.root}` })).toHaveCount(0);
  await root.goto("/admin/users");
  expect((await user.goto("/admin/users"))?.status()).toBe(404);

  // Root makes them root, with a warning; it takes effect on their next request (059).
  const changeRole = async (to: "root" | "user", warning: string) => {
    await root
      .getByRole("group", { name: `Actions for ${email}` })
      .getByRole("button", { name: "Change role" })
      .click();
    const dialog = root.getByRole("dialog");
    await dialog.getByLabel("New role").selectOption(to);
    await expect(dialog.getByText(warning)).toBeVisible();
    await dialog.getByRole("button", { name: "Change role" }).click();
    await expect(dialog.getByText(`Role changed to ${to}.`)).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();
  };
  await changeRole("root", `Make ${email} root?`);
  expect((await user.goto("/admin/users"))?.status()).toBe(200);
  await expect(
    rowOf(user, email).getByRole("button", { name: "Why can't I change my own account here?" }),
  ).toBeVisible();
  await expect(user.getByRole("group", { name: `Actions for ${email}` })).toHaveCount(0);
  // Searched for: with more than a page of e2e users, root's row may not be on the first.
  await user.goto(`/admin/users?q=${encodeURIComponent(E2E_USERS.root)}`);
  await expect(
    user
      .getByRole("group", { name: `Actions for ${E2E_USERS.root}` })
      .getByRole("button", { name: "Change role" }),
  ).toBeVisible();

  // And removes root again: the admin area is a 404 for them on their next request.
  await changeRole("user", `Remove root from ${email}?`);
  expect((await user.goto("/admin/users"))?.status()).toBe(404);

  // Root disables them; their next request goes to sign-in.
  await root
    .getByRole("group", { name: `Actions for ${email}` })
    .getByRole("button", { name: "Disable" })
    .click();
  const disable = root.getByRole("dialog");
  await expect(disable.getByText(/signs them out everywhere \(1 session\)/)).toBeVisible();
  await disable.getByRole("button", { name: "Disable user" }).click();
  await expect(disable.getByText("Disabled.")).toBeVisible();
  await disable.getByRole("button", { name: "Done" }).click();
  await expect(root.getByRole("row").filter({ hasText: email })).toContainText("disabled");

  await user.goto("/");
  await expect(user).toHaveURL(/\/sign-in$/);

  // Root erases a user (103) who published an item and commented on a review: the dialog needs
  // the email typed, then every page shows the pseudonym, and the old email makes a new account.
  const erasable = E2E_USERS.erasable;
  await root.goto(`/admin/users?q=${encodeURIComponent(erasable)}`);
  // First, root makes the file the person asked for (104): the item and the comment are in it,
  // and a second one inside ten minutes is refused.
  await root
    .getByRole("group", { name: `Actions for ${erasable}` })
    .getByRole("button", { name: "Download their data" })
    .click();
  const download = root.getByRole("dialog", { name: "Download their data" });
  await expect(download.getByText(erasable)).toBeVisible();
  const [file] = await Promise.all([
    root.waitForEvent("download"),
    download.getByRole("link", { name: "Download", exact: true }).click(),
  ]);
  expect(file.suggestedFilename()).toMatch(/^ronne-data-[0-9A-Z]+-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile(await file.path(), "utf8"));
  expect(data.account.email).toBe(erasable);
  expect(data.items.map((i: { name: string }) => i.name)).toContain(
    `@${E2E_SCOPE}/${E2E_ERASE.item}`,
  );
  expect(data.comments.map((c: { body: string }) => c.body)).toContain(E2E_ERASE.comment);
  expect(JSON.stringify(data)).not.toMatch(/token_hash|backup_codes/);
  const again = await root.context().request.get(file.url());
  expect(again.status()).toBe(429);
  await download.getByText("Close", { exact: true }).click();
  await root
    .getByRole("group", { name: `Actions for ${erasable}` })
    .getByRole("button", { name: "Erase" })
    .click();
  const erase = root.getByRole("dialog", { name: "Erase user" });
  await expect(erase.getByText("What goes")).toBeVisible();
  await expect(erase.getByText("This can't be undone.")).toBeVisible();
  await expect(erase.getByRole("button", { name: "Erase" })).toBeDisabled();
  await erase.getByLabel("Type the account's email to confirm").fill("someone-else@e2e.test");
  await expect(erase.getByRole("button", { name: "Erase" })).toBeDisabled();
  await erase.getByLabel("Type the account's email to confirm").fill(` ${erasable.toUpperCase()} `);
  await expect(erase.getByRole("button", { name: "Erase" })).toBeEnabled();
  await erase.getByRole("button", { name: "Erase" }).click();
  await expect(erase.getByText(/Erased\. The account is now deleted-user/)).toBeVisible();
  await erase.getByRole("button", { name: "Done" }).click();
  // The row is the pseudonym now: the badge, the status, and only the greyed download.
  await root.goto("/admin/users?q=deleted-user-");
  const erasedRow = root.getByRole("row").filter({ hasText: "Erased on" });
  await expect(erasedRow).toHaveCount(1);
  await expect(erasedRow).toContainText(/deleted-user-[0-9A-Z]+@ronne\.invalid/);
  await expect(erasedRow).toContainText("erased");
  await expect(
    erasedRow.getByRole("button", { name: /Download the data of .*: erased/ }),
  ).toBeDisabled();
  await expect(erasedRow.getByRole("button", { name: "Erase", exact: true })).toHaveCount(0);
  await expect(root.getByRole("cell", { name: erasable, exact: true })).toHaveCount(0);
  // Its item's versions, the review's conversation and the audit log all say the pseudonym.
  await root.goto(`/items/${E2E_SCOPE}/${E2E_ERASE.item}/versions`);
  await expect(root.getByText(/by deleted-user-/).first()).toBeVisible();
  await expect(root.getByText("Erasable Person")).toHaveCount(0);
  await root.goto(`/reviews/${E2E_ERASE.submissionId}`);
  const conversation = root.getByRole("region", { name: "Conversation" });
  await expect(conversation).toContainText(E2E_ERASE.comment);
  await expect(conversation).toContainText(/deleted-user-/);
  await expect(root.getByText("Erasable Person")).toHaveCount(0);
  await root.goto("/admin/audit?action=user.erased");
  await expect(root.getByRole("row").filter({ hasText: /Erased deleted-user-/ })).toHaveCount(1);
  await expect(root.getByText(erasable)).toHaveCount(0);
  // The old email is free: root creates a new account with it, and that person signs in to an
  // empty one, seeing the pseudonym on the item like everyone else.
  await root.goto("/admin/users");
  await root.getByRole("button", { name: "Create user" }).click();
  const recreate = root.getByRole("dialog");
  await recreate.getByLabel("Email").fill(erasable);
  await recreate.getByLabel("Name").fill("New Erasable");
  await recreate.getByRole("button", { name: "Create user" }).click();
  await expect(recreate.getByText("Shown once")).toBeVisible();
  const newPassword = (await recreate.locator("code").nth(1).innerText()).trim();
  recordSecret(JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main, newPassword);
  await recreate.getByRole("button", { name: "Done" }).click();
  const reborn = await browser.newPage();
  await signIn(reborn, erasable, newPassword);
  await expect(
    reborn.getByRole("complementary", { name: "Sidebar" }).getByText("New Erasable").first(),
  ).toBeVisible();
  // Empty: nothing of the erased person's is theirs (no drafts or submissions, no comment).
  await reborn.goto("/submissions");
  await expect(reborn.getByText("You have no drafts yet.")).toBeVisible();
  await expect(reborn.getByText(E2E_ERASE.submission)).toHaveCount(0);
  await reborn.goto(`/items/${E2E_SCOPE}/${E2E_ERASE.item}/versions`);
  await expect(reborn.getByText(/by deleted-user-/).first()).toBeVisible();
  await reborn.close();

  // A workspace's admin (092), in root's test: root makes them admin of e2e-acme from their
  // Workspaces; they then run e2e-acme and nothing else.
  const adminEmail = E2E_USERS.workspaceAdmin;
  await root.goto(`/admin/users?q=${encodeURIComponent(adminEmail)}`);
  await rowOf(root, adminEmail)
    .getByRole("button", { name: `Workspaces of ${adminEmail}: 1` })
    .click();
  const theirs = root.getByRole("dialog", { name: `Workspaces of ${adminEmail}` });
  await theirs.getByRole("button", { name: "Add workspace" }).click();
  await theirs.getByLabel("Workspace 2").selectOption({ label: "e2e-acme" });
  await theirs.getByLabel("Role in e2e-acme").selectOption("admin");
  await theirs.getByRole("button", { name: "Save" }).click();
  await expect(theirs.getByText("Saved: 1 workspace added.")).toBeVisible();

  const admin = await browser.newPage();
  await signIn(admin, adminEmail, E2E_PASSWORD);
  // No Admin pages for a workspace's admin (115): their workspaces are under Workspaces.
  await expect(
    admin
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Users", exact: true }),
  ).toHaveCount(0);
  await admin.getByRole("link", { name: "Workspaces", exact: true }).click();
  await expect(admin).toHaveURL(/\/workspaces$/);
  const acmeRow = admin.getByRole("row").filter({ hasText: "e2e-acme" });
  await expect(acmeRow).toContainText("Admin");
  await expect(admin.getByRole("button", { name: "New workspace" })).toHaveCount(0);
  await acmeRow.getByRole("link", { name: "e2e-acme", exact: true }).click();
  await expect(admin.getByRole("heading", { name: "e2e-acme" })).toBeVisible();
  await admin
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("link", { name: "Members" })
    .click();
  await expect(admin).toHaveURL(/\?tab=members$/);
  // Their own row is read-only; the role filter narrows the table.
  await expect(admin.getByText("(you)")).toBeVisible();
  await expect(admin.getByLabel(`Role of ${adminEmail}`)).toHaveCount(0);
  await admin.getByLabel("Role", { exact: true }).selectOption("moderator");
  await expect(admin).toHaveURL(/tab=members.*role=moderator/);
  await expect(admin.getByText("(you)")).toHaveCount(0);
  // An old bookmark under Admin lands on the page under Workspaces, with its tab (115).
  await admin.goto("/admin/workspaces/e2e-acme?tab=members");
  await expect(admin).toHaveURL(/\/workspaces\/e2e-acme\?tab=members$/);
  await admin.goto("/admin/workspaces");
  await expect(admin).toHaveURL(/\/workspaces$/);
  await admin.goto("/workspaces/e2e-acme?tab=members");

  // Adds someone as moderator, then removes them again, after a confirm.
  await admin.getByRole("button", { name: "Add members" }).click();
  const add = admin.getByRole("dialog", { name: "Add members to e2e-acme" });
  await add.getByLabel("Find people").fill("member-to-add");
  await add.getByRole("button", { name: `Pick ${E2E_USERS.memberToAdd}` }).click();
  await add.getByLabel("Role").selectOption("moderator");
  await add.getByRole("button", { name: "Add members" }).click();
  await expect(add.getByText("Added 1 person.")).toBeVisible();
  await add.getByRole("button", { name: "Done" }).click();
  await expect(admin.getByLabel(`Role of ${E2E_USERS.memberToAdd}`)).toHaveValue("moderator");
  // Changing it saves, and the select keeps the new role (it once went back until a reload).
  await admin.getByLabel(`Role of ${E2E_USERS.memberToAdd}`).selectOption("admin");
  await expect(admin.getByLabel(`Role of ${E2E_USERS.memberToAdd}`)).toBeEnabled();
  await expect(admin.getByLabel(`Role of ${E2E_USERS.memberToAdd}`)).toHaveValue("admin");
  await admin.reload();
  await expect(admin.getByLabel(`Role of ${E2E_USERS.memberToAdd}`)).toHaveValue("admin");
  await admin.getByRole("button", { name: `Remove ${E2E_USERS.memberToAdd}` }).click();
  const remove = admin.getByRole("dialog", { name: "Remove member" });
  await remove.getByRole("button", { name: "Remove" }).click();
  // Their row goes, and the confirm with it.
  await expect(admin.getByLabel(`Role of ${E2E_USERS.memberToAdd}`)).toHaveCount(0);
  await expect(remove).toHaveCount(0);

  // Creates a scope in e2e-acme, from the Scopes tab.
  await admin
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("link", { name: "Scopes" })
    .click();
  await admin.getByRole("button", { name: "Create scope" }).click();
  const scope = admin.getByRole("dialog", { name: "Create scope" });
  await expect(scope.getByText("In e2e-acme")).toBeVisible();
  await scope.getByLabel("Name").fill("acme-admin-tools");
  await scope.getByLabel("Description").fill("Made by e2e-acme's admin.");
  await scope.getByRole("button", { name: "Create scope" }).click();
  await expect(scope.getByText(/Created/)).toBeVisible();
  await scope.getByRole("button", { name: "Done" }).click();
  await expect(admin.getByTitle("@acme-admin-tools", { exact: true })).toBeVisible();

  // And nothing else. Another workspace's page opens, as for everyone who sees it (115), with
  // nothing to manage there; Admin and its pages are a 404.
  await admin.goto("/workspaces/global");
  await expect(admin.getByRole("heading", { level: 1 })).toHaveText("global");
  await expect(admin.getByRole("link", { name: "Members" })).toHaveCount(0);
  await expect(admin.getByRole("button", { name: "Create scope" })).toHaveCount(0);
  for (const path of ["/admin", "/admin/users", "/admin/audit", "/admin/settings"])
    expect((await admin.goto(path))?.status(), path).toBe(404);
});
