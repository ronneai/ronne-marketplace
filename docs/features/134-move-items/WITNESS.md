# 134 — Witness record

Passes by the `state-witness` agent, one block per task ([how it works](../../knowledge/state-witness.md)).

## Task 1 — Migration

Witnessed: 2026-10-27 22:55 EDT, by a fresh agent (blind). Commit: 4af8ed6f (plus the uncommitted `index.ts` and `schema.ts`, and the untracked `0037_item_moves.ts` and `0037_item_moves.db.test.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `item_moves` has the spec's columns (id, item_id, from_scope_id, to_scope_id, requested_by, message, status, decided_by, reason, created_at, decided_at) | no | confirmed | `0037_item_moves.ts` `createItemMoves`: all 11 columns; `status` is `string(16)` not null; the column types match `0024_scope_moves.ts:43-82` |
| 2 | `item_moves` cascades with the item and with the target scope; the rest follows `scope_moves` (asker cascades, answerer and source scope set null) | no | confirmed | The foreign keys are items CASCADE, to_scope CASCADE, from_scope SET NULL, requested_by CASCADE, decided_by SET NULL, the same as `0024` lines 46-78. The test checks exactly these 5 keys and that deleting the item, or the target scope, removes the row |
| 3 | `item_name_history` has the spec's columns, with reason and source id | no | confirmed | `createNameHistory`: id, item_id, old_name and new_name (`exactString(195)`), reason, requested_by, decided_by, source_id (no foreign key, since it can point at either table), created_at; the `(item_id, created_at)` index. The test keeps a 195-character name byte for byte |
| 4 | `item_name_history` cascades with the item; requested_by and decided_by are nullable and set null when the user is deleted | no | confirmed | 3 foreign keys (items CASCADE, user SET NULL twice). Mutation: requested_by → `cascade` makes "goes with its item, and keeps the entry when the people are gone" fail (1 failed, 12 passed) |
| 5 | Backfill: one entry per alias, reason mapped, date kept, new name = the next alias in date order or the current name (with the workspace outside global) | no | confirmed | The `HISTORY_REASON` map turns `migration` / `rename` / `move` into `migration` / `rename_workspace` / `move_scope`; `created_at` is copied. Mutation: new_name → always the current name makes "chains each alias…" fail. "names the current workspace outside global" passes |
| 6 | A 115 move takes who asked and who approved from the `scope_moves` row with the same scope and timestamp; otherwise nobody | no | partly | The code is right (`m.scope_id === item.scope_id && time(m.decided_at) === time(alias.created_at)`), and 115 writes the alias and the decision with one `at` (`scope-moves.ts:453`, `kysely-scope-moves.ts:417`). But removing the scope condition still gave 13 passed: this scope's move is inserted before the other scope's same-instant move, so `find` returns the right row anyway. With the inserts swapped, the real code passes and the mutation fails |
| 7 | Moving a scope and moving it back is covered | no | confirmed | "keeps only what the aliases still say after a scope moved back" passes; it matches 115's `setAliases` dropping the alias that became the name again (`kysely-workspace-repository.ts:438-455`) |
| 8 | Kysely types in `db/schema.ts`, and the migration registered | no | confirmed | `ItemMoveTable` and `ItemNameHistoryTable` in `Database`, nullability matching the columns; `0037_item_moves` in `migrations/index.ts`; `pnpm --filter @ronneai/web typecheck` → clean |
| 9 | The migration's db test passes on the four databases | no | confirmed | `vitest run --project db …/0037_item_moves.db.test.ts` → 13 passed on SQLite; `pnpm test:db:postgres`, `:mysql`, `:mariadb -- <file>` → 13 passed each. Mutation: removing the history rerun guard makes "adds nothing twice" fail |
| 10 | The guard test passes | no | confirmed | `vitest run src/server/db/migrations/migrations.guard.test.ts` → 38 passed |

**Overall:** not met: the schema, keys, types and backfill hold on all four databases, but the test for matching a scope move by scope (row 6) still passes with the scope condition removed.

### Adversarial pass

Witnessed: 2026-10-27 22:58 EDT, by a fresh agent (adversarial). Commit: 4af8ed6f + working tree (index.ts, schema.ts modified; 0037_item_moves.ts and its db test untracked). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The 0037 db test passes on SQLite | no | confirmed | `pnpm --filter @ronneai/web exec vitest run --project db src/server/db/migrations/0037_item_moves.db.test.ts` → 13 passed |
| 2 | The same test passes on PostgreSQL, MySQL and MariaDB | no | confirmed | `pnpm test:db:postgres -- …/0037_item_moves.db.test.ts` → 13 passed; `:mysql` → 13 passed; `:mariadb` → 13 passed |
| 3 | The guard test passes | no | confirmed | `vitest run src/server/db/migrations/migrations.guard.test.ts` → 38 passed; 0037 uses only `addForeignKeyConstraint` |
| 4 | `item_moves` has the spec's columns and cascades with the item and with the target scope | no | confirmed | `0037_item_moves.ts:44-82` has every Data column. Mutation M8 (target scope set to `set null`) → 2 tests fail. Deleting the item, then the target scope → rows gone, on all 4 databases |
| 5 | `requested_by` and `decided_by` are set null when a user is deleted (PLAN wording, which names both tables) | no | partly | `item_name_history`: both set null; mutation M2 (cascade) → 1 test fails. `item_moves`: `requested_by` is NOT NULL and cascades (`:68-71`), asserted by the test; the SPEC's Data bullet for `item_moves` says nothing about it, PLAN's parenthesis says set null |
| 6 | `item_name_history` has the spec's columns; reasons `move_item`/`move_scope`/`rename_workspace`/`migration`; `source_id` nullable | no | confirmed | `0037_item_moves.ts:96-126` and `schema.ts` `ItemNameHistoryTable`. Longest name (195) kept byte for byte on all 4 databases. Mutation M9 (`rename` mapped to `migration`) → 1 test fails |
| 7 | Backfill: one entry per alias, its date kept, its new name the next alias's name in date order or the current name | no | confirmed | Mutations M3 (always current name), M6 (descending sort) and M10 (date not kept) → 1 test fails each. Real-flow probe (115 move acme→global, move back, 113 rename acme→beta, move to global with scope rename): unbroken chain `@infra/deploy→@acme/infra/deploy→@beta/infra/deploy→@infra2/deploy` on all 4 databases |
| 8 | Full current name: `@scope/name` in global, `@ws/scope/name` elsewhere | no | confirmed | `0037_item_moves.ts:204-207`, same as core `formatItemName` (`packages/core/src/names.ts:142`). Mutation M5 (always add the workspace) → 1 test fails |
| 9 | A 115 move is matched to its `scope_moves` row by the same scope and timestamp; otherwise nobody | no | partly | The code is right (`:213-217`); the real-flow probe found `source_id`, `requested_by` and `decided_by` on all 4 databases, and 113 renames get nobody. Mutation M7 (no timestamp check) → caught. Mutation M1 (no scope check) → 13 passed: the other scope's same-instant move is inserted after the right one |
| 10 | The scope moved and moved back gives only what the aliases still say | no | confirmed | Test passes on 4 databases; the real flow confirms 115 drops the alias on a move back |
| 11 | Rerun safety: a rerun adds nothing twice, and the DDL reruns on MySQL | no | confirmed | `up()` again on a migrated database passes on MySQL and MariaDB. Mutation M4 (no rerun guard) → 1 test fails |
| 12 | A rerun after a backfill that failed partway completes it (MySQL commits each batch) | no | not met | Probe `probe-rerun.db.test.ts`, a planted throw before batch 2, 601 aliases, one item's two entries split across the 500 boundary: on MySQL "after failed run 500, after rerun 600", expected 601. The rerun skips any item that already has an entry |
| 13 | Kysely types in `db/schema.ts`; migration registered in `index.ts` | no | confirmed | `pnpm --filter @ronneai/web typecheck` → clean; `biome check` → no issues; `index.ts` registers `"0037_item_moves": itemMoves` |

**Overall:** not met: row 9's scope check is untested, row 12 can lose an entry if a MySQL backfill fails partway and is rerun, and row 5's PLAN wording disagrees with the key on `item_moves.requested_by`.

### Re-check (rows 2, 4, 6, 9, 10, and the new batching)

Witnessed: 2026-10-27 23:01 EDT, by a fresh agent (blind). Commit: 4af8ed6f (plus the uncommitted `index.ts`, `schema.ts` and `PLAN.md`, and the untracked `0037_item_moves.ts`, `0037_item_moves.db.test.ts` and `WITNESS.md`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | A 115 move takes who asked and who approved from the `scope_moves` row with the same scope and timestamp; otherwise nobody | no | confirmed | The test has an item in each scope, both scopes moved at the same instant, each item expected to find its own scope's move (`source_id` = `moveId` / `devopsMoveId`). Removing `m.scope_id === item.scope_id &&` → 1 failed, 13 passed; the same with the two `scopeMove` inserts swapped → 1 failed; the real code with them swapped → 14 passed |
| 11 | The backfill writes in batches of about 500 and never splits one item's entries; an item with more than 500 gets a batch of its own | no | confirmed | Entries are grouped per item, and `historyBatches` starts a new batch only between items. The unit test checks `[a1,b1,b2,b3]`, `[c1,c2]`, then `[d1..d5]` (over the size of 4) as one batch, empty groups skipped. Mutation: the split condition changed to `batch.length >= size` → that test fails |
| 2 | `item_moves` follows `scope_moves` (goes with its item, target scope and asker; source scope and answerer set null), as PLAN.md's parenthesis now says | no | confirmed | PLAN.md's diff says exactly that; the keys are unchanged and match it; the key test passes |
| 4 | `item_name_history` goes with its item, and both people are set null | no | confirmed | PLAN.md's wording matches; the keys and their test are unchanged and pass |
| 9 | The migration's db test passes on the four databases | no | confirmed | `vitest run --project db …/0037_item_moves.db.test.ts` → 14 passed on SQLite; `pnpm test:db:postgres`, `:mysql`, `:mariadb -- …` → 14 passed each |
| 10 | The guard test passes, and the type-check is clean | no | confirmed | `vitest run …/migrations.guard.test.ts` → 38 passed; `pnpm --filter @ronneai/web typecheck` → clean |

**Overall:** met: the scope-match test now fails without the scope condition in either insert order, and the per-item batching is covered and passes on all four databases.

### Adversarial re-check after the batching, test and PLAN fixes

Witnessed: 2026-10-27 23:01 EDT, by a fresh agent (adversarial). Commit: 4af8ed6f + working tree (0037_item_moves.ts and its db test untracked; index.ts, schema.ts and PLAN.md modified). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The 0037 db test passes on SQLite | no | confirmed | `pnpm --filter @ronneai/web exec vitest run --project db src/server/db/migrations/0037_item_moves.db.test.ts` → 14 passed |
| 2 | The same test passes on PostgreSQL, MySQL and MariaDB | no | confirmed | `pnpm test:db:postgres -- …/0037_item_moves.db.test.ts` → 14 passed; `:mysql` → 14 passed; `:mariadb` → 14 passed |
| 3 | The guard test passes | no | confirmed | `vitest run …/migrations.guard.test.ts` → 38 passed; `biome check` on both 0037 files → no issues; `tsc --noEmit` → clean |
| 5 | `item_moves` keys are 115's `scope_moves` keys (cascade with item, target scope and asker; source scope and answerer set null); `item_name_history` cascades with its item and sets both people null (the corrected PLAN wording) | no | confirmed | `0024_scope_moves.ts:47-78` and `0037_item_moves.ts:53-75` follow the same pattern; history: `:105` cascade, `:116` and `:124` set null. The SPEC's Data section says "`item_moves` (like `scope_moves`)", and the PLAN.md diff now says this |
| 7 | Backfill chain and dates still hold with per-item groups | no | confirmed | The chain tests pass on 4 databases. Probe: one item with 600 aliases → 600 entries after a rerun, the last alias `@w599/s/big` → `@s/big` (current name), on MySQL and MariaDB |
| 9 | A 115 move is matched by the same scope and timestamp, and the test catches losing the scope check | no | confirmed | Mutation M1 (scope check removed) → `1 failed / 13 passed` on SQLite and MySQL; both scopes moved at the same instant, each item must find its own scope's move (`0037_item_moves.db.test.ts:299-319`) |
| 12 | A backfill that fails partway on MySQL completes on rerun; batches never split one item's entries | no | confirmed | Probe `probe-rerun.db.test.ts`, a throw planted before batch 2. Case A (1 item with 1 alias + 300 items with 2 each): "after failed run 499, after rerun 601" (601 expected; 600 before the fix). Case B (1 item with 1 alias + 1 item with 600): "after failed run 1, after rerun 600". Both pass on MySQL and MariaDB. Mutation M11 (`historyBatches` cutting every 500 entries again) → the unit test fails |

**Overall:** met: the keys follow 115 as the SPEC and the corrected PLAN say, the scope check is now caught by the test, and an interrupted MySQL backfill now completes on rerun.

## Task 2 — History written by 113 and 115

Witnessed: 2026-10-27 23:08 EDT, by a fresh agent (blind). Commit: 5a91ba44 + working tree (`git diff`, 7 files). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Renaming a workspace writes one `item_name_history` row per item, with the old name and the new name | no | confirmed | `workspaces.ts:229-240` maps every item from `itemsIn` to `named(workspace.name)` → `named(to)`. A probe renames `acme` to `acme-x` with two released items and gets exactly `[@acme/team/deploy → @acme-x/team/deploy, @acme/team/lint → @acme-x/team/lint]` |
| 2 | The rename row has `reason: rename_workspace`, `requested_by` and `decided_by` set to the renamer, and no source | no | confirmed | `workspaces.ts:230,238`: `by = actor.user?.id`, `{requestedBy: by, decidedBy: by, sourceId: null}`; the rename test's expected rows check all four fields |
| 3 | A direct scope move writes a row per item with `move_scope`, asker = decider = the mover, and `source_id` = the `scope_moves` row | no | confirmed | `scope-moves.ts:539-557`: written after `insertMove`, with `sourceId: moveId`. Mutation M3 (`sourceId: null`) → the move test fails, 1 failed / 40 passed |
| 4 | An approved move writes a row with `requested_by` = the asker, `decided_by` = the approver and `source_id` = the move; nothing while the request is open | no | confirmed | `scope-moves.ts:661-666`. The test checks no history for `lint` before approval, then dave → carol with `asked.moveId`. Mutations M2 (`decidedBy: move.requestedBy`) and M6 (old and new names swapped in `performMove`) fail it |
| 5 | The history is written inside the rename's or move's transaction | no | confirmed | `kysely-workspace-repository.ts:187-191`: `transaction` hands `work` a repo bound to `trx`, and both services call `addNameHistory` on it. Probe: a throw right after `addNameHistory` in a rename → rejected, and both `item_name_history` and the new workspace name were empty (SQLite) |
| 6 | A refused rename or move writes no history | no | confirmed | "writes no history when a rename is refused" and `scope-move-requests.db.test.ts:359-360` (refused when asked and when approved) pass |
| 7 | Their db tests assert the rows | no | partly | M1 (rename's `addNameHistory` turned off) → the rename history test fails. But M4, swapping `oldName`/`newName` in `renameLockedWorkspace`, still passes all 41 tests: the round trip `acme → acme-platform → acme` gives the same two rows either way |
| 8 | Nothing else in those tests changes | no | confirmed | `git diff --numstat`: rename.db.test.ts 29 added / 0 deleted, scope-move-requests.db.test.ts 40 / 0. `performMove`'s return shape changed and both callers use it (`scope-moves.ts:539,645`); the unit fake adds `addNameHistory`; `vitest run src/server/domains/workspaces/services` → 5 passed |
| 9 | The same on the three database servers | no | confirmed | `pnpm test:db:postgres -- <both files>` → 42 passed; `:mysql` → 42 passed; `:mariadb` → 42 passed; SQLite (with erase-user.db.test.ts) → 51 passed, 1 skipped |

**Overall:** not met: the code writes the right history rows in the right transactions on all four databases, but the rename's db test doesn't check which way the names go (row 7). Also noted: `NameHistoryEntry` was put between the repository interface and its doc comment.

### Re-check (rows 7 and 8, plus the diff since the first pass)

Witnessed: 2026-10-27 23:10 EDT, by a fresh agent (blind). Commit: 5a91ba44 + working tree (`git diff`: the fixed `rename.db.test.ts` and `workspace-repository.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | Their db tests assert the rows | no | confirmed | `rename.db.test.ts` checks the single row after `acme → acme-platform` (old `@acme/team/deploy`, new `@acme-platform/team/deploy`, the reason, both user ids, `source_id: null`), then both rows after renaming back. Mutation M4 (`oldName`/`newName` swapped in `renameLockedWorkspace`) → "writes each rename to its items' history…" fails, 1 failed / 40 passed (it passed before the fix). M1 (no `addNameHistory` call) → still fails |
| 8 | Nothing else in those tests changes | no | confirmed | `git diff --numstat`: `rename.db.test.ts` 41 added / 0 deleted, `scope-move-requests.db.test.ts` 40 / 0. In `workspace-repository.ts`, `NameHistoryEntry` (lines 51-52) now sits above "What the workspace services need from storage…" (line 54), back directly on `interface WorkspaceRepository` (line 55) |
| 9 | The same on the three database servers | no | confirmed | Both files on SQLite (`vitest run --project db`) → 41 passed, 1 skipped; `pnpm test:db:postgres -- <both files>` → 42 passed; `:mysql` → 42 passed; `:mariadb` → 42 passed |

**Overall:** met: the rename and move history rows are written in their transactions and checked by tests, including which way the names go, on all four databases.
