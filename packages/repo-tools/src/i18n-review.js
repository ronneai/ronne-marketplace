#!/usr/bin/env node
// Writes the messages for a native reader (feature 133): one Markdown file and one CSV per
// namespace under docs/features/133-languages-signoff/review/ (git-ignored), English beside
// Portuguese and French, with the key and the screen it belongs to. Generated from the message
// files, never edited by hand: a correction is made in the message file and this is run again.
//
//   pnpm i18n:review
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appTopics, pageUrl, SITE } from "./docs-links.js";

export const LOCALES = ["en", "pt", "fr"];

/** The messages of a tree, flattened to `[key, text]` in file order: `a.b.c` → "Text". */
export const flatten = (value, prefix = "") =>
  typeof value === "string"
    ? [[prefix, value]]
    : Object.entries(value).flatMap(([key, child]) =>
        flatten(child, prefix ? `${prefix}.${key}` : key),
      );

/** The rows of one namespace: key, English, Portuguese, French (an empty cell for a missing one). */
export const rowsOf = (trees) => {
  const [en, pt, fr] = LOCALES.map((locale) => new Map(flatten(trees[locale])));
  return [...en.keys()].map((key) => ({
    key,
    screen: key.split(".").slice(0, 2).join("."),
    en: en.get(key) ?? "",
    pt: pt.get(key) ?? "",
    fr: fr.get(key) ?? "",
  }));
};

const cell = (text) => text.replaceAll("|", "\\|").replaceAll("\n", " ");
const csv = (text) => `"${text.replaceAll('"', '""')}"`;

export const toMarkdown = (namespace, rows) =>
  [
    `# ${namespace}`,
    "",
    `${rows.length} messages. Read the Portuguese and the French against the English. ` +
      "ICU parts (`{name}`, `{count, plural, …}`, `<b>…</b>`) are the program's: leave them as they are.",
    "",
    "| Key | English | Português | Français |",
    "|---|---|---|---|",
    ...rows.map(
      (row) => `| \`${row.key}\` | ${cell(row.en)} | ${cell(row.pt)} | ${cell(row.fr)} |`,
    ),
    "",
  ].join("\n");

export const toCsv = (rows) =>
  [
    "key,screen,english,portuguese,french",
    ...rows.map((row) => [row.key, row.screen, row.en, row.pt, row.fr].map(csv).join(",")),
    "",
  ].join("\n");

/** The glossary table of `docs/knowledge/i18n.md`, as a file of its own for the readers. */
export const glossaryOf = (source) => {
  const start = source.indexOf("## Glossary");
  const section = start < 0 ? "" : source.slice(start);
  const lines = section.split("\n");
  const first = lines.findIndex((line) => line.startsWith("| English"));
  if (first < 0) return "# Glossary\n\n(The glossary was not found.)\n";
  const table = [];
  for (const line of lines.slice(first)) {
    if (!line.startsWith("|")) break;
    table.push(line);
  }
  return `# Glossary\n\nThe words held the same everywhere. Say so if one is wrong.\n\n${table.join("\n")}\n`;
};

/** The website's pages the readers also go through: every topic, in Portuguese and French. */
export const websitePages = (topics) =>
  [
    "# The website's Documentation",
    "",
    "Read each page in your language, with its own guide: `ronne-web/docs/translation-guide.md`.",
    "The home and marketplace texts are in `ronne-web/www/messages/pt.json` and `fr.json`.",
    "",
    "| Topic | Português | Français |",
    "|---|---|---|",
    ...topics.map(
      ({ slug }) => `| ${slug} | ${pageUrl(SITE, "pt", slug)} | ${pageUrl(SITE, "fr", slug)} |`,
    ),
    "",
  ].join("\n");

const main = () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const messages = join(root, "apps/web/messages");
  const out = join(root, "docs/features/133-languages-signoff/review");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const namespaces = readdirSync(join(messages, "en"))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length))
    .sort();
  let total = 0;
  for (const namespace of namespaces) {
    const trees = Object.fromEntries(
      LOCALES.map((locale) => [
        locale,
        JSON.parse(readFileSync(join(messages, locale, `${namespace}.json`), "utf8")),
      ]),
    );
    const rows = rowsOf(trees);
    total += rows.length;
    writeFileSync(join(out, `${namespace}.md`), toMarkdown(namespace, rows));
    writeFileSync(join(out, `${namespace}.csv`), toCsv(rows));
  }
  writeFileSync(
    join(out, "GLOSSARY.md"),
    glossaryOf(readFileSync(join(root, "docs/knowledge/i18n.md"), "utf8")),
  );
  writeFileSync(
    join(out, "WEBSITE.md"),
    websitePages(
      appTopics(readFileSync(join(root, "apps/web/src/components/help/topics.ts"), "utf8")),
    ),
  );
  console.log(`Wrote ${namespaces.length} namespaces, ${total} messages, to ${out}`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
