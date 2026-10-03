import { writeFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { type MobileRole, mobileUser, signIn } from "./mobile";
import { SWEEP_PAGES, type SweepData, type SweepRole } from "./pages";
import {
  describeOverflow,
  measureOverflow,
  overflows,
  type SmallTarget,
  smallTargets,
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
  // The first two sections are 5px too wide at 320px in Chromium (WebKit's fonts fit).
  "/submissions/new": { fixedBy: "072", projects: ["phone", "tablet"] },
};

const WIDTHS = [360, 320] as const;
const ROLES: readonly SweepRole[] = ["member", "moderator", "root"];

type Result = { url: string; role: SweepRole; width: number; problem: string | null };
const results: Result[] = [];
const targets = new Map<string, { target: SmallTarget; urls: Set<string> }>();
let data: SweepData = { draftId: "", submissionId: "" };

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
  data = { draftId, submissionId };
  await api.dispose();
});

const check = async (page: Page, url: string, role: SweepRole) => {
  const size = page.viewportSize() ?? { width: 412, height: 915 };
  await page.goto(url);
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
    results.push({
      url,
      role,
      width,
      problem: overflows(overflow) ? describeOverflow(overflow) : null,
    });
  }
  await page.setViewportSize(size);
};

test("signed out", async ({ page }) => {
  for (const sweepPage of SWEEP_PAGES.filter((p) => p.roles === "signedOut" && !p.skip))
    for (const url of sweepPage.urls(data)) await check(page, url, "member");
});

for (const role of ROLES)
  test(`as ${role}`, async ({ page }, testInfo) => {
    await signIn(page, mobileUser(testInfo, role as MobileRole));
    for (const sweepPage of SWEEP_PAGES) {
      if (sweepPage.skip || sweepPage.roles === "signedOut" || !sweepPage.roles.includes(role))
        continue;
      for (const url of sweepPage.urls(data)) await check(page, url, role);
    }
  });

test("no page scrolls sideways, except the ones listed with their fix", async ({
  page: _,
}, testInfo) => {
  const project = testInfo.project.name;
  const expected = (url: string) => {
    const entry = EXPECTED_FAILURES[url];
    return entry && (!entry.projects || entry.projects.includes(project)) ? entry : undefined;
  };
  const failing = results.filter((r) => r.problem && !expected(r.url));
  const failingUrls = new Set(results.filter((r) => r.problem).map((r) => r.url));
  const stale = Object.keys(EXPECTED_FAILURES).filter(
    (url) => expected(url) && !failingUrls.has(url),
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
    ["touch-targets.txt", report],
    ["overflow.txt", overflow],
  ] as const) {
    writeFileSync(testInfo.outputPath(name), body);
    await testInfo.attach(name, { body, contentType: "text/plain" });
  }

  expect(
    failing.map((r) => `${r.url} as ${r.role} at ${r.width}px: ${r.problem}`),
    "pages that scroll sideways",
  ).toEqual([]);
  expect(stale, "EXPECTED_FAILURES entries for pages that now pass: remove them").toEqual([]);
});
