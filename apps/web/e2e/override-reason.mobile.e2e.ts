import { expect, type Locator, type Page, test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";
import { describeOverflow, measureOverflow, overflows } from "./sweep";
import { E2E_PASSWORD, E2E_SCOPE } from "./users";

/**
 * Feature 163 on phones and tablets: root's two override dialogs, the one decision's (its reason
 * required) and Approve many's (its message required while root's own are selected), in English,
 * Portuguese and French, at the project's width and at 360px and 320px. Neither may scroll the page
 * sideways, and the title, the reason's field and the buttons stay in view while the field has
 * focus (065, 067).
 */

const WORDS = {
  en: {
    override: "Approve (override)",
    title: "Approve your own submission?",
    label: "Why approve your own submission?",
    cancel: "Cancel",
    select: "Select",
    approveSelected: "Approve selected (1)",
    bulkTitle: "Approve 1 submission?",
    required: "(required: 1 of these is yours)",
    bulkSubmit: "Approve 1 submission",
  },
  pt: {
    override: "Aprovar (exceção)",
    title: "Aprovar a sua própria submissão?",
    label: "Por que aprovar a sua própria submissão?",
    cancel: "Cancelar",
    select: "Selecionar",
    approveSelected: "Aprovar selecionadas (1)",
    bulkTitle: "Aprovar 1 submissão?",
    required: "(obrigatório: 1 destas é sua)",
    bulkSubmit: "Aprovar 1 submissão",
  },
  fr: {
    override: "Approuver (dérogation)",
    title: "Approuver votre propre soumission?",
    label: "Pourquoi approuver votre propre soumission?",
    cancel: "Annuler",
    select: "Sélectionner",
    approveSelected: "Approuver la sélection (1)",
    bulkTitle: "Approuver 1 soumission?",
    required: "(obligatoire : 1 de celles-ci est la vôtre)",
    bulkSubmit: "Approuver 1 soumission",
  },
} as const;

const WIDTHS = [360, 320] as const;

/** On screen: inside the visual viewport, all of it. */
const onScreen = async (page: Page, locator: Locator, what: string) => {
  const box = await locator.boundingBox();
  const { width, height } = await page.evaluate(() => ({
    width: window.visualViewport?.width ?? innerWidth,
    height: window.visualViewport?.height ?? innerHeight,
  }));
  expect(box, `${what} has a box`).not.toBeNull();
  if (!box) return;
  expect(box.y, what).toBeGreaterThanOrEqual(0);
  expect(box.x, what).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, what).toBeLessThanOrEqual(height + 1);
  expect(box.x + box.width, what).toBeLessThanOrEqual(width + 1);
};

/** The dialog at each width: nothing sideways, and its parts in view with the field focused. */
const sweep = async (
  page: Page,
  dialog: Locator,
  parts: { heading: string; field: Locator; buttons: string[] },
  where: string,
) => {
  const size = page.viewportSize() ?? { width: 0, height: 0 };
  for (const width of [size.width, ...WIDTHS]) {
    await page.setViewportSize({ width, height: size.height });
    const at = `${where} at ${width}px`;
    const overflow = await measureOverflow(page);
    expect(overflows(overflow), `${at}: ${describeOverflow(overflow)}`).toBe(false);
    await parts.field.focus();
    await onScreen(page, dialog.getByRole("heading", { name: parts.heading }), `${at}: title`);
    await onScreen(page, parts.field, `${at}: field`);
    for (const name of parts.buttons)
      await onScreen(page, dialog.getByRole("button", { name, exact: true }), `${at}: ${name}`);
  }
  await page.setViewportSize(size);
};

test("root's override dialogs fit a phone in each language", async ({
  page,
  playwright,
}, testInfo) => {
  const email = mobileUser(testInfo, "overrideRoot");
  const name = `override-${testInfo.project.name}`;
  const item = `@${E2E_SCOPE}/${name}`;

  // Root's own submission, through the drafts API (037, 052).
  const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  const token = await api.post("/api/v1/auth/token", {
    data: { email, password: E2E_PASSWORD, name: "override" },
  });
  expect(token.status()).toBe(201);
  const headers = { authorization: `Bearer ${(await token.json()).token}` };
  const description = "Approved by its own author, root.";
  const upload = await api.post("/api/v1/drafts", {
    headers,
    data: {
      name: item,
      type: "skill",
      files: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: `name: "${item}"\ntype: skill\ndescription: ${description}\nlicense: MIT\n`,
        },
        {
          path: "SKILL.md",
          encoding: "utf8",
          content: `---\nname: ${name}\ndescription: ${description}\n---\nApprove me.\n`,
        },
      ],
    },
  });
  expect(upload.status()).toBe(201);
  const id = (await upload.json()).id as string;
  const submitted = await api.post("/api/v1/drafts/submit", { headers, data: { ids: [id] } });
  expect(submitted.ok()).toBe(true);
  await api.dispose();

  await signIn(page, email);
  for (const locale of ["en", "pt", "fr"] as const) {
    const words = WORDS[locale];
    await page
      .context()
      .addCookies([
        { name: "ronne-locale", value: locale, url: testInfo.project.use.baseURL ?? "/" },
      ]);

    // The one decision: its reason under its own question, required.
    await page.goto(`/reviews/${id}`);
    await page.getByRole("button", { name: words.override, exact: true }).click();
    const one = page.getByRole("dialog", { name: words.title });
    await expect(one).toBeVisible();
    const why = one.getByLabel(words.label);
    await expect(why).toHaveAttribute("required", "");
    await sweep(
      page,
      one,
      { heading: words.title, field: why, buttons: [words.cancel, words.override] },
      `${locale} decision`,
    );
    await one.getByRole("button", { name: words.cancel, exact: true }).click();
    await expect(one).toBeHidden();

    // Approve many with root's own selected: the message is the reason, required.
    await page.goto(`/reviews?q=${name}`);
    await page.getByRole("checkbox", { name: `${words.select} ${item}` }).check();
    await page.getByRole("button", { name: words.approveSelected, exact: true }).click();
    const many = page.getByRole("dialog", { name: words.bulkTitle });
    await expect(many).toBeVisible();
    await expect(many.getByText(words.required)).toBeVisible();
    const reason = many.locator("#bulk-approve-message");
    await expect(reason).toHaveAttribute("required", "");
    await expect(many.getByRole("button", { name: words.bulkSubmit, exact: true })).toBeDisabled();
    await sweep(
      page,
      many,
      { heading: words.bulkTitle, field: reason, buttons: [words.cancel, words.bulkSubmit] },
      `${locale} approve many`,
    );
    await many.getByRole("button", { name: words.cancel, exact: true }).click();
    await expect(many).toBeHidden();
  }
});
