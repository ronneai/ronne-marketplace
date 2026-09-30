import { readFileSync } from "node:fs";
import { basename, relative } from "node:path";
import { type ItemType, type Manifest, type PackageFile, parseManifest } from "@ronneai/core";
import { unpackItem } from "@ronneai/core/pack";
import {
  type MergeResult,
  mergeChange,
  type ReadResult,
  readAgent,
  readCodexAgent,
  readCodexMcpServer,
  readCommand,
  readCursorAgent,
  readCursorCommand,
  readCursorMcpServer,
  readCursorRule,
  readMcpServer,
  readRule,
  readSkill,
  withoutVersion,
} from "@ronneai/core/read";
import { type Change, rendererById } from "@ronneai/core/render";
import { parse as parseToml } from "smol-toml";
import { type ApiClient, ApiError } from "./api.js";
import { diskHash, readState } from "./apply.js";
import { RmkError } from "./errors.js";
import { type ExportType, type SourceTool, serversIn, walkItemFolder } from "./export.js";
import { fetchArtifact, places, type Scope } from "./install.js";
import type { Io } from "./io.js";
import { itemPath } from "./registry-commands.js";

/**
 * A change to a published item, read from where it was made (feature 042): the base version is
 * downloaded and rendered for the tool, so the export can tell the person's edit from what `rmk`
 * wrote, and the edit is merged onto the base (`mergeChange` in core).
 */

/** The item and version a proposal starts from. */
export type BaseRef = { item: string; version: string };

/** Where a local item is, as `planExport` resolves it. */
export type ProposalPlace = {
  type: ExportType;
  tool: SourceTool;
  path: string;
  key?: string;
  scope: Scope;
};

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/**
 * Text without the lines `rmk` adds to what it writes (MVP §3.3): the managed marker, as an HTML
 * comment (with the blank line after it) or a `#` comment. A loop over lines, not a regex.
 */
export const withoutMarkers = (text: string): string => {
  const lines = text.split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.startsWith("<!-- managed by rmk: ")) {
      if (lines[i + 1] === "") i += 1;
      continue;
    }
    if (line.startsWith("# managed by rmk: ")) continue;
    kept.push(line);
  }
  return kept.join("\n");
};

const stripped = (file: PackageFile): PackageFile => ({
  ...file,
  bytes: encoder.encode(withoutMarkers(decoder.decode(file.bytes))),
});

/** An item's content as a tool keeps it: a folder's files, one file, or a config key's value. */
type Content =
  | { kind: "dir"; files: PackageFile[] }
  | { kind: "file"; file: PackageFile }
  | { kind: "key"; key: string; value: unknown };

/** Reads content with the reader for its type and tool, as `planExport` does (038, 040, 043). */
const readContent = (
  place: Pick<ProposalPlace, "type" | "tool">,
  content: Content,
  itemName: string,
  description?: string,
): ReadResult => {
  const options = { itemName };
  if (content.kind === "dir")
    return readSkill(
      content.files.map((f) => (f.path === "SKILL.md" ? stripped(f) : f)),
      options,
    );
  if (content.kind === "key") {
    const reader =
      place.tool === "codex"
        ? readCodexMcpServer
        : place.tool === "cursor"
          ? readCursorMcpServer
          : readMcpServer;
    return reader(content.key, content.value, {
      ...options,
      ...(description ? { description } : {}),
    });
  }
  const file = stripped(content.file);
  if (place.tool === "codex")
    return readCodexAgent(parseToml(decoder.decode(file.bytes)), { itemName, fileName: file.path });
  if (place.tool === "cursor")
    return (
      place.type === "agent"
        ? readCursorAgent
        : place.type === "command"
          ? readCursorCommand
          : readCursorRule
    )(file, options);
  return (place.type === "agent" ? readAgent : place.type === "command" ? readCommand : readRule)(
    file,
    options,
  );
};

/** The base version's files, downloaded and checked as `install` does, without `version`. */
export const fetchBase = async (io: Io, api: ApiClient, base: BaseRef): Promise<PackageFile[]> => {
  let detail: { sha256: string };
  try {
    detail = await api.get<{ sha256: string }>(
      `${itemPath(base.item)}/${encodeURIComponent(base.version)}`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404)
      throw new RmkError(
        `${base.item} ${base.version}, which this was installed from, isn't in ${api.registry}, so there's nothing to propose a change to.`,
        1,
        "base_not_found",
        { item: base.item, version: base.version },
      );
    throw error;
  }
  const tgz = await fetchArtifact(io, api, base.item, base.version, detail.sha256);
  return unpackItem(tgz).map((file) =>
    file.path === "ronne.yaml"
      ? { ...file, bytes: encoder.encode(withoutVersion(decoder.decode(file.bytes))) }
      : file,
  );
};

/** The renderer for a tool; the shared skills folder is Codex's and Cursor's. */
const rendererOf = (tool: SourceTool) => rendererById(tool === "shared" ? "codex" : tool);

