import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

export type RunResult = { exitCode: number; stdout: string; stderr: string };

function readVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  return pkg.version;
}

/** Runs rmk with the given arguments (without the node and script paths). */
export function run(argv: string[]): RunResult {
  let values: { version?: boolean | undefined };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: { version: { type: "boolean", short: "v" } },
      allowPositionals: true,
    }));
  } catch (error) {
    return { exitCode: 2, stdout: "", stderr: `${(error as Error).message}\n` };
  }

  if (values.version) {
    return { exitCode: 0, stdout: `${readVersion()}\n`, stderr: "" };
  }

  return { exitCode: 2, stdout: "", stderr: "Usage: rmk --version\n" };
}
