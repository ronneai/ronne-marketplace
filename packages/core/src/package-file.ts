/**
 * One file of an item, as bytes. Checks and the packer take a list of these, never the file system,
 * so the web app (draft files from the database), `rmk` (a folder) and tests all use them the same way.
 */
export type PackageFile = {
  /** Relative, with `/`. */
  path: string;
  bytes: Uint8Array;
  /** Scripts that should be packed as executable (mode 0755). */
  executable?: boolean;
};
