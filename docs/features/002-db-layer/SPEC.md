# 002 — Database layer and first migration

> Milestone: M0 · Depends on: 001 · Design: [MVP §9.4](../../MVP/MVP.md#94-database), [§9.5](../../MVP/MVP.md#95-auth), [§10](../../MVP/MVP.md#10-data-model-mvp)

## Goal

One Kysely setup that works the same on SQLite, MySQL/MariaDB and PostgreSQL, plus the first
migration with the tables that the installer (003) and login (006) need. After this, every other
feature adds tables with the same helpers and never thinks about the dialect.

## Scope

**In:**
- Dialect factory: builds a Kysely instance from `DATABASE_URL`.
- The portability helpers from MVP §9.4: ULIDs, timestamps, JSON, case-insensitive search and upserts.
- Migration runner and a `pnpm db:migrate` script.
- Connection and permission checks, for the installer to use.
- Migration `0001_identity`: Better Auth's `user`, `session`, `account` and `verification` tables, and `access_tokens`.
- Test helpers that give each test a fresh, migrated database.

**Out:**
- Better Auth configuration and login → 006. This feature only creates tables that match what Better Auth expects.
- `scopes`, `items` and later tables → the features that use them (010 onward).
- Running tests on MySQL and PostgreSQL in CI → [004](../004-ci-db-matrix/SPEC.md).

## Behaviour

**Where it lives:** `apps/web/src/server/db/` (MVP §9.2). Domains get the Kysely instance only
through their repository implementations. Services never import it.

**`DATABASE_URL` formats:**

| Database | Format | Driver |
|---|---|---|
| SQLite | `file:./data/ronne.db` (relative to the app root) | `better-sqlite3` |
| MySQL / MariaDB | `mysql://user:pass@host:3306/db` | `mysql2` |
| PostgreSQL | `postgres://user:pass@host:5432/db` (or `postgresql://`) | `pg` |

Anything else fails at startup with a message listing the three formats.

**SQLite settings** on every connection: `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`.
The folder for the file is created if missing.

**Helpers in `db/`** (the only place allowed to check the dialect):

| Helper | Does |
|---|---|
| `newId()` | A ULID string. Used for every primary key, including Better Auth's (through its `advanced.database.generateId` option, configured in 003). |
| `columns.id()`, `columns.timestamp()`, `columns.json()` … | Column builders for migrations, picking the right type per dialect. |
| `toDate()` / timestamp handling | Timestamps are native types (`timestamptz` in PostgreSQL, `datetime(3)` in MySQL) and ISO-8601 UTC text in SQLite. Repositories always return JS `Date`s. This is also how Better Auth stores and reads them (checked in task 1). In MySQL, never `timestamp(3)`: Better Auth's own generator uses it, but that type stops at 2038-01-19. |
| `json.encode()` / `json.decode()` | JSON stored as `text`, parsed in repositories. |
| `containsInsensitive(col, term)` | `lower(col) LIKE lower(?)` with `%` and `_` escaped. Same result on all three databases. |
| `upsert(table, values, conflictColumns, updateColumns)` | `ON CONFLICT … DO UPDATE` or `ON DUPLICATE KEY UPDATE`. |

**Migrations** live in `db/migrations/NNNN_name.ts` and are loaded with a static import list (not
by reading the folder at runtime), so they work in the Next.js production build and in Docker.
Migrations only move forward; there are no `down` migrations in production. `pnpm db:migrate` runs
the pending ones and prints what ran.

**`0001_identity`** creates the tables from MVP §10:

- **Better Auth tables** (`user`, `session`, `account`, `verification`) with the columns its Kysely
  adapter expects, plus `role` and `disabled_at` on `user`. Column names are snake_case, and 003
  maps Better Auth's field names to them. Checked against Better Auth 1.7.5 in task 1:

  | Table | Columns |
  |---|---|
  | `user` | id, name, email (unique), email_verified, image, created_at, updated_at, **role** (`varchar(16)`, not null, default `'user'`), **disabled_at** |
  | `session` | id, expires_at, token (unique), created_at, updated_at, ip_address, user_agent, user_id (FK → `user`, cascade) |
  | `account` | id, account_id, provider_id, user_id (FK → `user`, cascade), access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at |
  | `verification` | id, identifier, value, expires_at, created_at, updated_at |

  Indexes: `session.user_id`, `account.user_id`, `verification.identifier`.
  **Types:** IDs are `varchar(26)`, and timestamps follow the helper above. Indexed strings are
  `varchar(255)` (email, token, identifier), everything else `text`. `email_verified` is a boolean:
  `boolean` in PostgreSQL and MySQL, `integer` 0/1 in SQLite. It's the one exception to the "no
  booleans" rule in MVP §9.4, because Better Auth requires it.
  **The check:** after `0001_identity`, Better Auth's `getMigrations(options)` must report nothing to
  create and nothing to add, on each database. Better Auth also runs this check when it starts and
  logs "Database schema mismatch" if our tables drift from what it expects.
- **`access_tokens`**: id, user_id (FK → `user`, cascade on delete), name, token_hash (unique),
  last_used_at, expires_at, revoked_at, created_at.
- Indexes on every foreign key, and a unique index on `user.email`. The index on `session.token` is unique too.

**Checks for the installer:**
- `checkConnection(url)`: connects, asks for the server version, and disconnects. It never throws. It returns `ok` with the dialect and `serverVersion`, so 003 can warn about unsupported versions. Otherwise it returns a kind, `invalid_url`, `unreachable`, `auth_failed`, `database_missing` or `unknown`, plus the driver's message. The kinds are mapped from driver error codes, which are the same on PostgreSQL 15 and 18, MySQL 8.4 and MariaDB 10.11. The connect timeout is 5 seconds. `createDb` also sets one (10 seconds by default), because `pg` has none.
- `checkPermissions(db)`: creates, writes to, reads and drops a table called `_ronne_probe`. Returns `ok`, or which step failed (`create`, `write`, `read` or `drop`). It leaves nothing behind, even after a failure.

**Tests** use `createTestDb()`. It reads `TEST_DATABASE_URL` and defaults to an in-memory SQLite
database (a `file:` URL gives a new file in a temp folder). It migrates unless `{ migrate: false }`,
and `cleanup()` removes everything. On MySQL and PostgreSQL, each call creates its own database,
`ronne_test_<id>`, with the URL's credentials (which need `CREATE DATABASE`), and drops it on
cleanup, so test files can run in parallel against one server.

## Edge cases

- **MySQL ignores inline foreign keys.** MySQL 8.4 (like every MySQL before 9.0) parses a column's inline `REFERENCES … ON DELETE CASCADE` and creates nothing. MariaDB honours it. Foreign keys are therefore table-level constraints (`addForeignKeyConstraint`). `migrations.guard.test.ts` fails on inline `.references(` in any migration, and `0001_identity.db.test.ts` checks the real foreign keys on each database.
- **MySQL index lengths.** Indexed text columns use `varchar(n)` with an explicit length (emails 255, token hashes 64, ULIDs 26).
- **MySQL `utf8mb4`.** The installer (003) checks the database's character set. The migration sets it on each table.
- **Case-insensitive email.** Emails are stored lowercase, so the unique index works on every database whatever its collation.
- **SQLite file locked or read-only.** `checkPermissions` fails at `create` with SQLite's "readonly database" message.
- **PostgreSQL 15 and later** no longer let ordinary users create tables in the `public` schema by default. A dedicated user without `GRANT CREATE ON SCHEMA public` connects fine but fails `checkPermissions` at `create` ("permission denied for schema public"). 003 should show the fix: grant it, or make the user the database owner.
- **A MySQL user without CREATE or DROP** fails at `create`. The message names `DROP`, because that step first removes any probe table left by an earlier failed run.
- **Clock and timezones.** The app always writes UTC. PostgreSQL uses `timestamptz`; MySQL connections set `time_zone = '+00:00'`, and the `mysql2` pool uses `timezone: "Z"`.
- **`mysql2` `FOUND_ROWS`.** Better Auth relies on the `FOUND_ROWS` client flag, which `mysql2` turns on by default. It makes an `UPDATE` report rows *matched*, not rows *changed*. Never disable it in the pool config, or Better Auth's updates return nothing when the new value equals the old one.
- **`better-sqlite3` builds from source** when no prebuilt binary matches the Node.js version and platform (it did on Node 24.0.0 on macOS). CI and the Docker image (005) must either get a prebuilt binary or have a C++ toolchain.

## Acceptance criteria

- [x] `createDb()` connects to each of the three URL formats; other formats fail with a clear message.
- [x] `pnpm db:migrate` on an empty database creates the `0001_identity` tables, and running it again does nothing.
- [x] After `0001_identity`, Better Auth's `getMigrations(options)` reports nothing to create or add on SQLite (here) and on MySQL and PostgreSQL (in 004).
- [x] Every helper has tests covering each dialect's branch, and they pass on SQLite locally.
- [x] `containsInsensitive` finds `Code-Review` with `code-r` and treats `%` and `_` in the search term as plain characters.
- [x] `checkConnection` returns `auth_failed` for a wrong password and `unreachable` for a closed port. `checkPermissions` returns `ok` on a writable database.
- [x] Nothing outside `db/` imports a database driver or checks the dialect (enforced by a lint rule).

## Open questions

- None. Task 1 answered the question about SQLite timestamps: Better Auth stores ISO-8601 text and returns `Date`s.
