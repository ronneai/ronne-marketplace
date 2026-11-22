// Keeps the features' lists true to their folders (feature 199): every feature has one row in the
// index (docs/features/README.md) and one in a milestone file (docs/features/milestones/), both
// linking to its folder and giving the same status (the index without the status's note), and its folder is under the domain
// docs/features/domains.json gives it. Also checks that the relative links in the documentation
// land on a file that exists. Run by `pnpm docs:check` (check-docs-index.js).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { featureFolders, splitRow } from "./witness.js";

export const FEATURES_DIR = "docs/features";
export const MILESTONES_DIR = `${FEATURES_DIR}/milestones`;
export const DOMAINS_FILE = `${FEATURES_DIR}/domains.json`;
const TEMPLATE_DIR = `${FEATURES_DIR}/_template`;
/** Where a copy of the template goes, for reading the template's links. */
const COPY_DIR = `${FEATURES_DIR}/domain/000-feature`;

/** A domain's folder name; `witness.js` reads the same. */
export const DOMAIN_NAME = /^[a-z][a-z0-9-]*$/;

const ROW = /^\| (?:\[(\d{3})\]\(([^)\s]+)\)|(\d{3})) \|/;

/**
 * The feature rows of a page's tables: a row whose first cell is a 3-digit ID, linked to the
 * feature's spec (`[191](path)`) or, for a planned feature with no folder yet, plain (`116`).
 * @returns {{ id: string, target: string | null, status: string, line: number }[]}
 */
export const featureRows = (text) =>
  text.split("\n").flatMap((line, i) => {
    const match = ROW.exec(line);
    if (!match) return [];
    const cells = splitRow(line);
    return [
      {
        id: match[1] ?? match[3],
        target: match[2] ?? null,
        status: cells.at(-1) ?? "",
        line: i + 1,
      },
    ];
  });

/** A status without its note in brackets: the index gives `done` for `done (the Documentation in …)`. */
export const statusWithoutNote = (status) => {
  const bracket = status.indexOf(" (");
  return bracket === -1 ? status : status.slice(0, bracket);
};

/**
 * What's wrong between the feature folders and the lists of them.
 * @param {{
 *   folders: { id: number, folder: string }[],
 *   domains: { domains: Record<string, string>, features: Record<string, string> },
 *   index: string,
 *   milestones: { file: string, text: string }[],
 * }} input `folder` and `file` are paths from the repository's root
 */
export const checkFeatureLists = ({ folders, domains, index, milestones }) => {
  const errors = [];
  const indexFile = `${FEATURES_DIR}/README.md`;
  const lists = [
    { name: indexFile, rows: featureRows(index).map((row) => ({ ...row, file: indexFile })) },
    {
      name: `a file in ${MILESTONES_DIR}/`,
      rows: milestones.flatMap(({ file, text }) =>
        featureRows(text).map((row) => ({ ...row, file })),
      ),
    },
  ];
  const folderOf = new Map();
  for (const { id, folder } of folders) {
    const key = String(id).padStart(3, "0");
    if (folderOf.has(key))
      errors.push(`feature ${key} has more than one folder: ${folderOf.get(key)}, ${folder}`);
    else folderOf.set(key, folder);
  }
  for (const name of Object.keys(domains.domains))
    if (!DOMAIN_NAME.test(name))
      errors.push(
        `${DOMAINS_FILE}: "${name}" isn't a domain name (lowercase letters, digits and -)`,
      );

  for (const [id, folder] of folderOf) {
    const domain = folder.split("/")[2];
    const listed = domains.features[id];
    if (listed === undefined) errors.push(`${DOMAINS_FILE} has no domain for feature ${id}`);
    else if (listed !== domain)
      errors.push(`${folder} is under ${domain}, but ${DOMAINS_FILE} puts ${id} under ${listed}`);
    if (!(domain in domains.domains))
      errors.push(`${folder}: "${domain}" isn't a domain in ${DOMAINS_FILE}`);
  }
  for (const [id, domain] of Object.entries(domains.features))
    if (!folderOf.has(id))
      errors.push(`${DOMAINS_FILE} gives ${id} a domain (${domain}) but it has no folder`);

  const ids = new Set([...folderOf.keys(), ...lists.flatMap(({ rows }) => rows.map((r) => r.id))]);
  for (const id of [...ids].sort()) {
    const found = lists.map(({ name, rows }) => {
      const mine = rows.filter((row) => row.id === id);
      if (mine.length === 0) errors.push(`feature ${id} has no row in ${name}`);
      if (mine.length > 1)
        errors.push(
          `feature ${id} has ${mine.length} rows: ${mine.map((r) => `${r.file}:${r.line}`).join(", ")}`,
        );
      return mine[0];
    });
    const folder = folderOf.get(id);
    for (const row of found) {
      if (!row) continue;
      const where = `${row.file}:${row.line}`;
      if (folder && row.target === null)
        errors.push(`${where}: feature ${id} has a folder, so link it`);
      if (row.target !== null) {
        const lands = posix.normalize(posix.join(posix.dirname(row.file), row.target));
        if (lands !== `${folder}/SPEC.md`)
          errors.push(
            `${where}: feature ${id} links to ${lands}, not ${folder ?? "a folder"}/SPEC.md`,
          );
      }
    }
    const [inIndex, inMilestone] = found;
    if (inIndex && inMilestone && inIndex.status !== statusWithoutNote(inMilestone.status))
      errors.push(
        `feature ${id} is "${inIndex.status}" in ${inIndex.file}:${inIndex.line} but "${inMilestone.status}" in ${inMilestone.file}:${inMilestone.line}`,
      );
  }
  return errors;
};

