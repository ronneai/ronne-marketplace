import { expect, type Page } from "@playwright/test";
import { fits, noSideScroll } from "./move-scope";
import { E2E_ITEM_MOVE } from "./users";

/** The item's page in the project's workspace, in its first scope or the one it moved to. */
export const itemMovePath = (project: string, scope: string = E2E_ITEM_MOVE.from) =>
  `/workspaces/${E2E_ITEM_MOVE.workspace(project)}/items/${scope}/${E2E_ITEM_MOVE.item}`;

/** The item's full name in the project's workspace. */
export const itemMoveName = (project: string, scope: string = E2E_ITEM_MOVE.from) =>
  `@${E2E_ITEM_MOVE.workspace(project)}/${scope}/${E2E_ITEM_MOVE.item}`;

/**
 * The Move dialog on a screen (134, task 6), moving nothing: the member's form (a request, with a
 * message and who answers), then the moderator's confirmation. Each fits its screen at its own
 * width, 360px and 320px, and nothing in it scrolls sideways.
 */
export const moveItemDialogFits = async (member: Page, moderator: Page, project: string) => {
  const name = itemMoveName(project);
  await member.goto(itemMovePath(project));
  await member.getByRole("button", { name: "Move to another scope…" }).click();
  const ask = member.getByRole("dialog", { name: `Move ${name}` });
  await ask.getByLabel("To which scope").selectOption({ label: E2E_ITEM_MOVE.to });
  await expect(ask.getByText(itemMoveName(project, E2E_ITEM_MOVE.to))).toBeVisible();
  await expect(ask.getByLabel("Message (optional)")).toBeVisible();
  await expect(ask.getByRole("button", { name: "Ask to move" })).toBeEnabled();
  await fits(member, "the Move dialog, asking");
  await noSideScroll(member, ask, "the Move dialog, asking");
  await ask.getByRole("button", { name: "Cancel" }).click();

  await moderator.goto(itemMovePath(project));
  await moderator.getByRole("button", { name: "Move to another scope…" }).click();
  const move = moderator.getByRole("dialog", { name: `Move ${name}` });
  await move.getByLabel("To which scope").selectOption({ label: E2E_ITEM_MOVE.to });
  await move.getByRole("button", { name: "Move item" }).click();
  await expect(move.getByRole("button", { name: "Back" })).toBeVisible();
  await fits(moderator, "the Move dialog's confirmation");
  await noSideScroll(moderator, move, "the Move dialog's confirmation");
  await move.getByRole("button", { name: "Back" }).click();
  await move.getByRole("button", { name: "Cancel" }).click();
  // Nothing moved: the item is still where it was.
  await expect(moderator).toHaveURL(new RegExp(`${itemMovePath(project)}$`));
};
