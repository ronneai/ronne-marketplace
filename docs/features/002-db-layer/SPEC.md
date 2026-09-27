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
| `newId()` | A ULID string. Used for every primary key, including Better Auth's (through its `generateId` option in 006). |
| `columns.id()`, `columns.timestamp()`, `columns.json()` … | Column builders for migrations, picking the right type per dialect. |
| `toDate()` / timestamp handling | Timestamps are native types (`timestamptz` in PostgreSQL, `datetime(3)` in MySQL) and ISO-8601 UTC text in SQLite. Repositories always return JS `Date`s. |
| `json.encode()` / `json.decode()` | JSON stored as `text`, parsed in repositories. |
| `containsInsensitive(col, term)` | `lower(col) LIKE lower(?)` with `%` and `_` escaped. Same result on all three databases. |
| `upsert(table, values, conflictColumns, updateColumns)` | `ON CONFLICT … DO UPDATE` or `ON DUPLICATE KEY UPDATE`. |

**Migrations** live in `db/migrations/NNNN_name.ts` and are loaded with a static import list (not
by reading the folder at runtime), so they work in the Next.js production build and in Docker.
Migrations only move forward; there are no `down` migrations in production. `pnpm db:migrate` runs
the pending ones and prints what ran.

**`0001_identity`** creates the tables from MVP §10:

- **Better Auth tables** (`user`, `session`, `account`, `verification`) with the columns its Kysely
  adapter expects, plus `role` (default `user`) and `disabled_at` on `user`. Column names are
  snake_case, and 006 maps Better Auth's field names to them. The source of truth for the column
  list is Better Auth's own schema generator for the version in use; the migration is checked against it.
- **`access_tokens`**: id, user_id (FK → `user`, cascade on delete), name, token_hash (unique),
  last_used_at, expires_at, revoked_at, created_at.
- Indexes on every foreign key, and a unique index on `user.email`. The index on `session.token` is unique too.

**Checks for the installer:**
- `checkConnection(url)`: connects and runs `SELECT 1`. Returns `ok`, or an error of a known kind: `unreachable`, `auth_failed`, `database_missing` or `unknown`, plus the driver's message.
- `checkPermissions(db)`: creates, writes to and drops a table called `_ronne_probe`. Returns `ok`, or which step failed.

**Tests** use `createTestDb()`. It reads `TEST_DATABASE_URL` and defaults to an in-memory SQLite
database. It migrates, and cleans up after each test file. On MySQL and PostgreSQL, each test file
gets its own database (or schema), so files can run in parallel.

## Edge cases

- **MySQL index lengths.** Indexed text columns use `varchar(n)` with an explicit length (emails 255, token hashes 64, ULIDs 26).
- **MySQL `utf8mb4`.** The installer (003) checks the database's character set. The migration sets it on each table.
- **Case-insensitive email.** Emails are stored lowercase, so the unique index works on every database whatever its collation.
- **SQLite file locked or read-only.** `checkPermissions` catches it and reports the path.
- **Clock and timezones.** The app always writes UTC. PostgreSQL uses `timestamptz`; MySQL connections set `time_zone = '+00:00'`.

## Acceptance criteria

- [ ] `createDb()` connects to each of the three URL formats; other formats fail with a clear message.
- [ ] `pnpm db:migrate` on an empty database creates the `0001_identity` tables, and running it again does nothing.
- [ ] The migrated columns match what Better Auth's schema generator outputs for the pinned version, apart from our snake_case names and additional fields.
- [ ] Every helper has tests covering each dialect's branch, and they pass on SQLite locally.
- [ ] `containsInsensitive` finds `Code-Review` with `code-r` and treats `%` and `_` in the search term as plain characters.
- [ ] `checkConnection` returns `auth_failed` for a wrong password and `unreachable` for a closed port. `checkPermissions` returns `ok` on a writable database.
- [ ] Nothing outside `db/` imports a database driver or checks the dialect (enforced by a lint rule).

## Open questions

- Whether Better Auth's Kysely adapter reads SQLite ISO text timestamps as `Date` correctly. Task 1 in the plan checks this before the migration is written.