/**
 * The relative links in a Markdown page, outside code: `{ target, section, line }`, the `#section`
 * apart (`undefined` without one): inline links (`[a](b.md)`) and reference definitions (`[a]: b.md`). Web addresses, `mailto:`
 * and links within the page are left out, and so are code (fenced with ``` or ~~~, or in backticks)
 * and HTML comments.
 * A loop over each line, not one regular expression over the page, so it stays linear on any text.
 */
export const relativeLinks = (text) => {
  const links = [];
  const relative = (target) => target !== "" && !/^[a-z][a-z0-9+.-]*:/i.test(target);
  let fence = null;
  let comment = false;
  text.split("\n").forEach((raw, i) => {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(raw)?.[1];
    if (fence !== null) {
      // A fence closes with the same character, at least as many times.
      if (
        marker &&
        marker[0] === fence[0] &&
        marker.length >= fence.length &&
        raw.trim() === marker
      )
        fence = null;
      return;
    }
    let text = raw;
    if (comment) {
      const close = text.indexOf("-->");
      if (close === -1) return;
      comment = false;
      text = text.slice(close + 3);
    } else if (marker) {
      fence = marker;
      return;
    }
    // HTML comments: whole ones go, and one left open runs on to its `-->` on a later line.
    text = text.replace(/<!--[\s\S]*?-->/g, "");
    const open = text.indexOf("<!--");
    if (open !== -1) {
      comment = true;
      text = text.slice(0, open);
    }
    const definition = /^\s{0,3}\[[^\]]+\]:\s*<?([^\s>]+)/.exec(text);
    if (definition) {
      const [target, section] = definition[1].split("#");
      if (relative(target)) links.push({ target, section, line: i + 1 });
      return;
    }
    const line = text.replace(/`[^`]*`/g, "");
    let at = line.indexOf("](");
    while (at !== -1) {
      let end = at + 2;
      while (end < line.length && !/[\s)]/.test(line[end])) end++;
      const [target, section] = line.slice(at + 2, end).split("#");
      if (relative(target)) links.push({ target, section, line: i + 1 });
      at = line.indexOf("](", end);
    }
  });
  return links;
};

/**
 * The sections a page's links can name: each heading as GitHub makes its anchor (lowercase, spaces
 * to `-`, punctuation dropped, `-1`, `-2` on repeats), and each `<a id>` or `<a name>`.
 */
export const headingAnchors = (text) => {
  const anchors = new Set();
  const seen = new Map();
  let fence = null;
  for (const raw of text.split("\n")) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(raw)?.[1];
    if (fence !== null) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (marker) {
      fence = marker;
      continue;
    }
    const heading = /^#{1,6} (.*)$/.exec(raw);
    if (heading) {
      const base = heading[1]
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}_\- ]/gu, "")
        .replaceAll(" ", "-");
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      anchors.add(n === 0 ? base : `${base}-${n}`);
    }
    for (const match of raw.matchAll(/<a (?:id|name)="([^"]+)"/g)) anchors.add(match[1]);
  }
  return anchors;
};

/**
 * The relative links that land nowhere, in the pages at `files` (paths from the repository's
 * root). A `WITNESS.md` isn't read: it quotes what a check was given, made-up links included. A
 * link to a `WITNESS.md` is fine before the first pass writes it, as long as its folder exists. A
 * link to a section of a Markdown page needs the page to have it. The links in the template's
 * files (its README aside, which stays) are read from where a copy goes,
 * `docs/features/<domain>/<NNN-slug>/`.
 * @param {string[]} files
 * @param {(path: string) => string} read
 * @param {(path: string) => boolean} exists
 */
export const checkLinks = (files, read, exists) => {
  const anchors = new Map();
  const anchorsOf = (path) => {
    if (!anchors.has(path)) anchors.set(path, headingAnchors(read(path)));
    return anchors.get(path);
  };
  return files
    .filter((file) => file.endsWith(".md") && posix.basename(file) !== "WITNESS.md")
    .flatMap((file) => {
      const template = file.startsWith(`${TEMPLATE_DIR}/`) && posix.basename(file) !== "README.md";
      const from = template ? COPY_DIR : posix.dirname(file);
      // A copy's own files are the template's, beside it.
      const landing = (target) => {
        const path = posix.normalize(posix.join(from, target));
        return template && path.startsWith(`${COPY_DIR}/`)
          ? `${TEMPLATE_DIR}/${path.slice(COPY_DIR.length + 1)}`
          : path;
      };
      return relativeLinks(read(file)).flatMap(({ target, section, line }) => {
        const path = landing(target);
        const witness = posix.basename(path) === "WITNESS.md";
        if (witness ? !exists(posix.dirname(path)) : !exists(path))
          return [`${file}:${line}: the link to ${target} lands nowhere`];
        if (section && !witness && path.endsWith(".md") && !anchorsOf(path).has(section))
          return [`${file}:${line}: ${path} has no section #${section}`];
        return [];
      });
    });
};

