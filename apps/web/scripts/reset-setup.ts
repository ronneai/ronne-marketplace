// pnpm run reset-setup: puts this clone back to "not set up", so the web setup (feature 036) can
// be tried again. Development only: it refuses in production and in Docker. It lists what it will
// remove and asks first, or takes --yes. Exit codes: 0 done, 1 cancelled, 2 refused or bad input.
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import * as p from "@clack/prompts";
import { applyReset, planReset, ResetRefusedError } from "../src/server/setup/reset-setup";

const appDir = resolve(import.meta.dirname, "..");

let yes = false;
try {
  yes =
    parseArgs({ args: process.argv.slice(2), strict: true, options: { yes: { type: "boolean" } } })
      .values.yes === true;
} catch (error) {
  console.error(`✗ ${(error as Error).message}`);
  process.exit(2);
}

let plan: ReturnType<typeof planReset>;
try {
  plan = planReset({ appDir });
} catch (error) {
  if (!(error instanceof ResetRefusedError)) throw error;
  console.error(`✗ ${error.message}`);
  process.exit(2);
}

const labels = {
  settings: "settings file",
  database: "SQLite database",
  storage: "storage folder",
};
if (plan.items.length === 0) {
  console.log("Nothing to reset: this clone isn't set up.");
  for (const note of plan.notes) console.log(`  ${note}`);
  process.exit(0);
}

console.log("This removes:");
for (const item of plan.items) console.log(`  ${labels[item.kind]}: ${item.path}`);
for (const note of plan.notes) console.log(`  ${note}`);

if (!yes) {
  if (!(process.stdin.isTTY && process.stdout.isTTY)) {
    console.error("✗ There's no terminal to ask for confirmation. Run it with --yes.");
    process.exit(2);
  }
  const answer = await p.confirm({ message: "Remove them?", initialValue: false });
  if (p.isCancel(answer) || !answer) {
    console.log("Nothing was removed.");
    process.exit(1);
  }
}

for (const path of applyReset(plan)) console.log(`✓ Removed ${path}`);
console.log("Done. A running `pnpm dev` shows the setup on the next request.");
