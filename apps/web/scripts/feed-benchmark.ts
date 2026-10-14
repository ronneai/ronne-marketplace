// pnpm --filter @ronneai/web bench:feeds [--items 1000,5000,10000] [--tools claude-code,codex,cursor]
//   [--db sqlite|postgres|mysql]
// Measures the plugin feeds' marketplaces at scale (feature 079): their size, and how long a request
// takes when no zip is built yet (cold), when the zips are built but the marketplace isn't cached
// (warm), and when it's asked again and answered from the cache (repeat). It seeds skills into a throwaway database (SQLite in memory, or a new database on the
// local test servers from `pnpm test:db:up`) and a temporary storage folder, and drops both after.
// Not part of CI: it takes minutes.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { PLUGIN_TOOLS, type PluginTool } from "@ronneai/core/plugins";
import { createTestDb } from "../src/server/db/testing/test-db";
import { FeedTooLargeError } from "../src/server/domains/feeds/exceptions/errors";
import { MARKETPLACE_MAX_BYTES } from "../src/server/domains/feeds/models/feed";
import { kyselyFeedRepository } from "../src/server/domains/feeds/repositories/kysely-feed-repository";
import { createMarketplaceCache } from "../src/server/domains/feeds/services/marketplace-cache";
import { type FeedDeps, marketplace } from "../src/server/domains/feeds/services/plugin-feed";
import type { CurrentUser } from "../src/server/domains/identity/models/user";
import { kyselyCatalogueRepository } from "../src/server/domains/items/repositories/kysely-catalogue-repository";
import { kyselyItemRepository } from "../src/server/domains/items/repositories/kysely-item-repository";
import { UNFILTERED } from "../src/server/domains/workspaces/models/viewer";
import { createLogger } from "../src/server/log/logger";
import { SERVERS, seedSkills } from "./bench-seed";

const { values } = parseArgs({
  options: {
    items: { type: "string", default: "1000,5000,10000" },
    tools: { type: "string", default: PLUGIN_TOOLS.join(",") },
    db: { type: "string", default: "sqlite" },
  },
});
const counts = (values.items ?? "")
  .split(",")
  .map((n) => Number(n.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);
const tools = (values.tools ?? "")
  .split(",")
  .filter((t): t is PluginTool => (PLUGIN_TOOLS as readonly string[]).includes(t));
const db = values.db ?? "sqlite";
if (!counts.length || !tools.length || !(db in SERVERS)) {
  console.error(
    "Usage: bench:feeds [--items 1000,5000] [--tools codex] [--db sqlite|postgres|mysql]",
  );
  process.exit(2);
}
if (SERVERS[db]) process.env.TEST_DATABASE_URL = SERVERS[db];
else delete process.env.TEST_DATABASE_URL;

const user: CurrentUser = {
  id: "bench",
  email: "bench@example.com",
  name: "Bench",
  role: "user",
  workspaces: {},
};
const PUBLIC_URL = "https://registry.example.com";
const seconds = (ms: number) => (ms / 1000).toFixed(2);

const rows: string[] = [];
for (const count of counts) {
  // Its own database, which cleanup() drops (a shared one is only for test files, 112).
  const t = await createTestDb({ fresh: true });
  const root = mkdtempSync(join(tmpdir(), "ronne-bench-"));
  try {
    const seeded = performance.now();
    const storage = await seedSkills(t, root, count);
    console.error(`${db}: seeded ${count} items in ${seconds(performance.now() - seeded)} s`);
    const deps: FeedDeps = {
      catalogue: kyselyCatalogueRepository(t.db, t.dialect, UNFILTERED),
      items: kyselyItemRepository(t.db, t.dialect, UNFILTERED),
      storage,
      // The real cost: no budget, so a cold request builds every plugin.
      buildBudgetMs: Number.POSITIVE_INFINITY,
      log: createLogger({ level: "error", format: "json", write: () => {} }),
      feeds: kyselyFeedRepository(t.db, t.dialect),
    };
    for (const tool of tools) {
      // Cold and warm each start with an empty cache; the repeat asks the warm one's again.
      const timed = async (cache: ReturnType<typeof createMarketplaceCache>) => {
        const started = performance.now();
        try {
          const bytes = await marketplace({ ...deps, cache }, { user, ip: null }, tool, PUBLIC_URL);
          return { ms: performance.now() - started, size: bytes.length };
        } catch (error) {
          if (!(error instanceof FeedTooLargeError)) throw error;
          return { ms: performance.now() - started, size: Number.NaN };
        }
      };
      const cold = await timed(createMarketplaceCache());
      const warmCache = createMarketplaceCache();
      const warm = await timed(warmCache);
      const repeat = await timed(warmCache);
      const size = Number.isNaN(cold.size)
        ? "over 5 MiB (507)"
        : `${(cold.size / 1024).toFixed(0)} KiB (${((cold.size / MARKETPLACE_MAX_BYTES) * 100).toFixed(1)}%)`;
      rows.push(
        `| ${db} | ${count} | ${tool} | ${size} | ${seconds(cold.ms)} | ${seconds(warm.ms)} | ${seconds(repeat.ms)} |`,
      );
      console.error(rows.at(-1));
    }
  } finally {
    await t.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
}

console.log("| Database | Items | Tool | Marketplace size | Cold (s) | Warm (s) | Repeat (s) |");
console.log("|---|---|---|---|---|---|---|");
for (const row of rows) console.log(row);
