import type { Manifest } from "../manifest.js";
import type { PackageFile } from "../package-file.js";

/**
 * How a file a person wrote in their AI tool becomes an item (feature 038,
 * docs/spec/native-readers.md). A reader is the reverse of a renderer and, like one, is pure: files
 * in, the item out. No file system, network or clock; `rmk` finds the files and uploads the result.
 */

export type ReadWarningCode =
  /** The description was longer than the manifest allows, and was cut. */
  | "description_cut"
  /** The description came from the body, for want of one in the frontmatter. */
  | "description_from_body"
  /** The uploaded copy of the entry file got its `name` set; the file on disk didn't. */
  | "entry_name_set"
  /** `version` was left out: the packer sets it when the item is released. */
  | "version_removed"
  /** A native field the manifest can't carry was left out (040). */
  | "field_dropped"
  /** A tool with no canonical name was left out of an agent's tools (040). */
  | "tool_dropped"
  /** A model the manifest doesn't name was read as `default` (040). */
  | "model_default"
  /** The native name couldn't be an item name, and was made into one (040). */
  | "name_changed";

/** Something the person should know before uploading; the preview lists them. */
export type ReadWarning = { code: ReadWarningCode; message: string; file?: string };

/** Something the item uses that could be another item; 041 turns them into dependencies. */
export type ItemReference = { kind: "mcp-server" | "skill"; name: string; from: string };

export type ReadResult = {
  manifest: Manifest;
  /** `ronne.yaml` as uploaded. */
  manifestText: string;
  /** Every file to upload, `ronne.yaml` included, by path. */
  files: PackageFile[];
  warnings: ReadWarning[];
  references: ItemReference[];
};

export type ReadErrorCode =
  /** The folder has no entry file (`SKILL.md` for a skill). */
  | "entry_missing"
  /** A `ronne.yaml` in the folder that doesn't parse, or is another type's. */
  | "manifest_invalid"
  /** The item name given isn't `@scope/name`. */
  | "invalid_name";

/** The files can't become an item at all; `rmk` refuses that item and goes on with the others. */
export class ReadError extends Error {
  constructor(
    readonly code: ReadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ReadError";
  }
}
