# 002 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [x] **1. Spike: Better Auth schema and timestamps.** In a scratch branch, run Better Auth's schema
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

- **Task 1 spike (2026-09-27): Better Auth 1.7.5 with Kysely 0.29.6, on SQLite, PostgreSQL 18 and MySQL 8.4.**
  The spike lived outside the repo and was thrown away.
  - **Configuration that worked on all three:**
    - `database: { db: <Kysely>, type }`;
    - `advanced.database.generateId: () => ulid()`;
    - argon2id via `emailAndPassword.password.hash`/`verify` (`@node-rs/argon2`), stored in `account.password`;
    - snake_case through each model's `fields` map (there's no global casing option);
    - `role` and `disabledAt` as `user.additionalFields` with `fieldName`.

    Sign-up and sign-in work, and a wrong password is rejected.
  - **Timestamps:**
    - SQLite stores ISO-8601 UTC text, and Better Auth returns `Date`s;
    - PostgreSQL uses `timestamptz`;
    - MySQL uses `timestamp(3)` in Better Auth's generator, but that type ends in 2038.

    Our own `datetime(3)` tables were accepted by Better Auth (`getMigrations` wanted nothing), and a session expiring in 2045 was stored correctly.
  - **IDs:** Better Auth's generator uses `text` (SQLite, PostgreSQL) and `varchar(36)` (MySQL). Our `varchar(26)` ULIDs were accepted.
  - **Booleans:** `email_verified` is `boolean` in PostgreSQL and MySQL, and `integer` in SQLite. Kept as an exception to MVP §9.4.
  - **Schema check at startup:** Better Auth compares the database with what it expects when it starts, and logs "Database schema mismatch" if they differ. We reuse this through `getMigrations(options)` as the test that `0001_identity` matches.
  - **Telemetry** (`@better-auth/telemetry`) is off unless `telemetry.enabled` or `BETTER_AUTH_TELEMETRY` is set. 003 sets `telemetry: { enabled: false }` explicitly anyway.
  - **Better Auth's own migration CLI** (`npx auth migrate`) isn't used: our migration set owns the schema.
  - **Dependencies for this feature** (all MIT, and all passed the 3-day release age): `kysely` 0.29.6, `better-sqlite3` 13.0.3 (added to `allowBuilds`), `pg` 8.23.0, `mysql2` 3.24.4 and `ulid` 3.0.2. `better-auth` and `@node-rs/argon2` arrive with 003.

