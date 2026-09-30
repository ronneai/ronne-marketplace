import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_PROPOSAL_ITEM, E2E_RMK_ITEMS, E2E_SCOPE, E2E_USERS } from "./users";

const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

test("a user composes an agent from two catalogue items on the canvas, saves, reloads and sees them in the YAML", async ({
  page,
}) => {
  await signIn(page, E2E_USERS.composer);
  await page.goto("/submissions/new");
  await page
    .locator("label")
    .filter({ has: page.locator(`input[name="scope"][value="${E2E_SCOPE}"]`) })
    .click();
  await page.getByLabel("Name").fill("composed");
  await page
    .locator("label")
    .filter({ has: page.locator('input[name="type"][value="agent"]') })
    .click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/submissions\/[0-9A-Z]{26}$/);

  const skill = `@${E2E_SCOPE}/${E2E_PROPOSAL_ITEM}`;
  const mcp = `@${E2E_SCOPE}/${E2E_RMK_ITEMS.mcp}`;
  const files = page.getByRole("list", { name: "Files" });
  const yaml = page.getByLabel("Contents of ronne.yaml");
  const show = (view: "YAML" | "Canvas") =>
    page.getByRole("button", { name: view, exact: true }).click();

  // The canvas: the draft in the centre, and nothing around it yet.
  await show("Canvas");
  const canvas = page.getByRole("region", { name: "Canvas" });
  const picker = page.getByRole("region", { name: "Add from the catalogue" });
  const list = page.getByRole("complementary", { name: "Dependencies" });
  const node = (name: string) => canvas.locator(".react-flow__node").filter({ hasText: name });
  await expect(node(`@${E2E_SCOPE}/composed`)).toBeVisible();
  await expect(list.getByText(/^None yet\./)).toBeVisible();
  // The helper says what the canvas writes, and leads to the Documentation.
  await list.getByText("What does the canvas change?").click();
  await expect(list.getByText(/^Only dependencies in ronne\.yaml\./)).toBeVisible();
  await expect(list.getByRole("link", { name: "Learn more" })).toHaveAttribute(
    "href",
    "/docs/items#canvas",
  );

  // The picker offers what an agent may depend on: skills and MCP servers, not other agents.
  await expect(picker.getByText(skill, { exact: true })).toBeVisible();
  await expect(picker.getByText(`@${E2E_SCOPE}/${E2E_RMK_ITEMS.agent}`)).toHaveCount(0);

  // The first, searched for and added with its button: on the canvas with ^latest.
  await picker.getByLabel("Search the catalogue").fill("commit messages");
  await expect(picker.getByRole("listitem")).toHaveCount(1);
  await picker.getByRole("button", { name: `Add ${skill}` }).click();
  await expect(node(skill)).toBeVisible();
  await expect(node(skill).getByLabel(`Range of ${skill}`)).toHaveValue("^1.0.0");
  await expect(node(skill).getByText(/^works in /)).toBeVisible();
  await expect(picker.getByText("added")).toBeVisible();

  // The second, dragged from the picker onto the canvas: it stays where it's dropped.
  await picker.getByLabel("Search the catalogue").fill("");
  await picker.getByLabel("Type").selectOption("mcp-server");
  // With the mouse, step by step, to a place on the canvas that's in view with the picker.
  const result = picker.getByRole("listitem").filter({ hasText: mcp });
  await result.scrollIntoViewIfNeeded();
  const from = await result.boundingBox();
  const onto = await canvas.boundingBox();
  if (!from || !onto) throw new Error("The picker's result or the canvas isn't on the page.");
  await page.mouse.move(from.x + 30, from.y + 12);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 4, { steps: 4 });
  await page.mouse.move(onto.x + 140, onto.y + onto.height - 90, { steps: 10 });
  await page.mouse.up();
  await expect(node(mcp)).toBeVisible();
  await expect(files.getByText("layout.json")).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(2);

  // Its range, from the list under the canvas; the node and the YAML follow.
  await list.getByLabel(`Range of ${mcp}`).fill("~1.0.0");
  await expect(node(mcp).getByLabel(`Range of ${mcp}`)).toHaveValue("~1.0.0");
  await show("YAML");
  await expect(yaml).toContainText(`"${mcp}": ~1.0.0`);
  await expect(yaml).toContainText(`"${skill}": ^1.0.0`);
  // The canvas only wrote `dependencies`: the template's comments are still there.
  await expect(yaml).toContainText("# The file with the agent's system prompt.");

  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText(/Saved at/)).toBeVisible();
  await page.reload();
  await show("YAML");
  await expect(yaml).toContainText(`"${mcp}": ~1.0.0`);
  await expect(yaml).toContainText(`"${skill}": ^1.0.0`);

  // Back on the canvas, both are there, and the keyboard alone moves one and removes the other.
  await show("Canvas");
  await expect(node(mcp)).toBeVisible();
  await expect(node(skill).getByText(/^works in /)).toBeVisible();
  await node(skill).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  // Moving a node changed the layout file, not ronne.yaml.
  await expect(files.getByRole("button", { name: /layout\.json/ })).toContainText("(unsaved)");
  await expect(files.getByRole("button", { name: /ronne\.yaml/ })).not.toContainText("(unsaved)");
  await node(mcp).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Delete");
  await expect(node(mcp)).toHaveCount(0);
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await show("YAML");
  await expect(yaml).not.toContainText(mcp);
  await expect(yaml).toContainText(`"${skill}": ^1.0.0`);
});
