import { isMap, parseDocument } from "yaml";
import type { ItemType } from "../item-types.js";
import type { Manifest } from "../manifest.js";
import type { PackageFile } from "../package-file.js";
import { canonicalJson } from "../render/helpers.js";
import type { ReadResult } from "./types.js";

/**
 * A local edit merged onto the version it came from (feature 042), three ways:
 * - **B**, the base version's files (its `ronne.yaml` without `version`);
 * - **R**, what the reader reads back from B rendered for the tool: an untouched install;
 * - **L**, what the reader reads from the local files.
 * Where L equals R, B's own value is kept, so what the round trip loses survives (keywords,
 * license, targets, dependencies, a tool the tool has no name for). Where L differs, it's the
 * person's edit and L's value is taken. Pure, like the readers.
 */

const MANIFEST = "ronne.yaml";
const decoder = new TextDecoder();
const encoder = new TextEncoder();

export type FieldChange = { field: string; from: unknown; to: unknown };

export type MergeResult = {
  /** The proposal's files, `ronne.yaml` included, by path. */
  files: PackageFile[];
  manifestText: string;
  manifest: Manifest;
  /** Paths added, removed and changed against B, and the manifest fields that changed. */
  changes: { added: string[]; removed: string[]; changed: string[]; fields: FieldChange[] };
  /** Nothing differs from B: 017 refuses a proposal that changes nothing. */
  unchanged: boolean;
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Where a reader's content file is in the base item: `prompt.md` is whatever `agent.prompt` names. */
const basePath = (type: ItemType, manifest: Manifest, readerPath: string): string => {
  const block = record(manifest[type]);
  const named = (field: string, fixed: string) =>
    readerPath === fixed && typeof block[field] === "string" ? String(block[field]) : readerPath;
  switch (type) {
    case "agent":
      return named("prompt", "prompt.md");
    case "command":
      return named("body", "command.md");
    case "rule":
      return named("body", "rule.md");
    case "skill":
      return named("entry", "SKILL.md");
    default:
      return readerPath;
  }
};

/** Every leaf of a manifest, by its path: plain objects are walked, anything else is a leaf. */
const leaves = (
  value: unknown,
  path: string[] = [],
  out = new Map<string, { path: string[]; value: unknown }>(),
) => {
  const node = record(value);
  const isObject = value !== null && typeof value === "object" && !Array.isArray(value);
  if (!isObject || Object.keys(node).length === 0) {
    if (path.length > 0) out.set(path.join("\0"), { path, value });
    return out;
  }
  for (const [key, child] of Object.entries(node)) {
    // The name is the item's; drafts carry no version (017).
    if (path.length === 0 && (key === "name" || key === "version")) continue;
    leaves(child, [...path, key], out);
  }
  return out;
};

const same = (a: unknown, b: unknown) =>
  a === undefined || b === undefined ? a === b : canonicalJson(a) === canonicalJson(b);

const bytesEqual = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);

export const mergeChange = (input: {
  type: ItemType;
  base: readonly PackageFile[];
  rendered: ReadResult;
  local: ReadResult;
}): MergeResult => {
  const baseManifestFile = input.base.find((f) => f.path === MANIFEST);
  const baseText = baseManifestFile ? decoder.decode(baseManifestFile.bytes) : "";
  let doc = parseDocument(baseText);
  if (!isMap(doc.contents)) doc = parseDocument("{}\n");
  const baseManifest = record(doc.toJS());

  // The manifest, field by field.
  const fields: FieldChange[] = [];
  const r = leaves(input.rendered.manifest);
  const l = leaves(input.local.manifest);
  for (const key of new Set([...r.keys(), ...l.keys()])) {
    const rendered = r.get(key);
    const local = l.get(key);
    if (same(rendered?.value, local?.value)) continue;
    const path = (local ?? rendered)?.path ?? [];
    const from = doc.getIn(path);
    const before =
      from && typeof from === "object" && "toJSON" in from
        ? (from as { toJSON: () => unknown }).toJSON()
        : from;
    if (local) doc.setIn(path, local.value);
    else doc.deleteIn(path);
    fields.push({ field: path.join("."), from: before, to: local?.value });
  }
  // Unchanged, the base's text stays byte for byte: re-serialising would re-space its lists.
  const manifestText = fields.length === 0 && baseText ? baseText : doc.toString({ lineWidth: 0 });
  const manifest = record(doc.toJS()) as Manifest;

  // The content files, mapped back to the base's own paths.
  const files = new Map(input.base.filter((f) => f.path !== MANIFEST).map((f) => [f.path, f]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  const readerFiles = (read: ReadResult) =>
    new Map(read.files.filter((f) => f.path !== MANIFEST).map((f) => [f.path, f]));
  const rFiles = readerFiles(input.rendered);
  const lFiles = readerFiles(input.local);
  for (const path of new Set([...rFiles.keys(), ...lFiles.keys()])) {
    const rendered = rFiles.get(path);
    const local = lFiles.get(path);
    const target = basePath(input.type, baseManifest, path);
    if (rendered && local) {
      if (
        bytesEqual(rendered.bytes, local.bytes) &&
        (rendered.executable ?? false) === (local.executable ?? false)
      )
        continue;
      files.set(target, { ...local, path: target });
      changed.push(target);
    } else if (local) {
      files.set(target, { ...local, path: target });
      added.push(target);
    } else if (files.delete(target)) removed.push(target);
  }

  const out = [{ path: MANIFEST, bytes: encoder.encode(manifestText) }, ...files.values()].sort(
    (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  );
  return {
    files: out,
    manifestText,
    manifest,
    changes: { added: added.sort(), removed: removed.sort(), changed: changed.sort(), fields },
    unchanged: fields.length === 0 && added.length + removed.length + changed.length === 0,
  };
};
