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
};

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

export const defaultIo = (): Io => ({
  env: process.env,
  home: homedir(),
  cwd: process.cwd(),
  fetch: globalThis.fetch,
  interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  prompt: (question, options) => ask(question, options?.secret ?? false),
  sendInBackground: () => {
    const script = process.argv[1];
    if (!script) return;
    spawn(process.execPath, [script, "telemetry", "flush"], {
      detached: true,
      stdio: "ignore",
    }).unref();
  },
});
