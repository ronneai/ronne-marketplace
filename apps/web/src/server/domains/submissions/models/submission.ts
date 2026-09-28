import {
  checkPackage,
  type ItemType,
  type ManifestIssue,
  type PackageFile,
  type PackageLimits,
  parseManifest,
} from "@ronneai/core";

/**
 * Drafts and submissions (feature 012). Plain data and pure functions only: the editor imports
 * this file in the browser, so it validates exactly as the server does.
 */

/** 012 only creates drafts; 013 adds submitted, withdrawn, approved and rejected (MVP §4.1). */
export type SubmissionStatus = "draft";

export type Submission = {
  id: string;
  authorId: string;
  scope: { id: string; name: string };
  /** The item's name without the scope. */
  name: string;
  type: ItemType;
  status: SubmissionStatus;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
};

/** One file of a draft, as stored. `content` is text, or base64 for binary files. */
export type DraftFile = {
  path: string;
  encoding: "utf8" | "base64";
  content: string;
  /** Bytes of the file itself. */
  size: number;
  executable: boolean;
  updatedAt: Date;
};

export type Draft = Submission & { files: DraftFile[] };

export const MANIFEST_PATH = "ronne.yaml";

/** `@scope/name`. */
export const itemNameOf = (submission: { scope: { name: string }; name: string }): string =>
  `@${submission.scope.name}/${submission.name}`;

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export const isBase64 = (value: string): boolean => BASE64.test(value);

/** The size of a file in bytes, from what's stored. */
export const byteSize = (file: { encoding: "utf8" | "base64"; content: string }): number => {
  if (file.encoding === "utf8") return new TextEncoder().encode(file.content).length;
  const padding = file.content.endsWith("==") ? 2 : file.content.endsWith("=") ? 1 : 0;
  return (file.content.length / 4) * 3 - padding;
};

/** A file's bytes. `atob` rather than Buffer, so it runs in the browser too. */
export const fileBytes = (file: { encoding: "utf8" | "base64"; content: string }): Uint8Array =>
  file.encoding === "utf8"
    ? new TextEncoder().encode(file.content)
    : Uint8Array.from(atob(file.content), (char) => char.charCodeAt(0));

/**
 * How a file's bytes are stored: as text when they're valid UTF-8 without NUL bytes, otherwise as
 * base64. Runs in the browser for uploads and on the server for .zip imports.
 */
export const toDraftContent = (
  bytes: Uint8Array,
): { encoding: "utf8" | "base64"; content: string } => {
  if (!bytes.includes(0))
    try {
      return { encoding: "utf8", content: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
    } catch {
      // Not UTF-8: stored as base64 below.
    }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { encoding: "base64", content: btoa(binary) };
};

export const toPackageFile = (file: Omit<DraftFile, "updatedAt" | "size">): PackageFile => ({
  path: file.path,
  bytes: fileBytes(file),
  executable: file.executable,
});

/** The line a top-level key starts on, for the name and type checks below. */
const lineOfKey = (text: string, key: string): number | undefined => {
  const index = text.split(/\r?\n/).findIndex((line) => line.startsWith(`${key}:`));
  return index === -1 ? undefined : index + 1;
};

/**
 * 011's checks on a draft, plus this draft's own rule: `name` and `type` in ronne.yaml must match
 * the draft's, which change only through the draft's settings. A draft may be saved with errors;
 * 013 refuses to submit one.
 */
export const validateDraft = (
  draft: { scope: { name: string }; name: string; type: ItemType },
  files: readonly Omit<DraftFile, "updatedAt" | "size">[],
  limits?: PackageLimits,
): ManifestIssue[] => {
  const manifestFile = files.find((file) => file.path === MANIFEST_PATH);
  const text = manifestFile ? new TextDecoder().decode(fileBytes(manifestFile)) : "";
  const { manifest, issues } = manifestFile
    ? parseManifest(text)
    : { manifest: null, issues: [] as ManifestIssue[] };
  const found: ManifestIssue[] = issues.map((issue) => ({ ...issue, file: MANIFEST_PATH }));
  if (!manifest) {
    // Without a manifest there's nothing to compare the files against, but paths and limits
    // still matter, and a missing ronne.yaml is reported here.
    found.push(...checkPackage({}, files.map(toPackageFile), limits).filter(isFileLevel));
    return found;
  }
  const itemName = itemNameOf(draft);
  if (typeof manifest.name === "string" && manifest.name !== itemName)
    found.push({
      severity: "error",
      code: "name_mismatch",
      message: `\`name\` must be ${itemName}, this draft's name. To rename the item, use the draft's settings.`,
      path: "/name",
      file: MANIFEST_PATH,
      line: lineOfKey(text, "name"),
    });
  if (typeof manifest.type === "string" && manifest.type !== draft.type)
    found.push({
      severity: "error",
      code: "type_mismatch",
      message: `\`type\` must be ${draft.type}, this draft's type. A draft's type can't change: start a new draft for another type.`,
      path: "/type",
      file: MANIFEST_PATH,
      line: lineOfKey(text, "type"),
    });
  found.push(...checkPackage(manifest, files.map(toPackageFile), limits));
  return found;
};

const FILE_LEVEL = new Set([
  "path_invalid",
  "path_case_clash",
  "manifest_missing",
  "too_many_files",
  "file_too_large",
  "package_too_large",
]);
const isFileLevel = (issue: ManifestIssue) => FILE_LEVEL.has(issue.code);
