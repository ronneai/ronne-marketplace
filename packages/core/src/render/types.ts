import type { ItemType } from "../item-types.js";
import type { Manifest } from "../manifest.js";
import type { PackageFile } from "../package-file.js";

/**
 * How an AI tool gets an item (feature 021, MVP §3.3). A renderer is pure: given a released item,
 * it returns the changes to make, and `rmk` (022) applies them and records each one in
 * `.rmk/state.json`, so removing undoes exactly what was recorded. No file system, network or clock.
 */

/** What a renderer may ask about the project, to tell whether it's used there. */
export interface ProjectProbe {
  /** Whether a file or folder exists, by a path relative to the project root. */
  exists(path: string): Promise<boolean>;
}

export type SupportLevel = "native" | "degraded" | "none";

export type RenderInput = {
  /** `@scope/name`. */
  name: string;
  version: string;
  /** As released, `version` included. */
  manifest: Manifest;
  /** The artifact's files, unpacked (011). */
  files: readonly PackageFile[];
  /**
   * What `rmk` resolved for each of its dependencies (097), for tools that name them: an agent's
   * skills, in Claude Code. `preload` is false for a skill that sets `disable-model-invocation`.
   * Absent when the caller doesn't know.
   */
  dependencies?: readonly RenderDependency[];
};

export type RenderDependency = { name: string; type: ItemType; preload?: boolean };

export type RenderScope = "project" | "user";

export type RenderContext = {
  scope: RenderScope;
  /**
   * Every target of this install, this one included (025). A tool that also reads another tool's
   * files, as Cursor reads Claude Code's skills and hooks, can leave out its own copy.
   */
  targets?: readonly string[];
  /**
   * The plugin it's written into (076), when it is: Claude Code names a plugin's own agents and
   * skills `plugin:name` in frontmatter (097).
   */
  plugin?: string;
};

/** One file, in bytes or text; `executable` is the 0755 bit (011). */
export type ChangeFile = { path: string; content: Uint8Array | string; executable?: boolean };

/**
 * A change to make, mirroring the state file's kinds (cli-files.md). Paths are relative to the
 * project root (or the home folder, for user scope) and always use `/`.
 */
export type Change =
  | { kind: "file"; path: string; content: Uint8Array | string; executable?: boolean }
  | { kind: "dir"; path: string; files: ChangeFile[] }
  | { kind: "json-key"; path: string; key: string[]; value: unknown }
  | { kind: "toml-key"; path: string; key: string[]; value: unknown }
  /** One element of a JSON array, such as a hook or a permission rule (023). */
  | { kind: "json-array-item"; path: string; key: string[]; item: unknown }
  /**
   * A fenced `rmk:begin` / `rmk:end` block in a shared Markdown file, keyed by the item's name.
   * `text` is the body only: rmk adds the fences, and the state file hashes the body.
   */
  | { kind: "section"; path: string; key: string; text: string };

export type ChangeKind = Change["kind"];

export type RenderWarningCode =
  | "unsupported_type"
  | "unsupported_field"
  | "unmapped_tool"
  | "invalid_override"
  | "disabled_by_manifest"
  /** Another target of the same install writes a copy this tool already reads (025). */
  | "covered_by_target";

/** Something the tool can't take as written; `rmk` prints it and carries on (MVP §3.3). */
export type RenderWarning = { code: RenderWarningCode; message: string };

export type RenderResult = { changes: Change[]; warnings: RenderWarning[] };

export interface PlatformRenderer {
  /** The manifest's `targets` key: "claude-code", "codex", … */
  id: string;
  /** "Claude Code". */
  name: string;
  /** Bumped whenever the output changes, so a golden-file diff has a version to point at. */
  version: string;
  /** Whether the project looks like it uses this tool. */
  detect(probe: ProjectProbe): Promise<boolean>;
  /** How well it supports a type; `none` makes `rmk` warn and skip the item (MVP §3.3). */
  supports(type: ItemType): SupportLevel;
  /** What installing one item writes. */
  render(item: RenderInput, context: RenderContext): RenderResult;
}
