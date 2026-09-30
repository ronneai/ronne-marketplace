import type { PackageFile } from "@ronneai/core";

/** Text over this many bytes isn't shown on the item page (044); its size is. */
export const SHOWN_TEXT_MAX = 512 * 1024;

/**
 * One file of a published version as the item page shows it (044): its text, or why it isn't
 * shown. Binary bytes never leave the server.
 */
export type ContentFile = {
  path: string;
  size: number;
  executable: boolean;
} & ({ kind: "text"; text: string } | { kind: "binary" } | { kind: "large" });

/** UTF-8 without NUL bytes is text, as drafts store it (012); anything else is binary. */
const textOf = (bytes: Uint8Array): string | null => {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

export const toContentFile = (file: PackageFile): ContentFile => {
  const base = { path: file.path, size: file.bytes.length, executable: file.executable ?? false };
  const text = textOf(file.bytes);
  if (text === null) return { ...base, kind: "binary" };
  if (file.bytes.length > SHOWN_TEXT_MAX) return { ...base, kind: "large" };
  return { ...base, kind: "text", text };
};
