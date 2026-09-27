# 004 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [x] **1. `db` Vitest project.** Split tests by the `*.db.test.ts` name, and rename 002's and 003's database tests to match.
  *Done when:* `pnpm vitest --project db` runs only database tests, and `pnpm test` still runs everything on SQLite.

- [x] **2. Local test databases.** `docker/test-databases.compose.yml` and the `pnpm test:db:*` scripts.
  *Done when:* all three scripts pass locally, and the result is recorded in Notes.

- [ ] **3. CI matrix.** The `db` job with service containers, health checks and `TEST_DATABASE_URL` per entry.
  *Done when:* a pull request shows four green `db` entries.

- [ ] **4. Setup smoke test.** A script or test that runs `pnpm run setup --yes` against a fresh database and checks the result. Added to each matrix entry.
  *Done when:* it passes in all four entries.

- [ ] **5. Prove it catches breakage.** On a throwaway branch, replace one `containsInsensitive` call with a raw `LIKE`.
  *Done when:* the PostgreSQL entry fails. Record it in Notes, then drop the branch.

- [ ] **6. Weekly latest-version run.** A `schedule` and `workflow_dispatch` trigger that swap in the latest images, without being required for merging.
  *Done when:* a manual run completes.

- [ ] **7. Docs.** Add the supported versions to MVP §5 and the README.
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

