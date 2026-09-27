// pnpm run setup: configures this instance (feature 003). `pnpm setup` without `run` is a pnpm
// built-in that configures pnpm itself, so always use `pnpm run setup`.
import { join, resolve } from "node:path";
import * as p from "@clack/prompts";
import { clackPrompts } from "../src/server/setup/clack-prompts";
import { SetupCancelledError } from "../src/server/setup/prompts";
import { runSetup, SetupFailedError } from "../src/server/setup/run-setup";

const appDir = resolve(import.meta.dirname, "..");
const envPath = join(appDir, ".env");

p.intro("Ronne setup");
try {
  const result = await runSetup({ appDir, envPath, prompts: clackPrompts });
  p.outro(
    [
      "Ronne is set up.",
      "Start it with `pnpm build && pnpm start` (or `pnpm dev` while developing),",
      `then open ${result.publicUrl} and sign in as ${result.rootEmail}.`,
    ].join("\n"),
  );
} catch (error) {
  if (error instanceof SetupCancelledError || error instanceof SetupFailedError) {
    p.cancel(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
