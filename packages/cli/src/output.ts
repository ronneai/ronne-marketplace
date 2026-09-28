import { RmkError } from "./errors.js";

export type RunResult = { exitCode: number; stdout: string; stderr: string };

/** What a command prints: sentences by default, or one JSON object with `--json`. */
export type Output = {
  json: boolean;
  lines: string[];
  data: Record<string, unknown>;
  say(line: string): void;
  set(key: string, value: unknown): void;
};

export const output = (json: boolean): Output => {
  const out: Output = {
    json,
    lines: [],
    data: {},
    say: (line) => {
      out.lines.push(line);
    },
    set: (key, value) => {
      out.data[key] = value;
    },
  };
  return out;
};

export const done = (out: Output, exitCode = 0): RunResult => ({
  exitCode,
  stdout: out.json
    ? `${JSON.stringify({ ok: exitCode === 0, ...out.data })}\n`
    : out.lines.map((l) => `${l}\n`).join(""),
  stderr: "",
});

export const failed = (out: Output, error: unknown): RunResult => {
  const known = error instanceof RmkError ? error : null;
  const message = known?.message ?? (error instanceof Error ? error.message : String(error));
  const code = known?.code ?? "error";
  const exitCode = known?.exitCode ?? 1;
  if (out.json)
    return {
      exitCode,
      stdout: `${JSON.stringify({ ok: false, ...out.data, error: { code, message, ...(known?.details ?? {}) } })}\n`,
      stderr: "",
    };
  return { exitCode, stdout: out.lines.map((l) => `${l}\n`).join(""), stderr: `${message}\n` };
};
