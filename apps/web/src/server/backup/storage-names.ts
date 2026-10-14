// Stored files' names the storage folder can't hold (099). A backup from a disk that tells case
// apart (Linux's, usually) can hold `acme/a.tgz` and `ACME/a.tgz`; on macOS's and Windows' disks,
// exFAT, SMB or a casefolded folder they're one file; and a disk can refuse a name outright (too
// long, a character it doesn't take), or the folder can't be written. Rules for how each disk
// compares names always miss some, so restore asks the storage folder itself: before writing
// anything, it makes every stored file, empty, at the very path the restore writes it, then
// removes what it made, leaving the folder as it was (empty, or not there). What fails there
// would have failed the restore after the rows were in.
import { closeSync, existsSync, mkdirSync, openSync, rmdirSync, unlinkSync } from "node:fs";
import { lstat, stat } from "node:fs/promises";
import { basename, dirname, join, sep } from "node:path";

export type StorageProblem =
  /** `b` lands on `a`, a stored file or a folder of one (one name on this disk). */
  | { kind: "same"; a: string; b: string }
  /** `b` lands on something the disk doesn't say which. */
  | { kind: "taken"; b: string }
  /** `b` can't be made there at all. */
  | { kind: "unmade"; b: string; code: string };

const codeOf = (error: unknown) => (error as NodeJS.ErrnoException | null)?.code ?? "an error";

const there = async (path: string) =>
  lstat(path).then(
    () => true,
    () => false,
  );

const quietly = (remove: () => void) => {
  try {
    remove();
  } catch {
    // Gone already, or the disk keeps it: `leftover` names what stays.
  }
};

/** The deepest path on the way to `path` that's there: what the disk put in its place. */
const deepestThere = async (path: string) => {
  let at = path;
  while (!(await there(at)) && dirname(at) !== at) at = dirname(at);
  return at;
};

/** The stored name (or the folder of one) made earlier that the disk says `blocker` is. */
const earlierAt = async (root: string, keys: string[], blocker: string) => {
  const target = await stat(blocker, { bigint: true }).catch(() => null);
  if (!target) return null;
  for (const key of keys) {
    const parts = key.split("/");
    for (let end = parts.length; end >= 1; end--) {
      const named = await stat(join(root, ...parts.slice(0, end)), { bigint: true }).catch(
        () => null,
      );
      if (named && named.dev === target.dev && named.ino === target.ino)
        return parts.slice(0, end).join("/");
    }
  }
  return null;
};

/** The signals a terminal or a service manager sends to stop it, and the exit code for each. */
const EXIT_ON = { SIGHUP: 129, SIGINT: 130, SIGQUIT: 131, SIGTERM: 143 } as const;

/**
 * Makes each stored file (`storage/<key>`) empty at its path under `storageRoot`, as restore
 * would, then removes exactly what it made (the files, the folders it made for them, and the
 * `._name` files macOS adds beside them on exFAT and FAT, when they weren't there before), never
 * anything else. The first problem, or none; `leftover` lists what couldn't be removed. A stopping
 * signal while it runs removes what it made, says what's left, and exits.
 */
export const checkStorageNames = async (
  paths: string[],
  storageRoot: string,
): Promise<{ problem?: StorageProblem; leftover?: string[] }> => {
  const keys = paths.filter((p) => p.startsWith("storage/")).map((p) => p.slice(8));
  if (keys.length === 0) return {};
  /** What it made, in order: folders top-down, each file after its folders. */
  const made: string[] = [];
  /**
   * The `._name` files the disk made with what it made (macOS on exFAT and FAT), seen right after:
   * one that was there before, or that another program writes later, is never removed.
   */
  const doublesMade = new Set<string>();
  const doubleOf = (path: string) => join(dirname(path), `._${basename(path)}`);
  const before = (path: string) => existsSync(doubleOf(path));
  const after = (path: string, wasThere: boolean) => {
    if (!wasThere && existsSync(doubleOf(path))) doublesMade.add(doubleOf(path));
  };

  /** Removes what it made, newest first; synchronous, so a signal handler can run it. */
  const undo = () => {
    for (const path of [...made].reverse()) {
      // By the names they were made with: macOS's exFAT lists Å decomposed, then can't remove
      // it by that spelling. A folder someone else wrote into meanwhile stays (rmdir, not rm).
      quietly(() => rmdirSync(path));
      quietly(() => unlinkSync(path));
      if (doublesMade.has(doubleOf(path))) quietly(() => unlinkSync(doubleOf(path)));
    }
  };
  const leftovers = () => made.filter((path) => existsSync(path));

  const onSignal = (signal: keyof typeof EXIT_ON) => {
    undo();
    const left = leftovers();
    if (left.length > 0)
      process.stderr.write(
        `Stopped while trying the backup's files in the storage folder: ${left.join(", ")} couldn't be removed; remove ${left.length > 1 ? "them" : "it"}.\n`,
      );
    process.exit(EXIT_ON[signal]);
  };
  const signals = Object.keys(EXIT_ON) as (keyof typeof EXIT_ON)[];
  for (const signal of signals) process.on(signal, onSignal);

  let problem: StorageProblem | undefined;
  try {
    for (const [index, key] of keys.entries()) {
      // Each step synchronous, so what it made is always recorded; a signal is handled here,
      // between files, never with a folder made and not yet noted.
      if (index % 256 === 255) await new Promise((resolve) => setImmediate(resolve));
      const path = join(storageRoot, ...key.split("/"));
      try {
        // The folders it's about to make, top-down, each noted before it's made.
        const missing: string[] = [];
        for (let at = dirname(path); !existsSync(at) && dirname(at) !== at; at = dirname(at))
          missing.unshift(at);
        for (const folder of missing) {
          const had = before(folder);
          mkdirSync(folder);
          made.push(folder);
          after(folder, had);
        }
        const had = before(path);
        closeSync(openSync(path, "wx"));
        made.push(path);
        after(path, had);
      } catch (error) {
        const code = codeOf(error);
        const blocker = await deepestThere(path);
        const madeHere = made.includes(blocker) || blocker.startsWith(`${storageRoot}${sep}`);
        // Windows says ENOENT where a file stands for a folder on the way (macOS and Linux:
        // ENOTDIR), and also for a name too long: only the file there makes it one in the way.
        const fileThere = await lstat(blocker).then(
          (found) => !found.isDirectory(),
          () => false,
        );
        const inTheWay =
          ["EEXIST", "ENOTDIR", "EISDIR"].includes(code) || (code === "ENOENT" && fileThere);
        if (inTheWay && madeHere) {
          // The file in the way, or the folder the file landed on.
          const madeKeys = made
            .filter((m) => m.startsWith(`${storageRoot}${sep}`))
            .map((m) =>
              m
                .slice(storageRoot.length + 1)
                .split(sep)
                .join("/"),
            );
          const earlier = await earlierAt(storageRoot, madeKeys, blocker);
          problem = earlier
            ? { kind: "same", a: `storage/${earlier}`, b: `storage/${key}` }
            : { kind: "taken", b: `storage/${key}` };
        } else problem = { kind: "unmade", b: `storage/${key}`, code };
        break;
      }
    }
  } finally {
    undo();
    // A signal that came during the synchronous stretches waits in the event loop: let it in
    // (its handler undoes, again, and exits) before the handlers go.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (const signal of signals) process.off(signal, onSignal);
  }
  const left = leftovers();
  return { ...(problem ? { problem } : {}), ...(left.length > 0 ? { leftover: left } : {}) };
};
