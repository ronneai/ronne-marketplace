import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { sha256Hex } from "@ronneai/core/pack";
import {
  type Change,
  canonicalJson,
  section,
  sectionBegin,
  sectionEnd,
  stateHash,
} from "@ronneai/core/render";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { RmkError } from "./errors.js";
import { writeJsonFile } from "./project.js";

/**
 * Applying renderers' changes to disk (feature 022, cli-files.md, MVP §3.3). Nothing is written
 * until the whole plan is known: every change is compared with `.rmk/state.json` and with what's on
 * disk now, and a file or key rmk didn't write, or the user edited since, is a conflict left alone
 * unless `--force`. Writes go through a temporary file and a rename.
 */
export type StateEntry = {
  item: string;
  version: string;
  targets: string[];
  kind: Change["kind"];
  path: string;
  key?: string[] | string;
  sha256: string;
};

export type State = { version: 1; entries: StateEntry[] };

export const emptyState = (): State => ({ version: 1, entries: [] });

export const readState = (path: string): State => {
  if (!existsSync(path)) return emptyState();
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<State>;
  return { version: 1, entries: Array.isArray(raw.entries) ? raw.entries : [] };
};

export const writeState = (path: string, state: State) => {
  const entries = [...state.entries].sort((a, b) =>
    `${a.path}\0${keyOf(a)}`.localeCompare(`${b.path}\0${keyOf(b)}`),
  );
  writeJsonFile(path, { version: 1, entries });
};

/** A wanted change, with the item and targets it comes from. */
export type Wanted = { item: string; version: string; targets: string[]; change: Change };

const keyOf = (change: { kind: string; key?: string[] | string }) =>
  change.key === undefined ? "" : Array.isArray(change.key) ? change.key.join("\0") : change.key;
const identity = (change: { kind: string; path: string; key?: string[] | string }) =>
  `${change.kind}\0${change.path}\0${keyOf(change)}`;

/** Synchronous, unlike core's `sha256Hex`: the applier compares many small values in a loop. */
const hashText = (text: string) => createHash("sha256").update(text).digest("hex");

type JsonObject = Record<string, unknown>;

const readJsonFile = (file: string): { value: JsonObject; indent: string } | null => {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  const indent = /\n( +)"/.exec(text)?.[1] ?? "  ";
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("not an object");
    return { value: value as JsonObject, indent };
  } catch (error) {
    throw new RmkError(
      `${file} isn't a JSON object rmk can edit: ${(error as Error).message}`,
      1,
      "bad_file",
    );
  }
};

/** A TOML file as a plain object (024); rmk writes it back in smol-toml's canonical layout. */
const readTomlFile = (file: string): JsonObject | null => {
  if (!existsSync(file)) return null;
  try {
    return parseToml(readFileSync(file, "utf8")) as JsonObject;
  } catch (error) {
    throw new RmkError(
      `${file} isn't a TOML file rmk can edit: ${(error as Error).message}`,
      1,
      "bad_file",
    );
  }
};

/** A value's hash as the state file stores it, or null when there's none. */
const keyHash = (value: unknown) => (value === undefined ? null : hashText(canonicalJson(value)));

/**
 * Whether rewriting a TOML file loses something the person wrote, such as comments or their own
 * layout: rmk writes it back in one canonical layout (024).
 */
export const tomlRewriteLoses = (file: string): boolean => {
  if (!existsSync(file)) return false;
  const text = readFileSync(file, "utf8");
  try {
    return stringifyToml(parseToml(text)).trim() !== text.trim();
  } catch {
    return false;
  }
};

const getAt = (object: JsonObject, key: string[]): unknown => {
  let current: unknown = object;
  for (const part of key) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as JsonObject)[part];
  }
  return current;
};

/**
 * A key path part that would reach the object's prototype instead of a key of its own. Renderers'
 * keys come from validated item names, but the applier is a library entry too (027), so it refuses
 * them itself rather than trusting every caller.
 */
const unsafeKey = (part: string) =>
  new RmkError(
    `rmk won't write the key "${part}": it would change how every object behaves, not this file.`,
    1,
    "unsafe_key",
  );

