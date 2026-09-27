# 004 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [x] **1. `db` Vitest project.** Split tests by the `*.db.test.ts` name, and rename 002's and 003's database tests to match.
  *Done when:* `pnpm vitest --project db` runs only database tests, and `pnpm test` still runs everything on SQLite.

- [ ] **2. Local test databases.** `docker/test-databases.compose.yml` and the `pnpm test:db:*` scripts.
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

