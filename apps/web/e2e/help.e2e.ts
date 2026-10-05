import { expect, test } from "@playwright/test";
import { DOCS_URL } from "../src/components/help/topics";
import { E2E_PASSWORD, E2E_USERS } from "./users";

test("a user opens a helper in the New item form, whose Learn more and Docs open the website in a new tab", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.reader);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);

  await page.goto("/submissions/new");
  // A helper opens as a popover next to its question (050): nothing on the page moves.
  const question = page.getByRole("button", { name: "What's a scope?" });
  const answer = page.getByRole("dialog", { name: "What's a scope?" });
  const below = page.getByRole("button", { name: "Create draft" });
  await expect(question).toHaveAttribute("aria-expanded", "false");
  await expect(answer).toHaveCount(0);
  const before = await below.boundingBox();
  await question.click();
  await expect(answer.getByText(/The first part of an item's name/)).toBeVisible();
  await expect(question).toHaveAttribute("aria-expanded", "true");
  expect(await below.boundingBox()).toEqual(before);
  // Inside the window, with its margin.
  const box = await answer.boundingBox();
  const window = page.viewportSize();
  expect(box && window).toBeTruthy();
  if (box && window) {
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(window.width - 8);
    expect(box.y + box.height).toBeLessThanOrEqual(window.height);
  }
  // Esc closes it, and focus goes back to the question.
  await page.keyboard.press("Escape");
  await expect(answer).toHaveCount(0);
  await expect(question).toBeFocused();
  await question.click();
  // The Documentation is on the website (088): Learn more opens its section in a new tab. Not
  // followed here, so the tests don't need the internet.
  const learnMore = answer.getByRole("link", { name: /^Learn more/ });
  await expect(learnMore).toHaveAttribute("href", `${DOCS_URL}/scopes#what`);
  await expect(learnMore).toHaveAttribute("target", "_blank");
  await expect(learnMore).toHaveAccessibleName("Learn more (opens in a new tab)");
  // So does Docs, in the main nav.
  const docs = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^Docs/ });
  await expect(docs).toHaveAttribute("href", DOCS_URL);
  await expect(docs).toHaveAttribute("target", "_blank");
  await expect(docs).not.toHaveAttribute("aria-current", "page");
});

test("the app's old Documentation addresses redirect to the website, signed in or not (088)", async ({
  request,
}) => {
  for (const [path, location] of [
    ["/docs", DOCS_URL],
    ["/docs/overview", DOCS_URL],
    ["/docs/scopes", `${DOCS_URL}/scopes`],
  ] as const) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(307);
    expect(response.headers().location, path).toBe(location);
  }
});