/** The change a render wrote at this place, or null. */
const changeAt = (changes: readonly Change[], place: ProposalPlace, relativePath: string) =>
  changes.find((change) => {
    if (change.path !== relativePath) return false;
    if (place.key === undefined) return change.kind === "dir" || change.kind === "file";
    return (
      (change.kind === "json-key" || change.kind === "toml-key") && change.key.at(-1) === place.key
    );
  }) ?? null;

const changeContent = (change: Change, place: ProposalPlace): Content => {
  const bytes = (content: Uint8Array | string) =>
    typeof content === "string" ? encoder.encode(content) : content;
  if (change.kind === "dir")
    return {
      kind: "dir",
      files: change.files.map((f) => ({
        path: f.path,
        bytes: bytes(f.content),
        executable: f.executable ?? false,
      })),
    };
  if (change.kind === "file")
    return { kind: "file", file: { path: basename(change.path), bytes: bytes(change.content) } };
  if (change.kind === "json-key" || change.kind === "toml-key")
    return { kind: "key", key: place.key ?? "", value: change.value };
  throw new RmkError(
    `rmk wrote this as a ${change.kind}, which export doesn't read.`,
    1,
    "not_exportable",
  );
};

const localContent = (place: ProposalPlace): Content => {
  if (place.type === "mcp-server")
    return {
      kind: "key",
      key: place.key ?? "",
      value: serversIn(place.path).servers[place.key ?? ""],
    };
  if (place.type === "skill") return { kind: "dir", files: walkItemFolder(place.path).files };
  return {
    kind: "file",
    file: { path: basename(place.path), bytes: new Uint8Array(readFileSync(place.path)) },
  };
};

export type ReadChange = {
  base: PackageFile[];
  rendered: ReadResult;
  local: ReadResult;
  merged: MergeResult;
};

/**
 * The person's change to an item at a place: the base version rendered for the place's tool and
 * read back (R), the local files read (L), and the two merged onto the base (B).
 */
export const readChange = async (
  io: Io,
  api: ApiClient,
  place: ProposalPlace,
  base: BaseRef,
): Promise<ReadChange> => {
  const baseFiles = await fetchBase(io, api, base);
  const manifestFile = baseFiles.find((f) => f.path === "ronne.yaml");
  const baseManifest: Manifest = manifestFile
    ? (parseManifest(decoder.decode(manifestFile.bytes)).manifest ?? {})
    : {};
  const type = String(baseManifest.type ?? "") as ItemType;
  if (type !== place.type)
    throw new RmkError(
      `${base.item} is ${type === "agent" ? "an" : "a"} ${type}, which rmk wrote here as ${place.type === "agent" ? "an" : "a"} ${place.type}; change it in the web editor instead.`,
      1,
      "type_mismatch",
    );
  const renderer = rendererOf(place.tool);
  if (!renderer) throw new RmkError(`No renderer for ${place.tool}.`, 1, "not_exportable");
  const { root } = places(io, place.scope);
  const relativePath = relative(root, place.path).split("\\").join("/");
  const { changes } = renderer.render(
    {
      name: base.item,
      version: base.version,
      manifest: { ...baseManifest, version: base.version },
      files: baseFiles,
    },
    { scope: place.scope },
  );
  const change = changeAt(changes, place, relativePath);
  if (!change)
    throw new RmkError(
      `${base.item} ${base.version} doesn't write ${relativePath} for ${place.tool}, so the edit can't be told from the install.`,
      1,
      "not_exportable",
    );
  const description =
    typeof baseManifest.description === "string" ? baseManifest.description : undefined;
  const localFiles = localContent(place);
  let renderedFiles = changeContent(change, place);
  // R is what the local copy would be if unchanged. A skill folder the person wrote has no
  // ronne.yaml (an install has the item's), so R is read without one too; the fields only a
  // ronne.yaml carries (keywords, license…) then stay the base's.
  if (
    renderedFiles.kind === "dir" &&
    localFiles.kind === "dir" &&
    !localFiles.files.some((f) => f.path === "ronne.yaml")
  )
    renderedFiles = {
      kind: "dir",
      files: renderedFiles.files.filter((f) => f.path !== "ronne.yaml"),
    };
  const rendered = readContent(place, renderedFiles, base.item, description);
  const local = readContent(place, localFiles, base.item, description);
  return {
    base: baseFiles,
    rendered,
    local,
    merged: mergeChange({ type, base: baseFiles, rendered, local }),
  };
};

/**
 * The places where `rmk` installed an item and the person edited it since, in a scope: one per
 * tool it was written for. More than one means the person has to say which (`--target`).
 */
export const editedPlaces = async (
  io: Io,
  scope: Scope,
  item: string,
): Promise<{ path: string; key?: string; targets: string[] }[]> => {
  const { root, state } = places(io, scope);
  const edited: { path: string; key?: string; targets: string[] }[] = [];
  for (const entry of readState(state).entries) {
    if (entry.item !== item || entry.kind === "section" || entry.kind === "json-array-item")
      continue;
    const hash = await diskHash(root, entry);
    if (hash === null || hash === entry.sha256) continue;
    edited.push({
      path: entry.path,
      ...(Array.isArray(entry.key) ? { key: entry.key.at(-1) } : {}),
      targets: entry.targets,
    });
  }
  return edited;
};
