#!/usr/bin/env node
// Checks that the Documentation links in the app land on a page that exists, in every language
// (feature 133). The app links by topic and section (`docsHref("scopes", "names")`), and TypeScript
// already makes those match the app's own topic list (apps/web/src/components/help/topics.ts); what
// can drift is the website, in ../ronne-web, which has the same topics and section ids and the
// pages in English, Portuguese and French.
//
//   node packages/repo-tools/src/docs-links.js                 app topics against ../ronne-web
//   node packages/repo-tools/src/docs-links.js --live [base]   every page and section on the site
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const LOCALES = ["en", "pt", "fr"];
export const SITE = "https://www.ronne.ai";

const TOPICS_FILE = "apps/web/src/components/help/topics.ts";
const SITE_TOPICS_FILE = "www/src/content/docs/topics.ts";

/** The app's topics: `[{ slug, sections: [id] }]`, read from its topic list (the words don't matter here). */
export const appTopics = (source) =>
  source
    .split(/\bslug: "/)
    .slice(1)
    .map((chunk) => ({
      slug: chunk.slice(0, chunk.indexOf('"')),
      sections: [...chunk.matchAll(/\{ id: "([^"]+)"/g)].map((match) => match[1]),
    }))
    // The list also holds the topic groups further down the file; those have no sections.
    .filter((topic) => topic.sections.length > 0);

/** The website's topics, from the `docsTopics` array in its `topics.ts`. */
export const siteTopics = (source) => {
  const start = source.indexOf("export const docsTopics");
  const end = source.indexOf("] as const", start);
  return source
    .slice(start, end)
    .split(/\bslug: "/)
    .slice(1)
    .map((chunk) => {
      const list = chunk.slice(chunk.indexOf("sections: ["));
      return {
        slug: chunk.slice(0, chunk.indexOf('"')),
        sections: [...list.slice(0, list.indexOf("]")).matchAll(/"([^"]+)"/g)].map((m) => m[1]),
      };
    });
};

/** What differs between the two lists, in words. */
export const compareTopics = (app, site) => {
  const problems = [];
  const siteBySlug = new Map(site.map((topic) => [topic.slug, topic]));
  const appSlugs = new Set(app.map((topic) => topic.slug));
  for (const topic of app) {
    const other = siteBySlug.get(topic.slug);
    if (!other) {
      problems.push(`the website has no topic "${topic.slug}"`);
      continue;
    }
    for (const id of topic.sections)
      if (!other.sections.includes(id))
        problems.push(`the website's "${topic.slug}" has no section "${id}"`);
    for (const id of other.sections)
      if (!topic.sections.includes(id))
        problems.push(`the app's "${topic.slug}" has no section "${id}" (the website does)`);
  }
  for (const topic of site)
    if (!appSlugs.has(topic.slug)) problems.push(`the app has no topic "${topic.slug}"`);
  return problems;
};

/** The address of a topic's page in a language (the overview is the Documentation's own address). */
export const pageUrl = (base, locale, slug) =>
  `${base}/${locale}/marketplace/docs${slug === "overview" ? "" : `/${slug}`}`;

/** Every page of every language the app can link to, with the section ids it must show. */
export const pagesOf = (topics, base = SITE) =>
  LOCALES.flatMap((locale) =>
    topics.map((topic) => ({ url: pageUrl(base, locale, topic.slug), sections: topic.sections })),
  );

/**
 * Documentation addresses written out in the packages (the server's Windows help, say) rather than
 * built with `docsHref`, which TypeScript checks; returns what each points at that the app's topic
 * list does not have.
 */
export const writtenLinkProblems = (root, topics) => {
  const problems = [];
  const pattern = /https:\/\/www\.ronne\.ai\/marketplace\/docs(?:\/([a-z-]+))?(?:#([a-z-]+))?/g;
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(path);
      return /\.(ts|tsx|js)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
    });
  for (const file of readdirSync(join(root, "packages")).flatMap((name) => {
    const src = join(root, "packages", name, "src");
    return existsSync(src) ? walk(src) : [];
  })) {
    if (file.endsWith("docs-links.js")) continue;
    for (const [link, slug = "overview", section] of readFileSync(file, "utf8").matchAll(pattern)) {
      const topic = topics.find((candidate) => candidate.slug === slug);
      if (!topic) problems.push(`${file.slice(root.length + 1)}: ${link} has no such topic`);
      else if (section && !topic.sections.includes(section))
        problems.push(`${file.slice(root.length + 1)}: ${link} has no such section`);
    }
  }
  return problems;
};

const repoRoot = () => join(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Opens every page and looks for every section id; returns the problems found. */
export const checkLive = async (topics, base = SITE, fetchPage = fetch) => {
  const problems = [];
  for (const { url, sections } of pagesOf(topics, base)) {
    const response = await fetchPage(url).catch((error) => ({ status: 0, error }));
    if (response.status !== 200) {
      problems.push(`${url} answered ${response.status}`);
      continue;
    }
    const html = await response.text();
    for (const id of sections)
      if (!html.includes(`id="${id}"`)) problems.push(`${url} has no section "${id}"`);
  }
  return problems;
};

const fail = (problems) => {
  console.error("✗ docs-links: the Documentation links don't land\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
};

const main = async () => {
  const root = repoRoot();
  const app = appTopics(readFileSync(join(root, TOPICS_FILE), "utf8"));
  const args = process.argv.slice(2);
  const problems = writtenLinkProblems(root, app);
  if (args[0] === "--live") {
    problems.push(...(await checkLive(app, args[1] ?? SITE)));
    console.log(`Opened ${pagesOf(app, args[1] ?? SITE).length} pages.`);
  } else {
    const web = join(root, "..", "ronne-web", SITE_TOPICS_FILE);
    if (!existsSync(web)) {
      console.log(`Skipped: ../ronne-web is not next to this repository (${web}).`);
      if (problems.length > 0) fail(problems);
      return;
    }
    problems.push(...compareTopics(app, siteTopics(readFileSync(web, "utf8"))));
    console.log(`Compared ${app.length} topics with the website's.`);
  }
  if (problems.length > 0) fail(problems);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
