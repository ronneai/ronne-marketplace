import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isWellFormedText, passphraseBytes } from "./crypto";

type Env = Record<string, string | undefined>;

/** The passphrase couldn't be had; the message never holds it. */
export class PassphraseError extends Error {
  constructor(
    message: string,
    readonly exitCode: 1 | 2,
  ) {
    super(message);
    this.name = "PassphraseError";
  }
}

/** Asks for a passphrase without showing it; null when the person cancels. */
export type AskPassphrase = (message: string) => Promise<string | null>;

/**
 * The passphrase for `--encrypt` (099), in the format's bytes: from `--passphrase-file` (relative
 * to where the command was typed), else RONNE_BACKUP_PASSPHRASE (for schedules), else asked twice
 * in a terminal. Never printed, logged or put in an error message (CodeQL's clear-text logging
 * rule, docs/knowledge/codeql-logging.md).
 */
export const readPassphrase = async (options: {
  file?: string;
  env: Env;
  callerCwd: string;
  ask?: AskPassphrase;
  /** Asks twice and compares: when making an archive, not when reading one. */
  confirm: boolean;
}): Promise<Buffer> => {
  const empty = () =>
    new PassphraseError("The passphrase is empty. Choose one with at least one character.", 2);
  if (options.file !== undefined) {
    let raw: Buffer;
    try {
      raw = await readFile(resolve(options.callerCwd, options.file));
    } catch (error) {
      throw new PassphraseError(
        `The passphrase file couldn't be read (${(error as NodeJS.ErrnoException).code ?? "an error"}).`,
        1,
      );
    }
    let text: string;
    try {
      // Not "utf8": that turns every invalid byte into U+FFFD, so different files would be one key.
      // ignoreBOM: a leading BOM is part of the passphrase, as everything but one line break is.
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(raw);
    } catch {
      throw new PassphraseError(
        "The passphrase file isn't UTF-8 text. Use a passphrase made of characters, not a binary key.",
        2,
      );
    }
    if (text.replace(/\r?\n$/, "") === "") throw empty();
    if (!isWellFormedText(text.replace(/\r?\n$/, "")))
      throw new PassphraseError(
        "The passphrase file holds a control character (a tab, a line break before the last…), a line separator or the replacement character (U+FFFD). Choose another passphrase.",
        2,
      );
    return passphraseBytes(text, true);
  }
  const notText = () =>
    new PassphraseError(
      "The passphrase holds a control character (a tab, a line break…) or isn't valid Unicode text. Choose another.",
      2,
    );
  const fromEnv = options.env.RONNE_BACKUP_PASSPHRASE;
  if (fromEnv !== undefined && fromEnv !== "") {
    if (fromEnv.replace(/\r?\n$/, "") === "") throw empty();
    if (!isWellFormedText(fromEnv.replace(/\r?\n$/, ""))) throw notText();
    return passphraseBytes(fromEnv, true);
  }
  if (!options.ask)
    throw new PassphraseError(
      "There's no terminal to ask for the passphrase. Give it with --passphrase-file or RONNE_BACKUP_PASSPHRASE.",
      2,
    );
  const first = await options.ask("Passphrase for the backup");
  if (first === null) throw new PassphraseError("Cancelled. Nothing was written.", 1);
  if (first === "") throw empty();
  if (!isWellFormedText(first)) throw notText();
  if (options.confirm) {
    const second = await options.ask("The same passphrase again");
    if (second === null) throw new PassphraseError("Cancelled. Nothing was written.", 1);
    if (second.normalize("NFC") !== first.normalize("NFC"))
      throw new PassphraseError("The two passphrases differ. Nothing was written.", 1);
  }
  return passphraseBytes(first);
};
