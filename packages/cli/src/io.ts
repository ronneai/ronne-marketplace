import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";

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
};

/** The current time, from the `Io` when it has a clock. */
export const nowOf = (io: Io): Date => io.now?.() ?? new Date();

const ask = async (question: string, secret: boolean): Promise<string> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  try {
    if (!secret) return (await rl.question(question)).trim();
    // Echo off: readline writes what it receives, so the answer is collected from the raw stream.
    process.stdout.write(question);
    const answer = await new Promise<string>((resolve) => {
      let typed = "";
      const onData = (chunk: Buffer) => {
        for (const char of chunk.toString("utf8")) {
          if (char === "\n" || char === "\r") {
            process.stdin.off("data", onData);
            process.stdout.write("\n");
            resolve(typed);
            return;
          }
          if (char === "\u007f" || char === "\b") typed = typed.slice(0, -1);
          else typed += char;
        }
      };
      process.stdin.setRawMode?.(true);
      process.stdin.on("data", onData);
    });
    process.stdin.setRawMode?.(false);
    return answer.trim();
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
});