/** The domains file, or `null` when it's missing. */
const readDomains = (root) => {
  const path = join(root, ...DOMAINS_FILE.split("/"));
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
};

/** Every problem with the feature lists in the repository at `root`. */
export const featureListProblems = (root) => {
  const domains = readDomains(root);
  if (domains === null) return [`${DOMAINS_FILE} is missing`];
  const indexPath = join(root, ...FEATURES_DIR.split("/"), "README.md");
  if (!existsSync(indexPath)) return [`${FEATURES_DIR}/README.md is missing`];
  const milestonesPath = join(root, ...MILESTONES_DIR.split("/"));
  const milestones = existsSync(milestonesPath)
    ? readdirSync(milestonesPath)
        .filter((name) => name.endsWith(".md") && name !== "README.md")
        .map((name) => ({
          file: `${MILESTONES_DIR}/${name}`,
          text: readFileSync(join(milestonesPath, name), "utf8"),
        }))
    : [];
  return checkFeatureLists({
    folders: featureFolders(root).folders,
    domains,
    index: readFileSync(indexPath, "utf8"),
    milestones,
  });
};

/** The Markdown files whose links are checked: the docs, the root's pages, `.github` and `.claude`. */
export const linkedPages = (files) =>
  files.filter(
    (file) =>
      file.endsWith(".md") && (!file.includes("/") || /^(docs|\.github|\.claude)\//.test(file)),
  );

/** The broken links in the pages at `files`, read from `root`. */
export const linkProblems = (root, files) =>
  checkLinks(
    linkedPages(files),
    (file) => readFileSync(join(root, file), "utf8"),
    (path) => existsSync(join(root, path)),
  );
