import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { passphraseBytes } from "./crypto";
import { PassphraseError, readPassphrase } from "./passphrase";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ronne-passphrase-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const SECRET = "tr0ub4dor & 3";

/** Answers the questions in order, recording them. */
const answers = (...replies: (string | null)[]) => {
  const asked: string[] = [];
  return {
    asked,
    ask: async (message: string) => {
      asked.push(message);
      return replies.shift() ?? null;
    },
  };
};

const failure = async (run: Promise<unknown>) => {
  const error = await run.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(PassphraseError);
  // Never the passphrase itself in what it says.
  expect((error as Error).message).not.toContain(SECRET);
  return error as PassphraseError;
};

describe("the passphrase for --encrypt (099)", () => {
  it("reads --passphrase-file from where the command was typed, without one line break", async () => {
    writeFileSync(join(dir, "pass.txt"), `${SECRET}\r\n`);
    const bytes = await readPassphrase({
      file: "pass.txt",
      env: { RONNE_BACKUP_PASSPHRASE: "not this one" },
      callerCwd: dir,
      confirm: true,
    });
    expect(bytes).toEqual(passphraseBytes(SECRET));
  });

  it("reads RONNE_BACKUP_PASSPHRASE when there's no file, without asking", async () => {
    const { ask, asked } = answers("asked");
    expect(
      await readPassphrase({
        env: { RONNE_BACKUP_PASSPHRASE: `${SECRET}\n` },
        callerCwd: dir,
        ask,
        confirm: true,
      }),
    ).toEqual(passphraseBytes(SECRET));
    expect(asked).toEqual([]);
  });

  it("keeps a leading BOM in a passphrase file: only one trailing line break is dropped", async () => {
    writeFileSync(join(dir, "bom.txt"), Buffer.from([0xef, 0xbb, 0xbf, 0x70, 0x77, 0x0a]));
    expect(
      await readPassphrase({ file: "bom.txt", env: {}, callerCwd: dir, confirm: true }),
    ).toEqual(Buffer.from([0xef, 0xbb, 0xbf, 0x70, 0x77]));
  });

  it("asks twice in a terminal, and refuses two that differ", async () => {
    const same = answers(SECRET, SECRET);
    expect(await readPassphrase({ env: {}, callerCwd: dir, ask: same.ask, confirm: true })).toEqual(
      passphraseBytes(SECRET),
    );
    expect(same.asked).toHaveLength(2);
    // The same characters in another Unicode form are the same passphrase.
    const forms = answers("café", "café");
    expect(
      await readPassphrase({ env: {}, callerCwd: dir, ask: forms.ask, confirm: true }),
    ).toEqual(passphraseBytes("café"));
    const differ = await failure(
      readPassphrase({
        env: {},
        callerCwd: dir,
        ask: answers(SECRET, `${SECRET}!`).ask,
        confirm: true,
      }),
    );
    expect(differ.message).toBe("The two passphrases differ. Nothing was written.");
    // Once is enough to read an archive.
    const once = answers(SECRET);
    await readPassphrase({ env: {}, callerCwd: dir, ask: once.ask, confirm: false });
    expect(once.asked).toHaveLength(1);
  });

  it("refuses an empty passphrase, a cancelled question, no terminal and a missing file", async () => {
    writeFileSync(join(dir, "empty.txt"), "\n");
    const empty = await failure(
      readPassphrase({ file: "empty.txt", env: {}, callerCwd: dir, confirm: true }),
    );
    expect(empty.exitCode).toBe(2);
    expect(
      (
        await failure(
          readPassphrase({ env: { RONNE_BACKUP_PASSPHRASE: "\n" }, callerCwd: dir, confirm: true }),
        )
      ).exitCode,
    ).toBe(2);
    expect(
      (
        await failure(
          readPassphrase({ env: {}, callerCwd: dir, ask: answers("").ask, confirm: true }),
        )
      ).exitCode,
    ).toBe(2);
    expect(
      (
        await failure(
          readPassphrase({ env: {}, callerCwd: dir, ask: answers(null).ask, confirm: true }),
        )
      ).message,
    ).toMatch(/Cancelled/);
    const none = await failure(readPassphrase({ env: {}, callerCwd: dir, confirm: true }));
    expect(none.exitCode).toBe(2);
    expect(none.message).toMatch(/--passphrase-file or RONNE_BACKUP_PASSPHRASE/);
    // Not UTF-8: two different files would have been one key.
    writeFileSync(join(dir, "binary-a"), Buffer.from([0x70, 0x77, 0xff]));
    const binary = await failure(
      readPassphrase({ file: "binary-a", env: {}, callerCwd: dir, confirm: true }),
    );
    expect(binary.exitCode).toBe(2);
    expect(binary.message).toMatch(/isn't UTF-8 text/);
    expect(
      (
        await failure(
          readPassphrase({
            env: { RONNE_BACKUP_PASSPHRASE: "x\ud800" },
            callerCwd: dir,
            confirm: true,
          }),
        )
      ).exitCode,
    ).toBe(2);
    expect(
      (
        await failure(
          readPassphrase({
            env: {},
            callerCwd: dir,
            ask: answers("x\ud800", "x\ud800").ask,
            confirm: true,
          }),
        )
      ).exitCode,
    ).toBe(2);
    // Control characters (which the prompt drops) and U+FFFD, from a file too.
    for (const bytes of [
      Buffer.from("Tab\tPass\n"),
      Buffer.from("First\nSecond\n"),
      Buffer.from("nul\0x"),
      Buffer.from("p\ufffdss"),
      Buffer.from("a\u2028b\n"),
    ]) {
      writeFileSync(join(dir, "odd.txt"), bytes);
      expect(
        (await failure(readPassphrase({ file: "odd.txt", env: {}, callerCwd: dir, confirm: true })))
          .exitCode,
        JSON.stringify(bytes.toString()),
      ).toBe(2);
    }
    for (const source of [
      { env: { RONNE_BACKUP_PASSPHRASE: "Tab\tPass" } },
      { env: { RONNE_BACKUP_PASSPHRASE: "a\u2028b" } },
      { env: { RONNE_BACKUP_PASSPHRASE: "a\u2029b" } },
      { env: {}, ask: answers("Tab\tPass", "Tab\tPass").ask },
    ])
      expect(
        (await failure(readPassphrase({ ...source, callerCwd: dir, confirm: true }))).exitCode,
      ).toBe(2);
    // What Node makes of a Latin-1 byte in the environment: refused, not one key for many.
    for (const source of [
      { env: { RONNE_BACKUP_PASSPHRASE: "p\ufffdss" } },
      { env: {}, ask: answers("p\ufffdss", "p\ufffdss").ask },
    ])
      expect(
        (await failure(readPassphrase({ ...source, callerCwd: dir, confirm: true }))).exitCode,
      ).toBe(2);
    const missing = await failure(
      readPassphrase({ file: "nope.txt", env: {}, callerCwd: dir, confirm: true }),
    );
    expect(missing.exitCode).toBe(1);
    expect(missing.message).toBe("The passphrase file couldn't be read (ENOENT).");
  });
});
