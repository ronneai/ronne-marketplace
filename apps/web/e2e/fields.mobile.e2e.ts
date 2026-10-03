import { expect, type Locator, type Page, test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";
import { E2E_PASSWORD, E2E_SCOPE } from "./users";

/**
 * Feature 067: on a touch screen every kind of field is 16px or more and at least 44px high, so
 * iOS Safari doesn't zoom the page when it gets focus, and focusing it doesn't zoom here either.
 */
const checkField = async (page: Page, field: Locator, what: string) => {
  await field.focus();
  const { fontSize, height, scale } = await field.evaluate((el) => ({
    fontSize: Number.parseFloat(getComputedStyle(el).fontSize),
    height: el.getBoundingClientRect().height,
    scale: window.visualViewport?.scale ?? 1,
  }));
  expect(fontSize, `${what}: font size`).toBeGreaterThanOrEqual(16);
  expect(scale, `${what}: page scale`).toBe(1);
  return height;
};

test("fields are 16px and finger-sized on a touch screen", async ({
  page,
  playwright,
}, testInfo) => {
  await page.goto("/sign-in");
  expect(await checkField(page, page.getByLabel("Email"), "sign-in email")).toBeGreaterThanOrEqual(
    44,
  );
  await checkField(page, page.getByLabel("Password", { exact: true }), "sign-in password");

  // A draft of this project's moderator, for the editor's fields.
  const email = mobileUser(testInfo, "moderator");
  const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  const token = await api.post("/api/v1/auth/token", {
    data: { email, password: E2E_PASSWORD, name: "fields" },
  });
  const headers = { authorization: `Bearer ${(await token.json()).token}` };
  const name = `@${E2E_SCOPE}/fields-${testInfo.project.name}`;
  const upload = await api.post("/api/v1/drafts", {
    headers,
    data: {
      name,
      type: "skill",
      files: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: `name: "${name}"\ntype: skill\ndescription: Fields.\n`,
        },
        { path: "SKILL.md", encoding: "utf8", content: "Fields.\n" },
      ],
    },
  });
  expect(upload.status()).toBe(201);
  const draftUrl = (await upload.json()).url as string;
  await api.dispose();

  await signIn(page, email);
  await page.goto("/catalogue");
  expect(
    await checkField(page, page.locator('input[name="q"]'), "catalogue search"),
  ).toBeGreaterThanOrEqual(44);
  await checkField(page, page.locator("select").first(), "catalogue select");

  await page.goto("/submissions/new");
  await checkField(page, page.locator("#item-name"), "new item name");

  await page.goto(draftUrl);
  await checkField(page, page.locator("#field-description"), "description");
  await page
    .getByRole("button", { name: /SKILL\.md/ })
    .first()
    .click();
  await checkField(page, page.getByLabel("Contents of SKILL.md"), "code editor");
});
