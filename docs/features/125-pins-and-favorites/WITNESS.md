# 125 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).


## Task 1 — Tables and repositories

Witnessed: 2026-10-21 17:10 local, by a fresh agent (blind). Commit: f032abcf plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `item_favorites` has a primary key on user and item, and cascades on user and item delete | no | confirmed | `0033_pins_and_favorites.ts` has `item_favorites_pk` and two cascade keys; the migration test passes on SQLite, PostgreSQL and MySQL. |
| 2 | `item_pins` has a unique key on shelf and item that holds for the instance shelf, cascades on item and workspace, and sets `created_by` null | no | confirmed | The migration tests "one per shelf and item" and "keeps the pin when its creator's row is deleted" pass on all three. |
| 3 | The migration is registered and the schema types match | no | confirmed | `migrations/index.ts` lists `0033_pins_and_favorites`; `pnpm --filter @ronneai/web typecheck` → clean. |
| 4 | The migration is safe to run again | no | confirmed | "is safe to run again" passes on all three. |
| 5 | The repositories sit behind interfaces | no | confirmed | `favorite-repository.ts` and `pin-repository.ts` are interfaces; the Kysely files return them. |
| 6 | The models have the limits and the position | no | confirmed | `models/shelf.ts`: `MAX_FAVORITES = 200`, `MAX_PINS = 12`, `Pin.position`. |
| 7 | Both repositories' `*.db.test.ts` pass on SQLite | no | confirmed | `vitest run --project db src/server/domains/shelves src/server/db/migrations/0033` → 3 files, 16 tests passed. |
| 8 | The same pass on PostgreSQL and MySQL | no | confirmed | `pnpm test:db:postgres` and `:mysql` on the same paths → 16 passed each (MariaDB too). |
| 9 | The migration guard test passes | no | confirmed | `migrations.guard.test.ts` → passed. |
| 10 | Lint is clean | no | confirmed | `biome check apps/web` → no errors. |
| 11 | Pin renumbering is tested | no | confirmed | Removing `renumber` from `remove` made "closes the gap" fail. |
| 12 | The shelf lock holds the pin limit | no | confirmed | Removing `lockShelf` from `add` made the concurrency test fail on PostgreSQL. |
| 13 | The favorite lock holds the favorite limit | no | partly | Read and passed, but no mutation was run in this pass (the adversarial pass did). |

**Overall:** not met: row 13.

### Re-check (row 13)

Witnessed: 2026-10-21 17:25 local, by a fresh agent (blind re-check). Commit: f032abcf plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | The favorite repository's user-row lock holds the 200 limit under concurrency, and a test notices it missing | no | confirmed | Replacing the `forUpdate` on the user row with a plain select made "two favorites at once cannot pass the limit" fail 3 of 3 on PostgreSQL. |
| 14 | The shelves tests and the 0033 test pass on SQLite, PostgreSQL and MySQL | no | confirmed | SQLite → 113 tests passed in the migrations and shelves folders; `pnpm test:db:postgres` and `:mysql` on the shelves and 0033 files → 21 passed each. |
| 15 | The migration guard test passes | no | confirmed | `migrations.guard.test.ts` → 34 passed. |
| 16 | Lint and typecheck are clean | no | confirmed | `biome check` → no fixes; `pnpm --filter @ronneai/web typecheck` → no errors. |

**Overall:** met.

### Adversarial pass

Witnessed: 2026-10-21 17:15 local, by a fresh agent (adversarial). Commit: f032abcf plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tables, keys and cascades, with the migration registered | no | confirmed | Probe: deleting a workspace leaves 0 pins and deleting an item leaves 0 favorites, on SQLite, PostgreSQL, MySQL and MariaDB. |
| 2 | The migration runs again safely; the guard test passes | no | confirmed | "is safe to run again" and `migrations.guard` pass. |
| 3 | Models, interfaces and Kysely implementations | no | confirmed | `models/shelf.ts`, the two interfaces and their implementations read and typechecked. |
| 4 | Both repositories' tests pass on all four databases | no | confirmed | `test-db.mjs` on sqlite, postgres 15, mysql 8.4, mariadb 10.11 → 16 passed each. |
| 5 | Favorites `add` holds the 200 limit under concurrency, and the test notices the lock gone | no | confirmed | Removing the `forUpdate` on the user row made the concurrency test fail 3 of 3 on PostgreSQL (4 added instead of 2). |
| 6 | Pins `add` holds the limit and no duplicates under concurrency, and the test notices the lock gone | no | confirmed | Removing `lockShelf` → PostgreSQL got 4 added instead of 3; MySQL threw a duplicate-key error. |
| 7 | Mixed adds, removes and moves keep positions dense and within the limit | no | confirmed | A probe of 15 rounds × 8 concurrent operations: positions always 1..n on all four databases. |
| 8 | Edge inputs: limit 0, a missing item, an unknown item, `instance` against a workspace id | no | confirmed | Limit 0 → "full"; remove of a missing item → false; an unknown item is the foreign key's error. |
| 9 | Positions stay dense when a pin leaves by cascade | no | partly | By reading: a cascade left positions 1 and 3, and the next add wrote 3 again. |
| 10 | Ids in another case behave like canonical ones on MySQL and MariaDB | no | partly | On MySQL and MariaDB `shelvesOf` and `count` matched a lower-case id, but the JS comparison did not. |
| 11 | The tests assert tightly enough | no | partly | No concurrent move or remove test; the cascade test didn't check positions. |

**Overall:** not met: rows 9, 10 and 11.

### Adversarial re-check (rows 9, 10, 11)

Witnessed: 2026-10-21 17:20 local, by a fresh agent (adversarial re-check). Commit: f032abcf plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9 | Pin positions stay dense and unique after a cascade, and after concurrent add, remove and move | no | confirmed | `add` renumbers before inserting; two new tests pass on all four databases. Removing the renumber made the cascade test fail on PostgreSQL, MySQL and SQLite. |
| 10 | Ids in another case behave like canonical ones in both repositories | no | confirmed | Every id goes through `canonicalId`; "takes ids in any case" passes on all four; with `canonicalId` as the identity both case tests fail. |
| 11 | Shelves and 0033 tests pass on all four databases, with lint and typecheck clean | no | confirmed | 21 tests passed on each of sqlite, postgres, mysql and mariadb; `biome check` and `typecheck` clean. |
| 12 | The shelf lock is still noticed when removed | no | confirmed | With `lockShelf` removed from add, remove and move, the pin tests failed in 9 of 9 runs (one failed only one of the two tests). |

**Overall:** met.
