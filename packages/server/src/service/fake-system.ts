// An in-memory System for the service tests (feature 083). Not shipped: tests only import it.
import type { RunResult, System } from "./system.js";

export type FakeSystem = System & {
  files: Map<string, { content: string; mode: number }>;
  dirs: Map<string, number>;
  commands: string[];
  output: string[];
  errors: string[];
  /** Ports that are in use. */
  busy: Set<number>;
  /** What run() answers, by the start of the command line; default code 0 and no output. */
  answers: Map<string, Partial<RunResult>>;
  /** What httpStatus() answers, in turn (the last one repeats). */
  statuses: (number | undefined)[];
  answer: string;
  /** The options runAttached was given (uid, gid, env, cwd). */
  attached: NonNullable<Parameters<System["runAttached"]>[2]>[];
  /** Paths that are symbolic links. */
  links: Set<string>;
};

export const fakeSystem = (
  options: { root?: boolean; platform?: NodeJS.Platform } = {},
): FakeSystem => {
  const sys: FakeSystem = {
    platform: options.platform ?? "linux",
    env: {},
    files: new Map(),
    dirs: new Map(),
    commands: [],
    output: [],
    errors: [],
    busy: new Set(),
    answers: new Map(),
    statuses: [503],
    answer: "",
    links: new Set(),
    attached: [],
    isRoot: () => options.root ?? true,
    run: (command, args) => {
      const line = [command, ...args].join(" ");
      sys.commands.push(line);
      // The longest matching prefix wins, so a specific answer overrides a general one.
      const found = [...sys.answers]
        .filter(([prefix]) => line.startsWith(prefix))
        .sort(([a], [b]) => b.length - a.length)[0]?.[1];
      return { code: 0, stdout: "", stderr: "", ...found };
    },
    runAttached: async (command, args, options) => {
      sys.commands.push([command, ...args].join(" "));
      if (options) sys.attached.push(options);
      return 0;
    },
    which: (name) => (sys.files.has(`/usr/bin/${name}`) ? `/usr/bin/${name}` : undefined),
    isLink: (path) => sys.links.has(path),
    // A folder exists when it was made or holds a file, as on a disk.
    exists: (path) =>
      sys.files.has(path) ||
      sys.dirs.has(path) ||
      [...sys.files.keys()].some((file) => file.startsWith(`${path}/`)),
    readFile: (path) => sys.files.get(path)?.content,
    writeFile: (path, content, mode) => {
      sys.files.set(path, { content, mode });
    },
    mkdir: (path, mode) => {
      sys.dirs.set(path, mode);
    },
    remove: (path) => {
      for (const key of [...sys.files.keys()])
        if (key === path || key.startsWith(`${path}/`)) sys.files.delete(key);
      sys.dirs.delete(path);
    },
    portFree: async (port) => !sys.busy.has(port),
    httpStatus: async () => (sys.statuses.length > 1 ? sys.statuses.shift() : sys.statuses[0]),
    sleep: async () => {},
    ask: async (question) => {
      sys.output.push(question);
      return sys.answer;
    },
    out: (text) => {
      sys.output.push(text);
    },
    err: (text) => {
      sys.errors.push(text);
    },
  };
  return sys;
};