const setAt = (object: JsonObject, key: string[], value: unknown) => {
  let current = object;
  for (const part of key.slice(0, -1)) {
    if (part === "__proto__" || part === "constructor" || part === "prototype")
      throw unsafeKey(part);
    const next = current[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) current[part] = {};
    current = current[part] as JsonObject;
  }
  const last = key.at(-1);
  if (last === "__proto__" || last === "constructor" || last === "prototype") throw unsafeKey(last);
  if (last !== undefined) current[last] = value;
};

/** Removes the key, then every parent object it left empty. */
const deleteAt = (object: JsonObject, key: string[]) => {
  const parents: [JsonObject, string][] = [];
  let current: unknown = object;
  for (const part of key) {
    if (part === "__proto__" || part === "constructor" || part === "prototype")
      throw unsafeKey(part);
    if (!current || typeof current !== "object" || Array.isArray(current)) return;
    parents.push([current as JsonObject, part]);
    current = (current as JsonObject)[part];
  }
  for (const [parent, part] of parents.reverse()) {
    delete parent[part];
    if (Object.keys(parent).length > 0) break;
  }
};

const arrayAt = (object: JsonObject, key: string[]): unknown[] => {
  const found = getAt(object, key);
  return Array.isArray(found) ? found : [];
};

const walkDir = (
  root: string,
  dir = root,
): { path: string; bytes: Uint8Array; executable: boolean }[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walkDir(root, full);
    return [
      {
        path: full
          .slice(root.length + 1)
          .split("\\")
          .join("/"),
        bytes: new Uint8Array(readFileSync(full)),
        executable: (statSync(full).mode & 0o111) !== 0,
      },
    ];
  });

/** The text between an item's fences in a Markdown file, or null when there's none. */
const sectionOf = (
  text: string,
  key: string,
): { start: number; end: number; body: string } | null => {
  const begin = text.indexOf(sectionBegin(key));
  if (begin === -1) return null;
  const endMarker = sectionEnd(key);
  const end = text.indexOf(endMarker, begin);
  if (end === -1) return null;
  const bodyStart = begin + sectionBegin(key).length + 1;
  return {
    start: begin,
    end: end + endMarker.length + (text[end + endMarker.length] === "\n" ? 1 : 0),
    body: text.slice(bodyStart, end),
  };
};

/**
 * What's on disk for a change's place: its hash as the state file would store it, or null when
 * nothing is there. A folder hashes every file in it, so an extra file counts as a change.
 */
export const diskHash = async (
  root: string,
  change: { kind: Change["kind"]; path: string; key?: string[] | string },
): Promise<string | null> => {
  const file = join(root, change.path);
  switch (change.kind) {
    case "file":
      return existsSync(file) ? sha256Hex(new Uint8Array(readFileSync(file))) : null;
    case "dir":
      return existsSync(file)
        ? stateHash({
            kind: "dir",
            path: change.path,
            files: walkDir(file).map((f) => ({
              path: f.path,
              content: f.bytes,
              executable: f.executable,
            })),
          })
        : null;
    case "json-key": {
      const json = readJsonFile(file);
      return keyHash(json ? getAt(json.value, change.key as string[]) : undefined);
    }
    case "toml-key": {
      const toml = readTomlFile(file);
      return keyHash(toml ? getAt(toml, change.key as string[]) : undefined);
    }
    case "json-array-item":
      return null;
    case "section": {
      if (!existsSync(file)) return null;
      const found = sectionOf(readFileSync(file, "utf8"), change.key as string);
      return found ? hashText(found.body) : null;
    }
  }
};

/** Whether an array element with this hash is in the file now. */
const arrayItemPresent = (
  root: string,
  change: { path: string; key?: string[] | string },
  hash: string,
): boolean => {
  const json = readJsonFile(join(root, change.path));
  if (!json) return false;
  return arrayAt(json.value, change.key as string[]).some(
    (element) => hashText(canonicalJson(element)) === hash,
  );
};

export type Conflict = {
  item: string;
  kind: Change["kind"];
  path: string;
  key?: string[] | string;
  reason: "unmanaged" | "edited";
};

export type Plan = {
  /** Changes to write, with the state entry each becomes. */
  writes: { wanted: Wanted; entry: StateEntry }[];
  /** Entries whose content is already what's wanted. */
  unchanged: StateEntry[];
  /** Entries to delete from disk and drop from the state. */
  removes: StateEntry[];
  /** Entries whose file or key the user removed: dropped, and rendered again only when wanted. */
  gone: StateEntry[];
  conflicts: Conflict[];
  /** TOML files the plan rewrites whose comments or layout won't survive (024). */
  reformatted: string[];
};

