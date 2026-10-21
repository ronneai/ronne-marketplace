import { writeFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { type MobileRole, mobileUser, signIn } from "./mobile";
import { MIGRATED_ROUTES, SWEEP_PAGES, type SweepData, type SweepRole } from "./pages";
import {
  describeOverflow,
  measureOverflow,
  overflows,
  type SmallTarget,
  smallTargets,
  squeezedColumns,
} from "./sweep";
import { E2E_PASSWORD, E2E_SCOPE } from "./users";

/**
 * The phone sweep (feature 065): every page in `pages.ts`, for each role, at this project's width
 * and at 360px and 320px. A page must never scroll sideways, and nothing may stick out of the
 * viewport outside a frame that scrolls. It also writes a report of controls under 44px.
 *
 * Pages that still fail are listed in EXPECTED_FAILURES with the M10 feature that fixes them.
 * When a fix lands, remove the entry: an entry for a page that now passes fails the sweep too.
 */

/** URL → the feature fixing it, and (if not every project fails it) the projects that do. */
const EXPECTED_FAILURES: Record<string, { fixedBy: string; projects?: readonly string[] }> = {
  // The first two sections don't shrink below about 366px; with 16px fields on touch (067) that's
  // wider than 360px and 320px phones in every engine.
  "/submissions/new": { fixedBy: "072" },
};

const WIDTHS = [360, 320] as const;
const ROLES: readonly SweepRole[] = ["member", "moderator", "root"];

type Result = { url: string; role: SweepRole; width: number; problem: string | null };
let data: SweepData = { draftId: "", submissionId: "", personal: "", userId: "" };

test.describe.configure({ mode: "serial" });

// A draft of the member's and one in review, made through the drafts API (037, 052) with this
// project's member, so each project has its own.
test.beforeAll(async ({ playwright }, testInfo) => {
  const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  const token = await api.post("/api/v1/auth/token", {
    data: { email: mobileUser(testInfo, "member"), password: E2E_PASSWORD, name: "sweep" },
  });
  expect(token.status()).toBe(201);
  const headers = { authorization: `Bearer ${(await token.json()).token}` };
  const draft = async (suffix: string) => {
    const name = `@${E2E_SCOPE}/sweep-${testInfo.project.name}-${suffix}`;
    const description = "Made by the phone sweep.";
    const upload = await api.post("/api/v1/drafts", {
      headers,
      data: {
        name,
        type: "skill",
        files: [
          {
            path: "ronne.yaml",
            encoding: "utf8",
            content: `name: "${name}"\ntype: skill\ndescription: ${description}\nlicense: MIT\n`,
          },
          {
            path: "SKILL.md",
            encoding: "utf8",
            content: `---\nname: sweep-${testInfo.project.name}-${suffix}\ndescription: ${description}\n---\nCheck the layout.\n`,
          },
        ],
      },
    });
    expect(upload.status()).toBe(201);
    return (await upload.json()).id as string;
  };
  const draftId = await draft("draft");
  const submissionId = await draft("review");
  const submitted = await api.post("/api/v1/drafts/submit", {
    headers,
    data: { ids: [submissionId] },
  });
  expect(submitted.ok()).toBe(true);
  // Their id, for root's page about them (123).
  const me = await api.get("/api/v1/me", { headers });
  expect(me.ok()).toBe(true);
  const userId = (await me.json()).id as string;
  // Their personal workspace (114) is named from their email.
  data = {
    draftId,
    submissionId,
    personal: mobileUser(testInfo, "member").split("@")[0] ?? "",
    userId,
  };
  await api.dispose();
});

/**
 * One sweep per language (feature 129): English over every page, Portuguese and French over the
 * pages already moved to messages (`MIGRATED_ROUTES`), whose longer words are what could overflow.
 * The shared sign-in helper types English labels, so the person signs in in English and then picks
 * the language the way the sign-in page's links do: with the `ronne-locale` cookie.
 */
type Language = "en" | "pt" | "fr";
const LANGUAGES: readonly Language[] = ["en", "pt", "fr"];

const sweep = (language: Language) => {
  const tag = language === "en" ? "" : `in ${language}: `;
  const suffix = language === "en" ? "" : `-${language}`;
  const pages =
    language === "en" ? SWEEP_PAGES : SWEEP_PAGES.filter((p) => MIGRATED_ROUTES.has(p.route));
  const speak = async (page: Page, baseURL: string | undefined) => {
    if (language === "en") return;
    await page
      .context()
      .addCookies([{ name: "ronne-locale", value: language, url: baseURL ?? "/" }]);
  };
  const results: Result[] = [];
  const targets = new Map<string, { target: SmallTarget; urls: Set<string> }>();
  /** Table columns too narrow to read, by page, role and width (`squeezedColumns`). */
  const squeezed: string[] = [];
  const check = async (page: Page, url: string, role: SweepRole) => {
    const size = page.viewportSize() ?? { width: 412, height: 915 };
    await page.goto(url);
    // The language runs must really be in the language (the cookie sets it before sign-in, too).
    await expect(page.locator("html"), url).toHaveAttribute("lang", language);
    // Controls under 44px, at the device's own width.
    for (const target of await smallTargets(page)) {
      const key = `${target.element} ${target.width}×${target.height}`;
      const seen = targets.get(key) ?? { target, urls: new Set<string>() };
      seen.urls.add(url);
      targets.set(key, seen);
    }
    for (const width of [size.width, ...WIDTHS]) {
      await page.setViewportSize({ width, height: size.height });
      const overflow = await measureOverflow(page);
      for (const column of await squeezedColumns(page))
        squeezed.push(`${url} as ${role} at ${width}px: ${column}`);
      results.push({
        url,
        role,
        width,
        problem: overflows(overflow) ? describeOverflow(overflow) : null,
      });
    }
    await page.setViewportSize(size);
  };

  test(`${tag}signed out`, async ({ page, baseURL }) => {
    await speak(page, baseURL);
    for (const sweepPage of pages.filter((p) => p.roles === "signedOut" && !p.skip))
      for (const url of sweepPage.urls(data, "member")) await check(page, url, "member");
  });

  for (const role of ROLES)
    test(`${tag}as ${role}`, async ({ page, baseURL }, testInfo) => {
      await signIn(page, mobileUser(testInfo, role as MobileRole));
      await speak(page, baseURL);
      for (const sweepPage of pages) {
        if (sweepPage.skip || sweepPage.roles === "signedOut" || !sweepPage.roles.includes(role))
          continue;
        for (const url of sweepPage.urls(data, role)) await check(page, url, role);
      }
      // The 404 page isn't a page.tsx, so the list doesn't have it; its text is new in three languages.
      if (role === "member") await check(page, "/this-page-does-not-exist", role);
    });

  test(`${tag}no page scrolls sideways, except the ones listed with their fix`, async ({
    page: _,
  }, testInfo) => {
    const project = testInfo.project.name;
    const expected = (url: string) => {
      const entry = EXPECTED_FAILURES[url];
      return entry && (!entry.projects || entry.projects.includes(project)) ? entry : undefined;
    };
    const failing = results.filter((r) => r.problem && !expected(r.url));
    const failingUrls = new Set(results.filter((r) => r.problem).map((r) => r.url));
    const sweptUrls = new Set(results.map((r) => r.url));
    // Only a page this run swept can be stale: the language runs open the migrated pages alone.
    const stale = Object.keys(EXPECTED_FAILURES).filter(
      (url) => expected(url) && sweptUrls.has(url) && !failingUrls.has(url),
    );

    const report = [...targets.values()]
      .sort((a, b) => a.target.height - b.target.height || a.target.width - b.target.width)
      .map(
        ({ target, urls }) =>
          `${target.width}×${target.height}${Math.min(target.width, target.height) < 24 ? " (<24)" : ""}  ${target.element}  — ${[...urls].slice(0, 3).join(", ")}${urls.size > 3 ? ` +${urls.size - 3}` : ""}`,
      )
      .join("\n");
    const overflow = results
      .filter((r) => r.problem)
      .map((r) => `${r.url} as ${r.role} at ${r.width}px: ${r.problem}`)
      .join("\n");
    // Files as well as attachments, so they can be read without the HTML report (CI uploads them).
    for (const [name, body] of [
      [`touch-targets${suffix}.txt`, report],
      [`overflow${suffix}.txt`, overflow],
    ] as const) {
      writeFileSync(testInfo.outputPath(name), body);
      await testInfo.attach(name, { body, contentType: "text/plain" });
    }

    expect(
      failing.map((r) => `${r.url} as ${r.role} at ${r.width}px: ${r.problem}`),
      "pages that scroll sideways",
    ).toEqual([]);
    expect(stale, "EXPECTED_FAILURES entries for pages that now pass: remove them").toEqual([]);
    expect(squeezed, "table columns squeezed too narrow to read").toEqual([]);
  });
};

for (const language of LANGUAGES) sweep(language);
