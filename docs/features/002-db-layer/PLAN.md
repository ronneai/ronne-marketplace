# 002 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [ ] **1. Spike: Better Auth schema and timestamps.** In a scratch branch, run Better Auth's schema
  generator for the Kysely adapter, and do a sign-up and sign-in against SQLite and PostgreSQL with
  snake_case field mapping, ULID ids and the planned timestamp types. Record the exact column list
  and any adapter quirks in this plan's Notes, then throw the spike away.
  *Done when:* Notes list the columns for `user`, `session`, `account` and `verification`, and confirm the timestamp approach works (or say what changes in SPEC.md).

- [ ] **2. Dialect factory.** `createDb(url)` for the three URL formats, SQLite pragmas, MySQL UTC
  session time zone, and a clear error for unknown formats. Add the drivers (after the dependency policy
  checklist) and add `better-sqlite3: true` to `allowBuilds`, with the reason in the pull request.
  *Done when:* unit tests cover URL parsing, and an integration test connects to in-memory SQLite.

- [ ] **3. Helpers.** `newId`, column builders, timestamp handling, `json`, `containsInsensitive`, `upsert`.
  *Done when:* tests for each helper pass on SQLite, and the dialect-specific branches have unit tests on the generated SQL (Kysely `compile()`).

- [ ] **4. Migration runner.** Static migration list, Kysely `Migrator`, `pnpm db:migrate` script with readable output.
  *Done when:* running it twice on an empty SQLite file migrates once, then reports nothing to do.

- [ ] **5. `0001_identity`.** The tables, indexes and foreign keys from SPEC.md, matching the
  column list from task 1. Hand-written Kysely `Database` types in `db/schema.ts`.
  *Done when:* a test migrates a fresh database and checks each table and column exists (through Kysely's introspection).

- [ ] **6. Connection and permission checks.** `checkConnection` with error kinds, `checkPermissions` with the probe table.
  *Done when:* tests cover `ok` and at least one failure kind on SQLite; MySQL and PostgreSQL cases are written and run in 004.

- [ ] **7. Test helper and lint rule.** `createTestDb()` honouring `TEST_DATABASE_URL`, and a Biome rule stopping driver imports outside `db/`.
  *Done when:* the repository tests use it, and a deliberate import of `pg` from a domain fails lint.

## Notes
