// What `rmk-server service` does to the machine, behind one interface (feature 083), so the
// install logic is tested with a fake and runs for real only as root on a real system.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  accessSync,
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fchmodSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  type Stats,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { basename, delimiter, dirname, join } from "node:path";
import { createInterface } from "node:readline";

export type RunResult = { code: number; stdout: string; stderr: string };

export type System = {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  /** Root on Linux and macOS; on Windows, an elevated (administrator) process. */
  isRoot: () => boolean;
  /**
   * Runs a program and waits; never throws (a missing program is code 127). With `uid` and `gid`
   * it runs as that account (from root), with no runuser or sudo, which minimal systems lack.
   */
  run: (command: string, args: string[], as?: { uid: number; gid: number }) => RunResult;
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
  /** Creates a folder (and any missing parents, 755) and sets the folder's own permissions. */
  mkdir: (path: string, mode: number) => void;
  remove: (path: string) => void;
  /** Copies a file over another (a program: WinSW, 086). */
  copyFile: (from: string, to: string) => void;
  /**
   * The links at or under `path` (symbolic links, junctions, files with another hard link), without
   * following any: on Windows the administrator's scripts refuse to run over one in the data
   * folder, which the service's account may write (086).
   */
  findLinks: (path: string) => string[];
  /** Prints the last lines of these files, then what's added, until interrupted (Windows' logs). */
  followFiles: (paths: string[], lines: number) => Promise<number>;
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
  isRoot: () =>
    process.platform === "win32"
      ? // fltmc (the filter manager) answers only an elevated process; it's on every Windows.
        spawnSync("fltmc", [], { stdio: "ignore" }).status === 0
      : process.getuid?.() === 0,
  run: (command, args, as) => {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      ...(as ? { uid: as.uid, gid: as.gid, cwd: "/" } : {}),
    });
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
    // Windows finds programs by their extensions (PATHEXT: .COM;.EXE;.BAT;.CMD…).
    const extensions =
      process.platform === "win32"
        ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
        : [""];
    for (const dir of (process.env.PATH ?? "").split(delimiter)) {
      if (!dir) continue;
      for (const extension of extensions) {
        const path = join(dir, `${name}${extension.toLowerCase()}`);
        try {
          accessSync(path, constants.X_OK);
          if (process.platform !== "win32" || statSync(path).isFile()) return path;
        } catch {
          // not here
        }
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
    // Parents it has to make get the usual 755 (mode would apply to them too, and a 750
    // /usr/local/var would shut the service's account out); only the folder itself gets mode.
    mkdirSync(path, { recursive: true });
    chmodSync(path, mode);
  },
  remove: (path) => rmSync(path, { recursive: true, force: true }),
  copyFile: (from, to) => copyFileSync(from, to),
  findLinks: (root) => {
    const found: string[] = [];
    const visit = (path: string) => {
      let stat: Stats;
      try {
        stat = lstatSync(path);
      } catch {
        return;
      }
      // On Windows a junction is a symbolic link to lstat.
      if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) found.push(path);
      else if (stat.isDirectory()) for (const name of readdirSync(path)) visit(join(path, name));
    };
    visit(root);
    return found;
  },
  followFiles: (paths, lines) =>
    new Promise((resolve) => {
      const offsets = new Map<string, number>();
      const many = paths.length > 1;
      let last: string | undefined;
      const print = (path: string, text: string) => {
        if (!text) return;
        if (many && last !== path) process.stdout.write(`==> ${path} <==\n`);
        last = path;
        process.stdout.write(text);
      };
      for (const path of paths) {
        const content = existsSync(path) ? readFileSync(path, "utf8") : "";
        const tail = content.split(/\r?\n/);
        if (tail.at(-1) === "") tail.pop();
        print(path, tail.length ? `${tail.slice(-lines).join("\n")}\n` : "");
        offsets.set(path, Buffer.byteLength(content));
      }
      // WinSW rolls a file by renaming it and starting a new one: a smaller size starts again.
      const timer = setInterval(() => {
        for (const path of paths) {
          let size: number;
          try {
            size = statSync(path).size;
          } catch {
            continue;
          }
          const from = (offsets.get(path) ?? 0) > size ? 0 : (offsets.get(path) ?? 0);
          if (size === from) continue;
          const fd = openSync(path, "r");
          try {
            const buffer = Buffer.alloc(size - from);
            readSync(fd, buffer, 0, buffer.length, from);
            print(path, buffer.toString("utf8"));
          } finally {
            closeSync(fd);
          }
          offsets.set(path, size);
        }
      }, 1000);
      process.once("SIGINT", () => {
        clearInterval(timer);
        resolve(0);
      });
    }),
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
