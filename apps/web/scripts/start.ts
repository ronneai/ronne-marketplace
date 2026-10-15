// The Docker image's entry point (feature 005): checks the data volume, applies pending migrations
// when Ronne is set up, then starts Next.js's standalone server in this process.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { prepareStart, StartError, type StartPlan } from "../src/server/setup/prepare-start";
import { logStarted } from "../src/server/setup/started";

const appDir = resolve(import.meta.dirname, "..");
const dataDir = process.env.RONNE_DATA_DIR || resolve(appDir, "data");

let plan: StartPlan;
try {
  plan = await prepareStart({ appDir, dataDir });
} catch (error) {
  if (!(error instanceof StartError)) throw error;
  console.error(`✗ ${error.message}`);
  process.exit(1);
}

const server = resolve(appDir, "server.js");
if (!existsSync(server)) {
  console.error(
    `✗ ${server} is missing: this script runs inside the Docker image, after a standalone build.`,
  );
  process.exit(1);
}
await import(pathToFileURL(server).href);
logStarted(plan);
