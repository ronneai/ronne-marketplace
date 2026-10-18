import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { RmkError } from "./errors.js";

/**
 * What rmk touches outside its own code (feature 022): the environment, the home folder, the
 * working folder, the network and the terminal. Tests give a fake one; `defaultIo()` is the real one.
 */
export type Io = {
  env: Record<string, string | undefined>;
  home: string;
  cwd: string;
  fetch: typeof fetch;
  /** Whether a person is at the terminal, so rmk may ask questions. */
  interactive: boolean;
  /** Asks a question; `secret` hides what's typed. */
  prompt(question: string, options?: { secret?: boolean }): Promise<string>;
  /** The time; tests fix it. Defaults to the clock. */
  now?: () => Date;
  /** Everything on standard input, for `rmk telemetry hook` (046). Defaults to reading it. */
  readStdin?: () => Promise<string>;
  /** Starts `rmk telemetry flush` detached, so a tool's hook never waits for the network (046). */
  sendInBackground?: () => void;
  /**
   * Prints a line at once, on stderr, for what a person must see while rmk waits (107's code and
   * address). A command's own output still comes at its end.
   */
  notice?: (line: string) => void;
  /** Opens an address in the default browser; a failure is ignored (107). */
  openUrl?: (url: string) => void;
  /** Waits, until `signal` aborts; tests skip the time. Defaults to a timer. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Calls `handler` on Ctrl-C until the returned function is called (107). */
  onInterrupt?: (handler: () => void) => () => void;
};

/** The command a platform opens an address with, without a new dependency (107). */
export const openCommand = (
  platform: NodeJS.Platform,
  url: string,
): { command: string; args: string[] } =>
  platform === "darwin"
    ? { command: "open", args: [url] }
    : platform === "win32"
      ? // Not `cmd /c start`: cmd parses its own command line, and Node's quoting of `start`'s
        // title argument isn't what cmd expects. The URL handler takes the address as it is.
        { command: "rundll32", args: ["url.dll,FileProtocolHandler", url] }
      : { command: "xdg-open", args: [url] };

/** The current time, from the `Io` when it has a clock. */
export const nowOf = (io: Io): Date => io.now?.() ?? new Date();

/** The streams a secret is read from and echoed to: the terminal, or fakes in tests. */
export type SecretStreams = {
  input: NodeJS.ReadableStream & { setRawMode?: (raw: boolean) => unknown; isRaw?: boolean };
  output: { write(text: string): unknown };
};

/**
 * Reads a secret, such as a password, showing one `*` per character and never the characters.
 * No readline interface may be listening meanwhile: readline echoes what it reads (022's bug).
 * Backspace takes a character back; Ctrl-C cancels; Enter or Ctrl-D finishes.
 */
export const readSecret = (question: string, { input, output }: SecretStreams): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const wasRaw = input.isRaw === true;
    let typed = "";
    const finish = (settle: () => void) => {
      input.off("data", onData);
      input.setRawMode?.(wasRaw);
      input.pause();
      output.write("\n");
      settle();
    };
    const onData = (chunk: Buffer | string) => {
      for (const char of typeof chunk === "string" ? chunk : chunk.toString("utf8")) {
        if (char === "\n" || char === "\r" || char === "\u0004") {
          finish(() => resolve(typed));
          return;
        }
        if (char === "\u0003") {
          finish(() => reject(new RmkError("Cancelled.", 1, "cancelled")));
          return;
        }
        if (char === "\u007f" || char === "\b") {
          if (typed) {
            typed = [...typed].slice(0, -1).join("");
            output.write("\b \b");
          }
        } else if (char >= " ") {
          typed += char;
          output.write("*");
        }
      }
    };
    output.write(question);
    input.setRawMode?.(true);
    input.on("data", onData);
    input.resume();
  });

const ask = async (question: string, secret: boolean): Promise<string> => {
  if (secret)
    return (await readSecret(question, { input: process.stdin, output: process.stdout })).trim();
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
};

/** A timer that an abort ends at once, clearing it, so Ctrl-C doesn't leave the process waiting. */
export const waitFor = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });

export const defaultIo = (): Io => ({
  env: process.env,
  home: homedir(),
  cwd: process.cwd(),
  fetch: globalThis.fetch,
  interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  prompt: (question, options) => ask(question, options?.secret ?? false),
  notice: (line) => {
    process.stderr.write(`${line}\n`);
  },
  openUrl: (url) => {
    const { command, args } = openCommand(process.platform, url);
    try {
      const child = spawn(command, args, { detached: true, stdio: "ignore" });
      child.on("error", () => {});
      child.unref();
    } catch {
      // The address was printed anyway.
    }
  },
  sleep: (ms, signal) => waitFor(ms, signal),
  onInterrupt: (handler) => {
    process.once("SIGINT", handler);
    return () => process.off("SIGINT", handler);
  },
  sendInBackground: () => {
    const script = process.argv[1];
    if (!script) return;
    spawn(process.execPath, [script, "telemetry", "flush"], {
      detached: true,
      stdio: "ignore",
    }).unref();
  },
});
