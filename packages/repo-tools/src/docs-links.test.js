import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appTopics,
  checkLive,
  compareTopics,
  pagesOf,
  pageUrl,
  siteTopics,
  writtenLinkProblems,
} from "./docs-links.js";

const APP = `export const TOPICS = [
  {
    slug: "overview",
    title: "Overview",
    sections: [
      { id: "what", title: "What" },
      { id: "path", title: "The path" },
    ],
  },
  { slug: "update", title: "Updating", sections: [{ id: "upgrade", title: "Updating" }] },
] as const;
export const TOPIC_GROUPS = [{ label: "Getting started", topics: ["overview"] }];`;
const SITE = `export const docsTopics = [
  { slug: "overview", sections: ["what", "path"] },
  {
    slug: "update",
    sections: ["upgrade"],
  },
] as const;
export const docsGroups = [{ slug: "x", topics: ["overview"] }];`;

describe("the topic lists", () => {
  it("reads the app's topics and the website's", () => {
    expect(appTopics(APP)).toEqual([
      { slug: "overview", sections: ["what", "path"] },
      { slug: "update", sections: ["upgrade"] },
    ]);
    expect(siteTopics(SITE)).toEqual(appTopics(APP));
  });

  it("finds nothing when they agree, and says what differs when they don't", () => {
    expect(compareTopics(appTopics(APP), siteTopics(SITE))).toEqual([]);
    const site = siteTopics(
      SITE.replace('"path"', '"route"').replace('slug: "update"', 'slug: "x"'),
    );
    expect(compareTopics(appTopics(APP), site)).toEqual([
      `the website's "overview" has no section "path"`,
      `the app's "overview" has no section "route" (the website does)`,
      `the website has no topic "update"`,
      `the app has no topic "x"`,
    ]);
  });
});

describe("the pages", () => {
  it("puts the language after the site's address, and the overview at the Documentation's own", () => {
    expect(pageUrl("https://www.ronne.ai", "pt", "overview")).toBe(
      "https://www.ronne.ai/pt/marketplace/docs",
    );
    expect(pageUrl("https://www.ronne.ai", "fr", "scopes")).toBe(
      "https://www.ronne.ai/fr/marketplace/docs/scopes",
    );
    expect(pagesOf(appTopics(APP))).toHaveLength(6);
  });

  it("opens each page and looks for each section, reporting what is wrong", async () => {
    const pages = {
      "https://x/en/marketplace/docs": '<h2 id="what"></h2><h2 id="path"></h2>',
      "https://x/pt/marketplace/docs": '<h2 id="what"></h2>',
      "https://x/fr/marketplace/docs": '<h2 id="what"></h2><h2 id="path"></h2>',
      "https://x/en/marketplace/docs/update": '<h2 id="upgrade"></h2>',
      "https://x/fr/marketplace/docs/update": "gone",
    };
    const fetchPage = async (url) =>
      url in pages
        ? {
            status: url.endsWith("/fr/marketplace/docs/update") ? 404 : 200,
            text: async () => pages[url],
          }
        : { status: 404, text: async () => "" };
    expect(await checkLive(appTopics(APP), "https://x", fetchPage)).toEqual([
      'https://x/pt/marketplace/docs has no section "path"',
      "https://x/pt/marketplace/docs/update answered 404",
      "https://x/fr/marketplace/docs/update answered 404",
    ]);
  });
});

describe("the real lists", () => {
  const root = join(import.meta.dirname, "../../..");
  const web = join(root, "..", "ronne-web", "www/src/content/docs/topics.ts");
  const app = appTopics(readFileSync(join(root, "apps/web/src/components/help/topics.ts"), "utf8"));

  it("reads every topic of the app", () => {
    expect(app.length).toBeGreaterThan(20);
    expect(app.map((topic) => topic.slug)).toContain("scopes");
  });

  it("every address written out in the packages lands on a topic and section the app has", () => {
    expect(writtenLinkProblems(root, app)).toEqual([]);
  });

  it("finds a written address with a topic or section that does not exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "docs-links-"));
    mkdirSync(join(dir, "packages", "x", "src"), { recursive: true });
    writeFileSync(
      join(dir, "packages", "x", "src", "a.ts"),
      'export const A = "https://www.ronne.ai/marketplace/docs/install#windows";\n' +
        'export const B = "https://www.ronne.ai/marketplace/docs/install#nope";\n' +
        'export const C = "https://www.ronne.ai/marketplace/docs/gone";\n',
    );
    expect(writtenLinkProblems(dir, [{ slug: "install", sections: ["windows"] }])).toEqual([
      "packages/x/src/a.ts: https://www.ronne.ai/marketplace/docs/install#nope has no such section",
      "packages/x/src/a.ts: https://www.ronne.ai/marketplace/docs/gone has no such topic",
    ]);
    rmSync(dir, { recursive: true, force: true });
  });

  // The sibling repository is not there in CI (the release runbook's `docs-links --live` covers
  // the deployed site), so the title says why the test is skipped when it is.
  const here = existsSync(web);
  it.skipIf(!here)(
    here
      ? "the website has the app's topics and sections"
      : "SKIPPED: ../ronne-web is not next to this repository, so the website's topics are not compared",
    () => {
      expect(compareTopics(app, siteTopics(readFileSync(web, "utf8")))).toEqual([]);
    },
  );
});
