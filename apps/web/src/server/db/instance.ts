import { type CreatedDb, createDb } from "./create-db";

// One database connection pool per URL for the running server, kept on globalThis so development
// hot reloads don't open a new pool each time.
const pools = globalThis as typeof globalThis & { __ronneDbPools?: Map<string, CreatedDb> };

/** The server's shared database for DATABASE_URL, created on first use. */
export const getAppDb = (databaseUrl: string, baseDir: string = process.cwd()): CreatedDb => {
  pools.__ronneDbPools ??= new Map();
  let created = pools.__ronneDbPools.get(databaseUrl);
  if (!created) {
    created = createDb(databaseUrl, { baseDir });
    pools.__ronneDbPools.set(databaseUrl, created);
  }
  return created;
};
