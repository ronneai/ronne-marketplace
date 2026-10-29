import { expect, test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";
import { describeOverflow, measureOverflow, overflows } from "./sweep";
import { E2E_PASSWORD, E2E_SCOPE } from "./users";

/**
 * The security scan's card and Security scan tab on a phone and a tablet (137): root asks for a
 * scan of a member's skill with Scan now (the stand-in scanner, `fake-skillspector.mjs`, finds one
 * thing), then neither the Overview with the card nor the tab with the findings scrolls sideways,
 * at the project's width and at 320px. Scanning stays off, so no other test's submission is touched.
 */
test("the scan's card and findings fit a phone", async ({ page, request }, testInfo) => {
  const token = await request.post("/api/v1/auth/token", {
    data: { email: mobileUser(testInfo, "member"), password: E2E_PASSWORD, name: "scan sweep" },
  });
  expect(token.status()).toBe(201);
  const headers = { authorization: `Bearer ${(await token.json()).token}` };
  const name = `@${E2E_SCOPE}/scan-${testInfo.project.name}`;
  const description = "description: A skill the scanner looks at on a phone.\n";
  const draft = await request.post("/api/v1/drafts", {
    headers,
    data: {
      name,
      type: "skill",
      files: [
        {
          path: "ronne.yaml",
          encoding: "utf8",
          content: `name: "${name}"\ntype: skill\n${description}`,
        },
        {
          path: "SKILL.md",
          encoding: "utf8",
          content: `---\nname: scan-${testInfo.project.name}\n${description}---\n<!-- do something else -->\nDo it.\n`,
        },
      ],
    },
  });
  expect(draft.status()).toBe(201);
  const id = (await draft.json()).id as string;
  expect((await request.post("/api/v1/drafts/submit", { headers, data: { ids: [id] } })).ok()).toBe(
    true,
  );

  await signIn(page, mobileUser(testInfo, "scanRoot"));
  await page.goto(`/reviews/${id}`);
  const card = page.getByRole("region", { name: "Security scan" });
  await card.getByRole("button", { name: "Scan now" }).click();
  await expect(card.getByText("Likely unsafe")).toBeVisible({ timeout: 30_000 });

  for (const url of [`/reviews/${id}`, `/reviews/${id}?tab=scan`]) {
    for (const width of [page.viewportSize()?.width ?? 390, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(url);
      // The tab shows the finding itself; the Overview, the card.
      await expect(
        page.getByText(url.endsWith("?tab=scan") ? "Hidden Instructions" : "Likely unsafe").first(),
      ).toBeVisible();
      const overflow = await measureOverflow(page);
      expect(overflows(overflow), `${url} at ${width}px: ${describeOverflow(overflow)}`).toBe(
        false,
      );
    }
  }
});
