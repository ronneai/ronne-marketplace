import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_USERS } from "./users";

/**
 * Any item may depend on any other (feature 096): a skill depends on an agent (from the form), and
 * a rule on that skill (from the canvas) and on the agent (with `@` in its markdown); both submit.
 * The drafts are uploaded ready to submit, so only the dependencies are added in the browser. It
 * borrows hookAuthor, who signs in once elsewhere (review.e2e.ts).
 */
const name = (item: string) => `@${E2E_SCOPE}/${item}`;

const upload = async (
  request: APIRequestContext,
  headers: Record<string, string>,
  item: string,
  type: "agent" | "skill" | "rule",
) => {
  const description = "description: Any item, any item.\n";
  const block =
    type === "agent"
      ? "agent:\n  prompt: prompt.md\n"
      : type === "skill"
        ? "skill:\n  entry: SKILL.md\n"
        : "rule:\n  body: rule.md\n  activation: always\n";
  const content =
    type === "skill"
      ? `---\nname: ${item}\n${description}---\nDo it.\n`
      : "Follow the house style.\n";
  const response = await request.post("/api/v1/drafts", {
    headers,
    data: {
      name: name(item),
      type,
      files: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: `name: "${name(item)}"\ntype: ${type}\n${description}${block}`,
        },
        {
          path: type === "agent" ? "prompt.md" : type === "skill" ? "SKILL.md" : "rule.md",
          encoding: "utf8",
          content,
        },
      ],
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).id as string;
};

const submit = async (page: Page) => {
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText(/Saved at/)).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click();
  const dialog = page.getByRole("dialog", { name: "Submit for review" });
  await dialog.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText(/Submitted for review on/)).toBeVisible();
};

test("a skill depends on an agent, and a rule on the skill and the agent; both submit", async ({
  page,
  request,
}) => {
  const token = await request.post("/api/v1/auth/token", {
    data: { email: E2E_USERS.hookAuthor, password: E2E_PASSWORD, name: "e2e any-dependency" },
  });
  expect(token.status()).toBe(201);
  const headers = { authorization: `Bearer ${(await token.json()).token}` };
  const agentId = await upload(request, headers, "any-agent", "agent");
  const submitted = await request.post("/api/v1/drafts/submit", {
    headers,
    data: { ids: [agentId] },
  });
  expect(submitted.status()).toBe(200);
  const skillId = await upload(request, headers, "any-skill", "skill");
  const ruleId = await upload(request, headers, "any-rule", "rule");

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.hookAuthor);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);

  // The skill: the agent from the form.
  await page.goto(`/submissions/${skillId}`);
  const search = page.getByRole("combobox", { name: "Add a dependency" });
  await search.fill(name("any-agent"));
  const list = page.getByRole("listbox", { name: "Items to depend on" });
  await expect(list.getByRole("option", { name: new RegExp(name("any-agent")) })).toBeVisible();
  await search.press("Enter");
  await expect(page.getByLabel(`Version of ${name("any-agent")}`)).toBeVisible();
  await page.getByRole("button", { name: "YAML", exact: true }).click();
  await expect(page.getByLabel("Contents of ronne.yaml")).toContainText(
    `"${name("any-agent")}": ^1.0.0`,
  );
  await submit(page);

  // The rule: the skill from the canvas.
  await page.goto(`/submissions/${ruleId}`);
  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  const canvas = page.getByRole("region", { name: "Canvas" });
  const picker = page.getByRole("region", { name: "Add from the catalogue" });
  await picker.getByLabel("Search the catalogue").fill("any-skill");
  await expect(picker.getByText(name("any-skill"), { exact: true })).toBeVisible();
  await picker.getByRole("button", { name: `Add ${name("any-skill")}` }).click();
  await expect(
    canvas.locator(".react-flow__node").filter({ hasText: name("any-skill") }),
  ).toBeVisible();

  // And the agent with `@` in its markdown.
  await page
    .getByRole("list", { name: "Files" })
    .getByRole("button", { name: /rule\.md/ })
    .click();
  await page.getByLabel("Contents of rule.md").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\nSee @any-agent");
  await page.getByRole("option", { name: new RegExp(name("any-agent")) }).click();
  await page
    .getByRole("list", { name: "Files" })
    .getByRole("button", { name: /ronne\.yaml/ })
    .click();
  await page.getByRole("button", { name: "YAML", exact: true }).click();
  const yaml = page.getByLabel("Contents of ronne.yaml");
  await expect(yaml).toContainText(`"${name("any-skill")}": ^1.0.0`);
  await expect(yaml).toContainText(`"${name("any-agent")}": ^1.0.0`);
  await submit(page);
});
