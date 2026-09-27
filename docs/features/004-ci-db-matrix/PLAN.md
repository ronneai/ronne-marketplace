# 004 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [x] **1. `db` Vitest project.** Split tests by the `*.db.test.ts` name, and rename 002's and 003's database tests to match.
  *Done when:* `pnpm vitest --project db` runs only database tests, and `pnpm test` still runs everything on SQLite.

- [x] **2. Local test databases.** `docker/test-databases.compose.yml` and the `pnpm test:db:*` scripts.
  *Done when:* all three scripts pass locally, and the result is recorded in Notes.

- [x] **3. CI matrix.** The `db` job with service containers, health checks and `TEST_DATABASE_URL` per entry.
  *Done when:* a pull request shows four green `db` entries.

- [x] **4. Setup smoke test.** A script or test that runs `pnpm run setup --yes` against a fresh database and checks the result. Added to each matrix entry.
  *Done when:* it passes in all four entries.

- [x] **5. Prove it catches breakage.** On a throwaway branch, replace one `containsInsensitive` call with a raw `LIKE`.
  *Done when:* the PostgreSQL entry fails. Record it in Notes, then drop the branch.

- [x] **6. Weekly latest-version run.** A `schedule` and `workflow_dispatch` trigger that swap in the latest images, without being required for merging.
  *Done when:* a manual run completes.

- [x] **7. Docs.** Add the supported versions to MVP §5 and the README.
  *Done when:* both list them.

## Notes
- **Task 1 (2026-09-27): Vitest projects.** `apps/web/vitest.config.ts` defines `unit` (9 files, 103 tests) and `db` (the 12 `*.db.test.ts` files, 58 tests). `vitest run` runs both (161, the same as before). `pnpm test:db` (root or `apps/web`) runs `vitest run --project db`.
  - Every database test already used the `*.db.test.ts` name, since 002 introduced it, so nothing was renamed. A grep confirmed no other test imports a driver, `createDb` or `createTestDb`.
  - **Gotcha:** with `extends: true`, Vitest concatenates the root `include` with each project's, so the root settings must not have one. Otherwise the `db` project also picks up the unit files and the combined run counts them twice.
- **Task 2 (2026-09-27): local test databases.**
  - `docker/test-databases.compose.yml` runs PostgreSQL 15, MySQL 8.4 and MariaDB 10.11 (the minimum versions, as in CI) on 127.0.0.1 only (ports 54315, 53384 and 53311), with health checks. MySQL's check pings over TCP, so it doesn't pass while the temporary init server is still running.
  - Root scripts: `pnpm test:db:up` (`up -d --wait`, about 9 seconds with cached images), `pnpm test:db:down` (removes the data too), and `pnpm test:db:postgres`, `:mysql` and `:mariadb`. They run `apps/web/scripts/test-db.mjs`, plain Node that sets `TEST_DATABASE_URL`, so they work on Windows without `cross-env`.
  - All three passed with 58/58 (no skips, because the server-only tests run).
- **Task 3 (2026-09-27): CI matrix, written but not yet ticked.** Waiting on the first GitHub run, when the owner asks for the pull request. The owner asked for no pushes without a request.
  - `.github/workflows/database.yml`, job `test`, named `Database tests (<database>)`, runs on push to `main` and on pull requests.
  - One service container per entry: `postgres:15`, `mysql:8.4` and `mariadb:10.11`, each with its health command. It runs `pnpm test:db` with `TEST_DATABASE_URL`.
  - The actions are pinned to the same SHAs as `ci.yml`, with `permissions: contents: read` and `persist-credentials: false`.
  - The YAML parses, and the images and health commands are the ones proven locally with `docker/test-databases.compose.yml`.
  - **After merging,** add the three `Database tests (…)` checks to the required checks on `main`.
- **Task 4 (2026-09-27): setup smoke test, already built in 003.**
  - `scripts/setup.db.test.ts` ("pnpm run setup --yes against a server") runs the real script against an empty database from `createTestDb({ migrate: false })`, and checks that root exists. `run-setup.db.test.ts` also runs the flow with a wrong password first.
  - Both are `*.db.test.ts`, so they're in the `db` project that `database.yml` runs per server. Checked by name with the verbose reporter: they run, rather than skip, and pass on PostgreSQL 15, MySQL 8.4 and MariaDB 10.11.
  - Fixed `test-db.mjs` to drop the literal `--` that `pnpm test:db:<db> -- <file>` passes along, so a file filter now reaches Vitest.
- **Task 5 (2026-09-27): breakage proof, done locally but not yet ticked.** The GitHub version (a throwaway branch where the PostgreSQL job goes red) needs a push, which waits for the owner.
  - **Local proof,** with the same `db` project and the same images as `database.yml`: `containsInsensitive` was temporarily changed to a raw `column LIKE pattern` (no `lower()`). Results:
    - SQLite: passes (51 passed, 7 skipped);
    - MySQL 8.4: passes (58/58);
    - MariaDB 10.11: passes (58/58);
    - **PostgreSQL 15 fails** "containsInsensitive on a real database › ignores case" (57/58).

    SQLite's `LIKE` and MySQL/MariaDB's default collations ignore case; PostgreSQL's `LIKE` doesn't. So only the PostgreSQL entry catches it. The change was reverted and never committed.
- **Task 6 (2026-09-27): weekly latest-version run, written but not yet ticked.** Waiting on a manual `workflow_dispatch` run, which needs the workflow on GitHub.
  - `database.yml` gains `schedule` (Mondays 04:37 UTC) and `workflow_dispatch`. On those events each entry uses its `latest` image: `postgres:latest`, `mysql:lts` or `mariadb:lts`. Job names get ", latest". Pull request and push runs keep the minimum versions and their exact names, so the required checks are unaffected, and a scheduled failure never blocks a pull request.
  - **Checked locally:** all three latest images pass the `db` project (58/58 each). On 2026-09-27 they were **PostgreSQL 18.6, MySQL 9.7.2 and MariaDB 12.3.3**. MySQL's current LTS is 9.7, so the spec's "latest 8.x or 9.x LTS" means 9.7 for now.
- **Task 7 (2026-09-27): docs.**
  - MVP §5 lists the supported databases and how they're tested. The README already had them (from 003), and gained the `test:db` commands.
  - CLAUDE.md gained the `test:db` commands, the database workflow in its CI summary, and a rule: run database code against the servers before committing.
- **Task 3 confirmed on GitHub (PR #10):** `Database tests (postgres|mysql|mariadb)` each ran 58/58 against their service containers, with nothing skipped, so the server-only tests ran. PR #11 later showed one MySQL test timing out at 5 seconds on CI; the `db` project now allows 30 seconds (005).
- **Still open:** task 6's manual `workflow_dispatch` run (none on GitHub as of 2026-09-27), and task 5's optional GitHub proof (proved locally).
- **Task 6 confirmed on GitHub (2026-09-27):** the owner started the Database workflow by hand on `main` (run 36330888030). The jobs `Database tests (postgres|mysql|mariadb, latest)` used `postgres:latest`, `mysql:lts` and `mariadb:lts`, and passed 66/66 each.
- **Task 5 is closed on the local proof:** with search broken, only PostgreSQL failed, using the same `db` project and minimum images as CI. The GitHub version (a throwaway branch going red) was offered as optional and not requested.

