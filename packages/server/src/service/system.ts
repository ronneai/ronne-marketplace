// What `rmk-server service` does to the machine, behind one interface (feature 083), so the
// install logic is tested with a fake and runs for real only as root on a real system.
import { spawnSync } from "node:child_process";
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { delimiter, join } from "node:path";
import { createInterface } from "node:readline";

export type RunResult = { code: number; stdout: string; stderr: string };

export type System = {
  platform: NodeJS.Platform;
  isRoot: () => boolean;
  /** Runs a program and waits; never throws (a missing program is code 127). */
  run: (command: string, args: string[]) => RunResult;
  /** Runs a program attached to this terminal (logs that follow), returning its exit code. */
  runAttached: (command: string, args: string[]) => number;
  /** The absolute path of a program on PATH. */
  which: (name: string) => string | undefined;
  exists: (path: string) => boolean;
  /** Whether the path is a symbolic link, or a file with another hard link to it. */
  isLink: (path: string) => boolean;
  readFile: (path: string) => string | undefined;
  /** Writes a whole file, replacing it, with these permissions. */
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
  isRoot: () => process.getuid?.() === 0,
  run: (command, args) => {
    const result = spawnSync(command, args, { encoding: "utf8" });
    return {
      code: result.error ? 127 : (result.status ?? 1),
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? (result.error ? String(result.error.message) : ""),
    };
  },
  runAttached: (command, args) => {
    const result = spawnSync(command, args, { stdio: "inherit" });
    return result.error ? 127 : (result.status ?? 1);
  },
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
    writeFileSync(path, content, { mode });
    chmodSync(path, mode);
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