/**
 * Compares what's wanted with the state file and the disk. `force` turns every conflict into a
 * write or a removal.
 */
export const planChanges = async (
  root: string,
  state: State,
  wanted: Wanted[],
  { force = false } = {},
): Promise<Plan> => {
  const plan: Plan = {
    writes: [],
    unchanged: [],
    removes: [],
    gone: [],
    conflicts: [],
    reformatted: [],
  };
  const known = new Map(state.entries.map((entry) => [identity(entry), entry]));
  const seen = new Set<string>();
  for (const w of wanted) {
    const change = w.change;
    const id = identity(change);
    const hash = await stateHash(change);
    const entry: StateEntry = {
      item: w.item,
      version: w.version,
      targets: w.targets,
      kind: change.kind,
      path: change.path,
      ...("key" in change ? { key: change.key } : {}),
      sha256: hash,
    };
    if (seen.has(id)) {
      // The same change from another target, or from another item (such as Cursor's
      // `hooks.json` version, which every hook wants): one entry, kept while anything wants it.
      const other = [...plan.writes.map((x) => x.entry), ...plan.unchanged].find(
        (x) => identity(x) === id,
      );
      if (other && other.sha256 === hash) {
        other.targets = [...new Set([...other.targets, ...w.targets])];
        continue;
      }
      throw new RmkError(
        `${w.item} and ${other?.item ?? "another item"} both write ${change.path}${change.kind === "file" || change.kind === "dir" ? "" : ` (${keyOf(change).split("\0").join(".")})`} with different content.`,
        1,
        "name_clash",
        { path: change.path },
      );
    }
    seen.add(id);
    const previous = known.get(id);
    known.delete(id);
    const conflict = (reason: Conflict["reason"]) =>
      plan.conflicts.push({
        item: w.item,
        kind: change.kind,
        path: change.path,
        ...("key" in change ? { key: change.key } : {}),
        reason,
      });
    if (change.kind === "json-array-item") {
      const present = previous ? arrayItemPresent(root, change, previous.sha256) : false;
      const wantedPresent = arrayItemPresent(root, change, hash);
      if (wantedPresent && previous?.sha256 === hash) plan.unchanged.push(entry);
      else if (previous && !present) {
        // The user removed it: it comes back, since it's wanted.
        plan.gone.push(previous);
        plan.writes.push({ wanted: w, entry });
      } else {
        // A changed element: the old one goes before the new one is added.
        if (previous && previous.sha256 !== hash) plan.removes.push(previous);
        plan.writes.push({ wanted: w, entry });
      }
      continue;
    }
    const onDisk = await diskHash(root, change);
    if (!previous) {
      if (onDisk === null || onDisk === hash || force) plan.writes.push({ wanted: w, entry });
      else conflict("unmanaged");
    } else if (onDisk === null) {
      plan.gone.push(previous);
      plan.writes.push({ wanted: w, entry });
    } else if (onDisk !== previous.sha256 && !force) conflict("edited");
    else if (onDisk === hash) plan.unchanged.push(entry);
    else plan.writes.push({ wanted: w, entry });
  }
  for (const entry of known.values()) {
    const onDisk =
      entry.kind === "json-array-item"
        ? arrayItemPresent(root, entry, entry.sha256)
          ? entry.sha256
          : null
        : await diskHash(root, entry);
    if (onDisk === null) plan.gone.push(entry);
    else if (onDisk !== entry.sha256 && !force)
      plan.conflicts.push({
        item: entry.item,
        kind: entry.kind,
        path: entry.path,
        ...(entry.key !== undefined ? { key: entry.key } : {}),
        reason: "edited",
      });
    else plan.removes.push(entry);
  }
  if (plan.conflicts.length === 0)
    plan.reformatted = [
      ...new Set(
        [...plan.writes.map((w) => w.entry), ...plan.removes]
          .filter((entry) => entry.kind === "toml-key")
          .map((entry) => entry.path),
      ),
    ]
      .filter((path) => tomlRewriteLoses(join(root, path)))
      .sort();
  return plan;
};

const writeAtomic = (file: string, content: Uint8Array | string, executable = false) => {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, content, { mode: executable ? 0o755 : 0o644 });
  renameSync(temp, file);
};

