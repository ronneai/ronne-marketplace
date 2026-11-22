// Keeps the contributor documentation's lists complete (feature 187): CONTRIBUTING.md names every
// script in the root package.json, every note in docs/knowledge/ is listed in its README, and every
// file the README lists is a note. It reads only Markdown and package.json, so it runs like the
// witness check, documentation-only changes included. The features' lists and the documentation's
// links are checked in features-index.js (feature 199).
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { featureListProblems, linkProblems } from "./features-index.js";

export const KNOWLEDGE_DIR = "docs/knowledge";

/**
 * The notes the index links to: links to a `.md` file in the same folder (`a.md`, `./a.md`,
 * `a.md#section`). A loop, not a regular expression, so it stays linear on any text.
 */
export const listedNotes = (index) => {
  const notes = new Set();
  let at = index.indexOf("](");
  while (at !== -1) {
    const end = index.indexOf(")", at + 2);
    if (end === -1) break;
    let target = index.slice(at + 2, end);
    const hash = target.indexOf("#");
    if (hash !== -1) target = target.slice(0, hash);
    if (target.startsWith("./")) target = target.slice(2);
    if (target.endsWith(".md") && !target.includes("/") && !/\s/.test(target)) notes.add(target);
    at = index.indexOf("](", end);
  }
  return notes;
};

/**
 * What's wrong between the notes in the folder and the ones the index lists.
 * @param {string[]} notes the `.md` files in the folder, the index excluded
 * @param {string} index the index's text
 */
export const checkKnowledgeIndex = (notes, index) => {
  const listed = listedNotes(index);
  const present = new Set(notes);
  return [
    ...notes
      .filter((note) => !listed.has(note))
      .map((note) => `${KNOWLEDGE_DIR}/${note} isn't listed in ${KNOWLEDGE_DIR}/README.md`),
    ...[...listed]
      .filter((note) => !present.has(note))
      .map((note) => `${KNOWLEDGE_DIR}/README.md lists ${note}, which isn't a note there`),
  ];
};

/**
 * The first cell of every table row in the page's `## Commands` section: where a command has its
 * row. Mentions in the prose, or in another row's description, don't count.
 */
export const commandCells = (contributing) => {
  const lines = contributing.split("\n");
  const start = lines.findIndex((line) => line.trim() === "## Commands");
  if (start === -1) return [];
  const end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .filter((line) => line.startsWith("| `"))
    .map((line) => line.slice(1, line.indexOf("|", 1)));
};

/**
 * The root scripts CONTRIBUTING.md has no row for. A row names a script when its first cell has
 * `` `pnpm <name> `` or `` `pnpm run <name> `` followed by a backtick or a space, so `test` isn't
 * named by `pnpm test:db`.
 * @param {string[]} scripts the root package.json's script names
 * @param {string} contributing the page's text
 */
export const checkContributing = (scripts, contributing) => {
  const cells = commandCells(contributing);
  return scripts
    .filter(
      (name) =>
        !cells.some((cell) =>
          ["`pnpm ", "`pnpm run "].some((prefix) =>
            ["`", " "].some((end) => cell.includes(`${prefix}${name}${end}`)),
          ),
        ),
    )
    .map((name) => `CONTRIBUTING.md's Commands has no row for the root script "${name}"`);
};

const knowledgeProblems = (root) => {
  const dir = join(root, ...KNOWLEDGE_DIR.split("/"));
  const indexPath = join(dir, "README.md");
  if (!existsSync(indexPath)) return [`${KNOWLEDGE_DIR}/README.md is missing`];
  const notes = readdirSync(dir).filter((name) => name.endsWith(".md") && name !== "README.md");
  return checkKnowledgeIndex(notes, readFileSync(indexPath, "utf8"));
};

const contributingProblems = (root) => {
  const path = join(root, "CONTRIBUTING.md");
  if (!existsSync(path)) return ["CONTRIBUTING.md is missing"];
  const scripts = Object.keys(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts);
  return checkContributing(scripts, readFileSync(path, "utf8"));
};

/** The files git tracks or would track (not the ignored ones), that are still on disk. */
const repositoryFiles = (root) =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter((file) => file !== "" && existsSync(join(root, file)));

/** Every problem in the repository at `root`. */
export const checkAll = (root) => [
  ...contributingProblems(root),
  ...knowledgeProblems(root),
  ...featureListProblems(root),
  ...linkProblems(root, repositoryFiles(root)),
];
