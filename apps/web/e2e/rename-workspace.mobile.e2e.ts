import { test } from "@playwright/test";
import { signIn } from "./mobile";
import { renameAsAdmin } from "./rename-workspace";
import { E2E_RENAME, E2E_USERS } from "./users";

test("a workspace's admin renames it on a phone, and its address and items follow (113)", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name as keyof typeof E2E_RENAME.projects;
  await signIn(page, E2E_USERS[E2E_RENAME.projects[project]]);
  await renameAsAdmin(page, project);
});