const editJson = (root: string, path: string, edit: (value: JsonObject) => void) => {
  const file = join(root, path);
  const json = readJsonFile(file) ?? { value: {}, indent: "  " };
  edit(json.value);
  if (Object.keys(json.value).length === 0 && !existsSync(file)) return;
  writeAtomic(file, `${JSON.stringify(json.value, null, json.indent)}\n`);
};

/** Edits a TOML file's keys; a file left with no keys is removed. */
const editToml = (root: string, path: string, edit: (value: JsonObject) => void) => {
  const file = join(root, path);
  const value = readTomlFile(file) ?? {};
  edit(value);
  if (Object.keys(value).length === 0) {
    if (existsSync(file)) rmSync(file);
    return;
  }
  writeAtomic(file, stringifyToml(value));
};

const editText = (root: string, path: string, edit: (text: string | null) => string | null) => {
  const file = join(root, path);
  const next = edit(existsSync(file) ? readFileSync(file, "utf8") : null);
  if (next === null) {
    if (existsSync(file)) rmSync(file);
    return;
  }
  writeAtomic(file, next);
};

const write = (root: string, change: Change) => {
  switch (change.kind) {
    case "file":
      writeAtomic(join(root, change.path), change.content, change.executable);
      return;
    case "dir": {
      const dir = join(root, change.path);
      rmSync(dir, { recursive: true, force: true });
      for (const file of change.files)
        writeAtomic(join(dir, file.path), file.content, file.executable);
      return;
    }
    case "json-key":
      editJson(root, change.path, (value) => setAt(value, change.key, change.value));
      return;
    case "json-array-item":
      editJson(root, change.path, (value) => {
        const array = arrayAt(value, change.key);
        const hash = canonicalJson(change.item);
        if (!array.some((element) => canonicalJson(element) === hash))
          setAt(value, change.key, [...array, change.item]);
      });
      return;
    case "section": {
      const fenced = section(change.key, change.text);
      editText(root, change.path, (text) => {
        const found = text === null ? null : sectionOf(text, change.key);
        if (text === null) return fenced;
        if (!found) return `${text.replace(/\n*$/, "")}${text ? "\n\n" : ""}${fenced}`;
        return `${text.slice(0, found.start)}${fenced}${text.slice(found.end)}`;
      });
      return;
    }
    case "toml-key":
      editToml(root, change.path, (value) => setAt(value, change.key, change.value));
      return;
  }
};

const remove = (root: string, entry: StateEntry) => {
  const file = join(root, entry.path);
  switch (entry.kind) {
    case "file":
    case "dir":
      rmSync(file, { recursive: true, force: true });
      return;
    case "json-key":
      editJson(root, entry.path, (value) => deleteAt(value, entry.key as string[]));
      return;
    case "json-array-item":
      editJson(root, entry.path, (value) => {
        const key = entry.key as string[];
        const kept = arrayAt(value, key).filter(
          (element) => hashText(canonicalJson(element)) !== entry.sha256,
        );
        if (kept.length) setAt(value, key, kept);
        else deleteAt(value, key);
      });
      return;
    case "section":
      editText(root, entry.path, (text) => {
        const found = text === null ? null : sectionOf(text, entry.key as string);
        if (text === null || !found) return text;
        const next = `${text.slice(0, found.start).replace(/\n+$/, "\n")}${text.slice(found.end)}`;
        return next.trim() === "" ? null : next;
      });
      return;
    case "toml-key":
      editToml(root, entry.path, (value) => deleteAt(value, entry.key as string[]));
      return;
  }
};

/** Writes the plan's changes and removals, and returns the state to save. */
export const applyPlan = (root: string, state: State, plan: Plan): State => {
  for (const entry of plan.removes) remove(root, entry);
  for (const { wanted } of plan.writes) write(root, wanted.change);
  const dropped = new Set([...plan.removes, ...plan.gone].map(identity));
  const written = new Map(plan.writes.map((w) => [identity(w.entry), w.entry]));
  const unchanged = new Map(plan.unchanged.map((e) => [identity(e), e]));
  const entries = state.entries
    .filter(
      (entry) =>
        !dropped.has(identity(entry)) &&
        !written.has(identity(entry)) &&
        !unchanged.has(identity(entry)),
    )
    .concat([...written.values()], [...unchanged.values()]);
  return { version: 1, entries };
};
