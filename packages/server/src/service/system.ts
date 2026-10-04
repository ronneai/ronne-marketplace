// What `rmk-server service` does to the machine, behind one interface (feature 083), so the
// install logic is tested with a fake and runs for real only as root on a real system.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  accessSync,
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { basename, delimiter, dirname, join } from "node:path";
import { createInterface } from "node:readline";

export type RunResult = { code: number; stdout: string; stderr: string };

export type System = {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  isRoot: () => boolean;
  /** Runs a program and waits; never throws (a missing program is code 127). */
  run: (command: string, args: string[]) => RunResult;
  /**
   * Runs a program attached to this terminal (logs that follow, a setup), returning its exit code.
   * A signal that ends rmk-server (timeout, kill) is passed on, so the program doesn't outlive it.
   */
  runAttached: (
    command: string,
    args: string[],
    options?: {
      cwd?: string;
      env?: Record<string, string | undefined>;
      uid?: number;
      gid?: number;
    },
  ) => Promise<number>;
  /** The absolute path of a program on PATH. */
  which: (name: string) => string | undefined;
  exists: (path: string) => boolean;
  /** Whether the path is a symbolic link, or a file with another hard link to it. */
  isLink: (path: string) => boolean;
  readFile: (path: string) => string | undefined;
  /**
   * Writes a whole file, replacing it, with these permissions: through a new file made next to it
   * (never one that's already there, so not through a link someone put in its place) and a rename,
   * which replaces a link rather than following it.
   */
  writeFile: (path: string, content: string, mode: number) => void;
  /** Creates a folder (and its parents) and sets its permissions. */
  mkdir: (path: string, mode: number) => void;
  remove: (path: string) => void;
  portFree: (port: number, host: string) => Promise<boolean>;
  /** The HTTP status of a GET, or undefined when nothing answers. */
  httpStatus: (url: string) => Promise<number | undefined>;
  sleep: (ms: number) => Promise<void>;
  /** Reads one line from standard input after printing the question. */
  ask: (question: string) => Promise<string>;
  out: (text: string) => void;
  err: (text: string) => void;
};

const portFree = (port: number, host: string): Promise<boolean> =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, host);
  });

export const realSystem = (): System => ({
  platform: process.platform,
  env: process.env,
  isRoot: () => process.getuid?.() === 0,
  run: (command, args) => {
    const result = spawnSync(command, args, { encoding: "utf8" });
    return {
      code: result.error ? 127 : (result.status ?? 1),
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? (result.error ? String(result.error.message) : ""),
    };
  },
  runAttached: (command, args, options = {}) =>
    new Promise((resolve) => {
      const child = spawn(command, args, { stdio: "inherit", ...options });
      const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
      const forward = (signal: NodeJS.Signals) => child.kill(signal);
      for (const signal of signals) process.on(signal, forward);
      const done = (code: number) => {
        for (const signal of signals) process.off(signal, forward);
        resolve(code);
      };
      child.once("error", () => done(127));
      child.once("exit", (code, signal) => done(code ?? (signal ? 128 : 1)));
    }),
  which: (name) => {
    for (const dir of (process.env.PATH ?? "").split(delimiter)) {
      if (!dir) continue;
      const path = join(dir, name);
      try {
        accessSync(path, constants.X_OK);
        return path;
      } catch {
        // not here
      }
    }
    return undefined;
  },
  exists: (path) => existsSync(path),
  isLink: (path) => {
    try {
      const stat = lstatSync(path);
      return stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1);
    } catch {
      return false;
    }
  },
  readFile: (path) => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return undefined;
    }
  },
  writeFile: (path, content, mode) => {
    const temporary = join(dirname(path), `.${basename(path)}.${randomBytes(6).toString("hex")}`);
    // "wx": fails if the name exists, a link included. The mode is set on the open file, not by
    // name, which could be swapped in between.
    const fd = openSync(temporary, "wx", mode);
    try {
      writeFileSync(fd, content);
      fchmodSync(fd, mode);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, path);
  },
  mkdir: (path, mode) => {
    mkdirSync(path, { recursive: true, mode });
    chmodSync(path, mode);
  },
  remove: (path) => rmSync(path, { recursive: true, force: true }),
  portFree,
  httpStatus: async (url) => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      await response.body?.cancel();
      return response.status;
    } catch {
      return undefined;
    }
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ask: (question) =>
    new Promise((resolve) => {
      const lines = createInterface({ input: process.stdin, output: process.stdout });
      let answered = false;
      lines.question(question, (answer) => {
        answered = true;
        lines.close();
        resolve(answer.trim());
      });
      lines.once("close", () => {
        if (!answered) resolve("");
      });
    }),
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
});
