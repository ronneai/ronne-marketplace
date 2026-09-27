# 004 — CI against SQLite, MySQL and PostgreSQL

> Milestone: M0 · Depends on: 002, 003 · Design: [MVP §9.4](../../MVP/MVP.md#94-database), [§13 M0](../../MVP/MVP.md#13-mvp-scope--milestones)

## Goal

Prove on every change that the database code and the installer work on every database we support,
not only on SQLite, where development happens. A query that breaks on one database fails the pull
request instead of reaching a user.

## Scope

**In:**
- A CI job that runs the database tests once per database, with MySQL, MariaDB and PostgreSQL as service containers.
- A smoke test that runs `pnpm run setup` non-interactively against each database.
- The supported database versions, written down.
- A way to run the same tests locally against Docker databases.

**Out:**
- Running the whole test suite per database. Only tests that touch the database run in the matrix; the rest run once, in 001's job.

## Behaviour

**Supported versions.** Each version is tested in CI, and each was still maintained upstream in September 2026.

| Database | Minimum (tested on PRs) | Latest (tested weekly) |
|---|---|---|
| SQLite | the version bundled with `better-sqlite3` | — |
| MySQL | 8.4 LTS | latest 8.x or 9.x LTS |
| MariaDB | 10.11 LTS | latest LTS |
| PostgreSQL | 15 | latest |

These versions go into MVP §5 and the README as the supported list.

**Which tests run in the matrix.** Tests that need a database are named `*.db.test.ts` (repository
tests, `db/` helper tests and migration tests). A Vitest project called `db` runs only those, and
reads `TEST_DATABASE_URL`.

**CI job `db`** (in the same workflow as 001):
- Matrix entries: `sqlite`, `mysql`, `mariadb` and `postgres` at the minimum versions. A weekly
  scheduled run and a manual trigger use the latest versions instead.
- Each entry starts its service container with a health check, sets `TEST_DATABASE_URL`, runs the
  `db` test project, and then runs the setup smoke test.
- **Setup smoke test:** runs `pnpm run setup --yes` against a fresh database with env vars, then
  checks that the migrations ran and that a root user exists with an argon2id hash.
- Failures show which database failed in the job name.

**Local runs.** `docker/test-databases.compose.yml` starts the three servers on known ports.
`pnpm test:db:mysql`, `pnpm test:db:mariadb` and `pnpm test:db:postgres` run the `db` project against each one.

## Edge cases

- **Slow container start.** Tests wait on the service health check, not a fixed sleep.
- **Parallel test files.** Each test file creates its own database or schema (002's `createTestDb`), so they don't share state.
- **MySQL vs MariaDB differences** (JSON is an alias for `longtext` in MariaDB, and some defaults differ). That's why both are in the matrix.

## Acceptance criteria

- [ ] A pull request runs the `db` job for all four databases, and each must pass before merging.
- [ ] A query that works on SQLite but not PostgreSQL (for example `LIKE` case sensitivity without the helper) makes the PostgreSQL entry fail.
- [ ] The setup smoke test passes on all four.
- [ ] The weekly run uses the latest versions and reports failures without blocking pull requests.
- [ ] `pnpm test:db:postgres` (and the other two) work locally with the compose file.
- [ ] The supported versions are listed in MVP §5 and the README.

## Open questions

- None.
