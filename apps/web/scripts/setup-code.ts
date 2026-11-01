// pnpm run setup-code (161): prints the code the web setup asks for, making one if there's none.
// Exit codes: 0 printed, 1 the instance is already set up (there's no code), 2 the code couldn't be
// made (the data folder can't be written).
import { resolve } from "node:path";
import { runSetupCode, setupCodeLines } from "../src/server/setup/setup-code-command";

const appDir = resolve(import.meta.dirname, "..");

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(
    "Usage: setup-code\n\nPrints the setup code the web setup asks for, making one if there's none.",
  );
  process.exit(0);
}

try {
  const answer = await runSetupCode({ appDir });
  if (answer.kind === "set-up") {
    console.error(`✗ ${answer.message}`);
    process.exitCode = 1;
  } else {
    for (const line of setupCodeLines(answer)) console.log(line);
  }
} catch (error) {
  console.error(`✗ The setup code couldn't be made: ${(error as Error).message}`);
  process.exitCode = 2;
}
