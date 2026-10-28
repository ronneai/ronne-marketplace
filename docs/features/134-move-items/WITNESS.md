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

## Task 3 — The checks

Witnessed: 2026-10-27 23:17 EDT, by a fresh agent (blind). Commit: e807d0ca + working tree (11 modified, 4 untracked). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Root, and the workspace's moderators and admins, move at once (`way: "now"`); any other member gets a request; global's members are everyone | no | confirmed | `permissions.ts:57-60`: `items.move_ask` for user, moderator and admin, `items.move` for moderator and admin; "gives the new name…" covers root and mod (now) and ana (request); "writes global's names short" covers bob in global (request); `vitest run permissions.test.ts …` → 77 passed |
| 2 | Someone outside the workspace, or an item that doesn't exist, gets the same not-found error | no | confirmed | `item-moves.ts:33-35` throws `ItemMoveItemNotFoundError` when the item is missing or `can(user,"items.move_ask")` fails; the test checks bob in acme and a random id; probe: bob and mod on ana's personal workspace → not found |
| 3 | The target must be another scope of the same workspace | no | confirmed | `item-moves.ts:38-39`; "refuses a scope of another workspace…" covers all three; mutation M4 (drop the `workspaceId` check) → 1 failed of 9 |
| 4 | The new name keeps the item's name in the target scope (`@acme/infra/deploy` → `@acme/devops/deploy`; `@tools/lint` → `@kit/lint` in global) | no | confirmed | tests, rows 1 and 2; probe: global move back → `newName: "@tools/lint"` |
| 5 | Clashes: an item in the target scope (`item`); an open new-item submission (submitted, changes requested, approved), not a draft, withdrawn, rejected or another item's proposal (`submission`); another item's alias (`alias`) | no | confirmed | `item-moves.ts:70-76`, `kysely-item-moves.ts:42-63` (byte for byte); a test case for each; mutation M2 (drafts clash) → 1 failed; passes on all four databases |
| 6 | This item's own alias doesn't clash, so it can move back | no | confirmed | `item-moves.ts:74` (`alias.itemId !== item.id`); mutation M1 (`true`) → 1 failed; a probe with a real moved state gave `clash: null, refused: false`. The task test only inserts the alias, never putting the item in its new scope |
| 7 | The db tests cover `global`, a shared workspace and a personal workspace | no | not met | `grep -i personal item-move-checks.db.test.ts` → nothing. Mutation `if (!workspace \|\| workspace.ownerId) throw` in `itemMovePlaces` → still 9 passed. The behaviour is right by probe: ana `way: "now"` in her personal workspace, root `now`, others not found |
| 8 | Open work: the item's own drafts and proposals counted; the workspace's dependent open work named; other people's drafts counted, not named, except for root; other workspaces' work and closed submissions left out | no | confirmed | `item-moves.ts:78-98`; "counts its own open work…" (ana `dependentsHidden: 1`, root 0 and `wip` named); mutation M3 (drop `&& !root`) → 1 failed; probe: a global draft hidden for bob, an acme submission depending on `@tools/lint` not listed |
| 9 | Open work never refuses a move | no | confirmed | `refused: clash !== null` (`item-moves.ts:113`); "refuses nobody's move for open work" |
| 10 | The same on all three database servers | no | confirmed | `pnpm test:db:postgres\|mysql\|mariadb -- …/item-move-checks.db.test.ts` → 9 passed on each; SQLite → 9 passed |
| 11 | The ItemMove* errors have messages in en, pt and fr, with their placeholders | no | confirmed | `errors.json` ×3, lines 40-43; `workspace-errors.test.ts` cases for all four → passed |
| 12 | Lint and types are clean | no | confirmed | `biome check` on the changed folders → no fixes; `tsc --noEmit -p apps/web` → exit 0 |

**Overall:** not met: the checks are right on all four databases and in a personal workspace (by probe), but the task's db tests have no personal-workspace case, which the *Done when* requires.

### Re-check (rows 6 and 7, and the changed test)

Witnessed: 2026-10-27 23:21 EDT, by a fresh agent (blind). Commit: e807d0ca + working tree (only `item-move-checks.db.test.ts` changed since the last pass). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | This item's own alias doesn't clash, so it can move back where it came from | no | confirmed | `item-move-checks.db.test.ts:262-278` moves the item to devops with its `@acme/infra/deploy` alias, then checks the move back to infra → `newName: "@acme/infra/deploy", clash: null, refused: false`. Mutation M1 (`alias.itemId !== item.id` → `true`) → 1 failed of 10 |
| 7 | The db tests cover `global`, a shared workspace and a personal workspace | no | confirmed | New case at `item-move-checks.db.test.ts:179-193`: in ana's personal workspace, ana and root get `way: "now"`; mod and bob get `ItemMoveItemNotFoundError`. Mutation (`if (!workspace \|\| workspace.ownerId) throw …`) → 1 failed of 10; before, it passed 9 of 9 |
| 10 | The changed test file passes on all four databases | no | confirmed | SQLite `vitest run --project db …item-move-checks.db.test.ts` → 10 passed; `pnpm test:db:postgres\|mysql\|mariadb -- …` → 10 passed on each |
| 12 | The changed file is lint-clean | no | confirmed | `biome check` on the file → no fixes applied |

**Overall:** met: rows 6 and 7 now hold. The personal-workspace case and the real move back both fail under their mutations and pass on SQLite, PostgreSQL, MySQL and MariaDB.

## Task 4 — Asking, answering, moving

Witnessed: 2026-10-27 23:43 EDT, by a fresh agent (blind). Commit: 9c72d89f + working tree (24 modified files, 1 untracked test file). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | "Who decides", row 1: root, moderators and admins move the item at once (new scope, alias `move`, history row, `approved` request, `item.moved` with `direct: true`) | no | confirmed | "moves at once for root, moderators and admins…" passes on SQLite, PostgreSQL, MySQL and MariaDB; it covers mod, adm and root; `standingIn` returns `moves` for root, admin and moderator |
| 2 | "Who decides", row 2: a regular member asks, and moderators, admins or root answer | no | confirmed | "asks for a regular member…" → `requested`, item stays in infra, no history row; mod approves → `moved`, history requested_by=ana, decided_by=mod, `direct: false` |
| 3 | The asker never answers their own request | no | partly | The code holds: probe P1 (ana asks, is promoted to moderator, then approve and decline both → `ItemMoveNotFoundError`, root still approves) passes on all four databases. The suite doesn't pin it: mutation M1, removing `user.id === move.requestedBy \|\|` from `approveItemMove`, leaves all 17 tests passing |
| 4 | A non-member, and a member removed since their session was read, get not found and no request is written | no | confirmed | "answers as not found to someone outside the workspace, and to a removed member" → `ItemMoveItemNotFoundError`, `item_moves` empty; `roleIn` reads `user` and `workspace_members` fresh |
| 5 | Refusals at ask, and at approve: a clash refuses, and at approval leaves the request open | no | confirmed | "refuses a clash at ask…" → `ItemMoveRefusedError` both times, the request stays `open`, the item stays in infra |
| 6 | The asker's membership is re-checked at approval: cancelled with `asker_lost_role` | no | confirmed | "cancels a request whose asker left…" passes; mutation M2 (check removed) → it fails |
| 7 | A target that left the workspace cancels the request (`target_moved`); so does the item's own scope moving out | no | confirmed | "cancels a request whose target scope moved…" passes; M3 (only `!target` kept) → it fails; probe P2 (infra moved to beta, then approve) → rejected, row `cancelled`, on all four databases |
| 8 | The move transaction changes the item's and its submissions' scope, adds the alias, applies 113's rewrite, writes the history row, closes the request, raises the catalogue revision and audits | no | confirmed | "moves at once…", "names the item anew in its proposals and in the workspace's open work…" (proposal and dependent draft rewritten, then released as 1.1.0 on the same item) and "moves back…" pass; M5 (catalogue bump removed) → "moves at once" fails |
| 9 | A release racing a move: they share the lock, and a release packed under the old name is refused (`ItemMovedError`) | no | confirmed | "refuses a release packed under the item's old scope" and "lets a release and a move at the same time end consistently" pass on all four databases; M4 (publish.ts check removed) → the first fails; release: submission then items (`publish.ts:371,434`), move: open submissions then the item: the same order |
| 10 | Two answers at once: the first wins, the second gets "Already answered" | no | confirmed | "answers two approvals at once once" → 1 fulfilled, 1 `ItemMoveAnsweredError`, 1 history row, on all four databases; M6 (status guards removed) → 2 tests fail; probe P3 (decline and approve at once) → one wins, consistent, on all four databases |
| 11 | A lost role: a moderator demoted since their session was read asks instead of moving, and can't answer | no | confirmed | "asks, not moves, for a moderator demoted…" and "lets a moderator demoted… answer nothing" pass |
| 12 | Cancel and decline: the asker or an answerer cancels, others can't; decline's optional reason; 500-character limit | no | confirmed | "declines with a reason, and is cancelled by its asker or an answerer…" and "refuses a message or a reason over 500 characters" pass |
| 13 | One open request per item, a direct move included | no | confirmed | "keeps one open move per item" → `ItemMoveOpenError` for ana and for mod; checked under the item's lock |
| 14 | The four audit events, on the item, naming both scopes; message and decline reason stay out of the log | no | confirmed | `audit-event.ts` adds the four actions; metadata holds name and to (plus from and newName on `moved`); the decline test checks the text is absent; `summary.test.ts` and the i18n tests → 21 files, 379 passed |
| 15 | Erasing a person cancels their open item moves | no | confirmed | "cancels the open item moves of a person erased" → `cancelled`, reason null; `erase-user.ts` adds `cancelItemMoves` to `movesCancelled` |
| 16 | All of the above on the four databases, and the shared `publish.db.test.ts` still passes | no | confirmed | `pnpm test:db:{postgres,mysql,mariadb} -- <item-move-requests, publish>` → 24 passed on each; SQLite → 24 passed. A first loop over all three servers failed at once with `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL` (cause not captured; likely the other witness on the same servers); each rerun passed |
| 17 | The errors in three languages, and the spec's wording for a target moved out: "@acme/devops is now in another workspace" | no | partly | keys in en, pt and fr, parity tests pass; but `ItemMoveTargetMovedError(result.target)` gets the bare `devops`, not `@acme/devops` |

**Overall:** not met: the behaviour holds on all four databases, but no test pins "never by its asker" (row 3), and the target-moved error names the bare scope, not its full name (row 17).

### Adversarial pass

Witnessed: 2026-10-27 23:47 EDT, by a fresh agent (adversarial). Commit: 9c72d89f + working tree (uncommitted diff). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Root and the workspace's moderators and admins move at once, and so does a personal workspace's owner | no | confirmed | "moves at once for root, moderators and admins" passed on all 4 (3 runs each on the servers). Probe P1: bob, owner of personal workspace `bob`, got `moved` → `@bob/pb/tool` (SQLite, PG; the probe's own datetime insert failed on MySQL and MariaDB). Probe P8, in `global`: bob asks → `requested`, `@ga/gt` → `@gb/gt`; approved by a global moderator, alias `@ga/gt`, on all 4 |
| 2 | Any other member gets a request, answered by moderators, admins or root, never by its asker | no | confirmed | "asks for a regular member…" passed on all 4. Probe P2: ana asks, is promoted to moderator, then approves or declines her own → `ItemMoveNotFoundError`, still open (all 4). Mutation M1 (dropping `user.id === move.requestedBy` from approve) → the suite still passes 17/17, P2 fails |
| 3 | A non-member and a removed member are refused | no | confirmed | "answers as not found…" passed on all 4. Probe P3: an admin of `beta` gets `ItemMoveNotFoundError` from approve, cancel and decline on acme's request; another workspace's scope, the own scope and a missing id refused at ask; no session → ask, approve and cancel reject |
| 4 | The asker's membership is re-checked at approval (`asker_lost_role`), including an asker disabled since | no | confirmed | "cancels a request whose asker left…" passed on all 4; mutation M3 (no asker check) → it fails. Probe P10 (disabled asker → `ItemMoveAskerLostRoleError`) passed on SQLite and PG |
| 5 | A target that left the workspace cancels (`target_moved`), including when the item's own scope moved to another workspace | no | partly | Target moved out: passes on all 4. Item's own scope moved out (probe P7: `askScopeMove(infra → beta)`, then root approves) → closes as `asker_lost_role` on all 4; the spec says `target_moved`. The asker check (`item-moves.ts:394`) runs before the target check (`:396`) |
| 6 | Refusals at ask and at approve (a clash; one open request per item) | no | confirmed | "refuses a clash…" and "keeps one open move per item" passed on all 4. Probe P6: another item's alias → `ItemMoveRefusedError`. Probe P5: three concurrent asks → `[requested, ItemMoveOpenError, ItemMoveOpenError]`, at most one open, on all 4 |
| 7 | Two answers at once: one wins, the others get "Already answered" | no | confirmed | "answers two approvals at once once" passed on all 4. Probe P4 (approve + decline + cancel at once) → one fulfilled, the others `ItemMoveAnsweredError`, the scope matching the status, on all 4. M7 (no status check) → 2 fail. M4 and M6 → 17 pass on PG: the asker's user-row lock already serialises two answerers |
| 8 | A lost role: a demoted moderator answers nothing and asks instead of moving | no | confirmed | both tests pass on all 4. Caveat: M8 and M9 (session `can()` instead of `standingIn`) still pass 17/17: `actor()` reads memberships fresh, so these tests never meet a stale session |
| 9 | The move transaction: the item's scope, the alias, 113's rewrite, history, request, catalogue revision, audit event | no | confirmed | "moves at once…", "names the item anew…" and "moves back…" passed on all 4; `item-moves.ts:211-247`, `kysely-item-moves.ts:184-193`. Probe P9a (a move racing a rename): both ok, history in order. P9b (racing a scope move): both ok, or on MySQL the move refused with `ItemMoveScopeNotFoundError` after the scope move won; no deadlock, consistent |
| 10 | Under the item's release lock: a release racing a move ends consistently, and one packed under the old name is refused with `ItemMovedError` | no | partly | Lock order holds: probe `zz-adv-race` queues both behind a held lock in both orders on PG, MySQL and MariaDB: one item, no deadlock, `ItemMovedError` when the move goes first. But "lets a release and a move at the same time end consistently" is flaky (failed on PG 1 in 3: `expected ItemNameTakenError … to be an instance of ItemMovedError`). Probe W4: a move committing between the release's read and its pre-pack transaction (`publish.ts:249` → `ownItem`) refuses it as "@acme/infra/deploy is taken", the item's own old name |
| 11 | Four audit events, naming both scopes; message and reason kept out | no | confirmed | `audit-event.ts` adds the four; `summary.ts` the sentences; `vitest run summary.test.ts workspace-errors.test.ts workspaces.test.ts` → 80 passed; the decline test checks the text is absent |
| 12 | Erasure cancels the person's open item moves | no | confirmed | the test passed on all 4; `cancelItemMoves` only touches `status = 'open'` |
| 13 | Spec, Edge cases: deleting the target scope cascades the open request | no | can't check here | the probe's scope held an item (`items_scope_id_fk`); out of time; the cascade belongs to task 1's migration |
| 14 | On the four databases | no | confirmed | SQLite 17/17. PG: 17, 16 (row 10's flake), 17. MySQL 3×17. MariaDB 3×17 |

**Overall:** not met: a request whose item's own scope moved closes as `asker_lost_role`, a move landing just before a release's pre-pack check refuses it as "taken" (and makes the race test flaky), and the "never the asker" check has no test that fails without it.

### Re-check of rows 3 and 17, and the diff since the last pass

Witnessed: 2026-10-27 23:58 EDT, by a fresh agent (blind). Commit: 9c72d89f + working tree (27 entries in `git status`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | The asker never answers their own request | no | confirmed | "never lets the asker answer their own request, even once they may answer others'" passes on all four databases; M1 (remove `user.id === move.requestedBy \|\|` in `approveItemMove`) → it fails, 1 of 21; M1b (the same in `declineItemMove`) → it fails too; probe P1 passes on all four |
| 17 | The target-moved error names the scope in full, as the spec words it ("@acme/devops is now in another workspace") | no | partly | `approveItemMove` passes `scopeFullName(...)`, the test checks `@beta/devops`; but SPEC.md:120 still says "@acme/devops is now in another workspace", and SPEC.md isn't in the diff |
| 18 | When the answerer can't see the target's new workspace, the error names the scope in the item's workspace, never the private workspace | no | partly | Probe P4 (devops moved to beta, beta made private, mod approves) → `scopeName` `@acme/devops`, no "beta", on all four. No test pins it: M8 (`targetWorkspace ?? workspace`) leaves all 21 passing |
| 19 | The target check runs before the asker check; the item's own scope moving out cancels as `target_moved`, named in the item's workspace | no | confirmed | "cancels a request whose item's own scope moved…" (`@acme/devops`) and probe P2 pass on all four |
| 20 | Roles are read again under the lock: a stale session asks instead of moving, and answers nothing | no | confirmed | the new test with the stale `who.mod` passes on all four: `requested`, approve and decline → `ItemMoveNotFoundError`, still `open` |
| 21 | `ownItem`: the proposal's own item under an old name is refused as moved; another item's old name is still "taken" | no | confirmed | "refuses a release as moved, not as taken…" passes on all four; M9 (`if (false)`) → it and the `publish.test.ts` unit case fail; as is, `publish.test.ts` → 3 passed |
| 22 | Nothing else broke: the item-move file, `publish.db.test.ts` and probes P1–P4 | no | confirmed | 32 passed on SQLite, PostgreSQL, MySQL and MariaDB; P3 (decline and approve at once: one wins) on all four |

**Overall:** not met: the asker rule is pinned (row 3), but the spec still words the target-moved error as "@acme/devops" while the code names `@beta/devops` (row 17), and no test pins the private-workspace fallback (row 18).

### Adversarial re-check — rows 2, 5, 8, 10, 13 and the diff since the last pass

Witnessed: 2026-10-27 23:58 EDT, by a fresh agent (adversarial). Commit: 9c72d89f + working tree (uncommitted diff, including the fixes to `item-moves.ts`, `publish.ts` and `publish.test.ts`, and the new db cases). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | Any other member's move is a request that moderators, admins or root answer, never the asker | no | confirmed | `item-move-requests.db.test.ts` → 21/21 on SQLite, PG, MySQL and MariaDB. M1 (dropping `user.id === move.requestedBy \|\|` from approve) → "never lets the asker answer their own request…" fails, 1 failed / 20 passed |
| 5 | A target that left the workspace cancels as `target_moved`, including when the item's own scope moved out | no | confirmed | Probe P7 (`infra` moved to `beta`, root approves) → `ItemMoveTargetMovedError`, `cancelled`, `target_moved` on all 4. M11 (asker checked before target) → the new test fails. R7b: a beta admin answering after the move gets the same; acme's moderator gets `ItemMoveNotFoundError`. R7c (target moved to a private `secret`) → names `@acme/devops`, never `secret` |
| 8 | A lost role (demoted moderator, stale session) is read again under the lock | no | confirmed | "reads roles again under the lock…" (stale `who.mod`) fails under M8 (approve uses the session's `can()`), M8b (decline) and M9 (ask): 1 failed / 20 passed each; 21/21 on all 4 without mutations |
| 10 | A release racing a move is refused with `ItemMovedError` ("…release it again"), never as "taken" | no | confirmed | Probe W4 (the move commits right after the release reads the revision files) → `ItemMovedError … release it again.`, only 1.0.0 stored, on all 4 (before the fix: `ItemNameTakenError`). W1–W3: the release goes out under the new name; W5–W8: the hook never fires. M10 (no `ItemMovedError` branch in `ownItem`) → "refuses a release as moved, not as taken…" fails. The release tests ran 8× on PG → 3 passed each time. `zz-adv-race` on PG → 4/4 consistent, no deadlock. `publish.test.ts` → 3 passed |
| 13 | Deleting the target scope cascades the open request | no | confirmed | Probe R13 (open request to an empty scope, the scope deleted) → the `item_moves` row is gone, and a new ask → `requested`, on all 4 |

**Overall:** met: the asker can't answer their own request, the target is checked before the asker, roles are read again under the lock, a release racing a move is refused as moved, and deleting the target scope removes the request. Every row has a mutation or probe that fails without the fix, on all four databases.

### Re-check (rows 17 and 18)

Witnessed: 2026-10-28 00:03 EDT, by a fresh agent (blind). Commit: 9c72d89f + working tree (28 entries in `git status`; SPEC.md is now among them). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 17 | The target-moved error names the scope in full, as the spec words it | no | confirmed | SPEC.md's edge case "The target scope is deleted, or moved…" now says "@beta/devops is now in another workspace than the item", the scope where it is now, or `@acme/devops` when the answerer doesn't see its new workspace, matching the code and the error's English text. "cancels a request whose target scope moved…" checks `@beta/devops`. The item-move file → 22 passed on SQLite, PostgreSQL, MySQL and MariaDB |
| 18 | When the answerer can't see the target's new workspace, the error names the scope in the item's workspace, never the private workspace | no | confirmed | "never names a private workspace the answerer can't see when the target moved into it" passes on all four (`@acme/devops`, no "beta"); M8 (`targetWorkspace ?? workspace`) → it fails, 1 of 22; restored, `cmp` matches |

**Overall:** met: with this re-check, every row of task 4's passes is confirmed on all four databases.

## Task 5 — After the move

Witnessed: 2026-10-28 00:10 EDT, by a fresh agent (blind). Commit: 7a915b85 plus the untracked `apps/web/src/server/domains/workspaces/actions/after-item-move.db.test.ts`. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass on SQLite | no | confirmed | `pnpm --filter @ronneai/web exec vitest run --project db src/server/domains/workspaces/actions/after-item-move.db.test.ts` → 3 passed |
| 2 | The same on PostgreSQL, MySQL and MariaDB | no | confirmed | `pnpm test:db:postgres` / `:mysql` / `:mariadb -- src/server/domains/workspaces/actions/after-item-move.db.test.ts` → 3 passed on each |
| 3 | There are tests for a move in a shared workspace, in `global`, and a move back | no | confirmed | three `it`s: acme infra→devops, global tools→kit, acme infra→devops→infra |
| 4 | Item page: the new name shows the item and the old name redirects | no | confirmed | `itemPage` for the old and new refs both return the new `fullName`; `features/item-page/load.ts:50-52` redirects when `fullName` differs. With the alias write removed (`setAliases([], …)`), all 3 fail |
| 5 | The catalogue and search list it under the new scope | no | confirmed | `browseCatalogue {q:"deploy"}` → `acme/devops/deploy`. Probe: the scope filter `devops` lists it, `infra` nothing; the API search (`/api/v1/items`, which MCP uses) gives `@acme/devops/deploy` for `q=deploy`, `q=devops`, `scope=devops` |
| 6 | Feeds offer it under its new name from the next request | no | confirmed | the marketplace before and after (`acme.infra.deploy` → `acme.devops.deploy`, `kit.lint`, `acme.infra.deploy`). With `bumpCatalogueRevision` removed from `applyItemMove`, the shared test fails |
| 7 | Resolve: the old name resolves and the answer says the new name | no | confirmed | `resolveAs` → `renamed {old: new}` in all three. Keeping the moved-back item's own old alias fails the moved-back test |
| 8 | The registry API (rmk and MCP read through it) answers both names with the new one | no | confirmed | `getRegistryItem` with a reader's token: 200 and the new name, for both refs (shared) and the old ref (global). packages/mcp reads through rmk's client (`/api/v1/...`, server.test.ts:64) |
| 9 | Old names install (the tarball downloads under the old name) | no | confirmed | shared test: `downloadArtifactAs(old, "1.0.0")` returns bytes |
| 10 | `rmk` rewrites the lockfile from resolve's `renamed` | no | confirmed | 118's code: `vitest run src/install-renamed.test.ts` in packages/cli → 8 passed; with `now = (name) => name` in install.ts:281, 2 fail. The server sends the `renamed` shape rmk reads |
| 11 | Review queue: the open proposal stays with the same workspace's reviewers, under the new scope | no | confirmed | `listQueue(mod, needs)` → `acme/devops/deploy`; leaving `submissions.scope_id` unchanged fails it |
| 12 | Versions, checksums, tarball paths and tags are unchanged | no | confirmed | `untouched()` compares `item_versions` (id, item_id, version, sha256, artifact_path) and `dist_tags`, in all 3 |
| 13 | Download counts are unchanged, in all three cases | no | partly | Global and moved-back check them (`download_count: 7` in `applyItemMove` fails both); the shared test replaces them (`{ ...after, downloads: before.downloads }`), so that mutation passes it |
| 14 | Pins and favorites follow the item | no | confirmed | `listFavorites(reader)` → `[deploy]`; `untouched().pins` keeps `item_id shelf` unchanged |
| 15 | Moving back: the first name is the name again and the second an alias | no | confirmed | both refs → `@acme/infra/deploy`, the feed `acme.infra.deploy`, resolve renames `@acme/devops/deploy` → `@acme/infra/deploy`; History's half is task 8 |

**Overall:** not met: everything holds, but the shared-workspace test doesn't check that the download count is unchanged (row 13).

### Re-check (row 13)

Witnessed: 2026-10-28 00:14 EDT, by a fresh agent (blind). Commit: 7a915b85 plus the untracked `apps/web/src/server/domains/workspaces/actions/after-item-move.db.test.ts`. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | Download counts are unchanged, in all three cases | no | confirmed | The shared test now expects `untouched()` to equal `before` with the deploy item's count raised by exactly 1 (test lines 277-282). `download_count: 7` in `applyItemMove` → 3 failed (3), shared included; `download_count + 1` at the move → 3 failed (3) |
| 1-2 | The test still passes on every database after the diff | no | confirmed | `vitest run --project db …after-item-move.db.test.ts` → 3 passed; `pnpm test:db:postgres` / `:mysql` / `:mariadb -- …` → 3 passed on each |

**Overall:** met: the shared-workspace test now checks that the download count is unchanged apart from the one download after the move, and both mutations fail it.

## Task 6 — The Move dialog

Witnessed: 2026-10-28 00:37 EDT, by a fresh agent (blind). Commit: 552b32ac + working tree (23 modified, 3 untracked). Machine: macOS (Darwin 27), Node v24.0.0. (Time corrected by the witness at its re-check: it first wrote 00:45.)

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Move to another scope… shows for members of the item's workspace and root, only when the workspace has another scope | no | confirmed | `ItemPageView.tsx` shows it only when `page.move && page.move.targets.length > 0`; "is for members and root…" db test: non-member and no session null, user `request`, mod/adm/root `now`, removed member null. Mutation dropping the `targets.length` check → item-page.test fails |
| 2 | Step 1: a select of the workspace's other scopes, with their descriptions | no | partly | The other scopes are listed (`scopesIn` without the item's own); but `MoveItem.tsx` renders `<option>{target.name}</option>` and never uses `target.description` |
| 3 | Step 2: what changes once a scope is picked: the new name, the old name kept and rmk, Claude Code's new plugin, open work taking the new name, others' drafts counted | no | confirmed | `MoveItemChanges` and the `item.move` keys; move-item.test checks the from → to, "Its 2 open drafts…", "and 1 draft you can’t see"; checks for another scope aren't reused (`to: "s3"` with an `s2` impact shows "Checking…") |
| 4 | A clash (item, open submission, another item's old name) shows its reason and disables the button | no | confirmed | the test loops over all 3 kinds; `Button.tsx:60` sets `disabled` with `disabledReason`; mutation ignoring `checked.refused` → the test fails |
| 5 | Step 3: an optional message, only for a request | no | confirmed | the textarea only when `request` (maxLength 500); tests for both ways |
| 6 | Step 4: the button says what will happen, Move item or Ask to move ("acme's moderators, admins or root will answer") | no | partly | Move item / Ask to move right; mutation `request = false` → 2 tests fail. But `answeredBy` reads "This workspace’s moderators, admins or root will answer.", not naming the workspace |
| 7 | A move made at once asks once more: "Move @acme/infra/deploy to @acme/devops, as @acme/devops/deploy?" | no | confirmed | the `question` key matches; Enter goes to the confirmation; mutation skipping it → the test fails |
| 8 | The open-request notice shows for the asker and those who can answer; a declined one only to its asker, with the reason, until the next request | no | confirmed | `itemMoveView`'s condition; db test: open → ana and mod, cy null, declined → ana only, cancelled not shown; component tests cover open, mine, former user, cancelled, declined; mutation → "a declined one…" fails |
| 9 | Messages in en, pt and fr | no | confirmed | `item.move` has 36 keys in each; pt/fr English-leak checks → []; the i18n and help tests → 77 passed; `biome lint` → no errors |
| 10 | The "Who has to agree?" helper → `scopes#moving-items` | no | confirmed | `Help.tsx:47`, `topics.ts`, `help.json` ×3; the test checks the link |
| 11 | Done when: component tests cover a direct move, a request, a clash and the notices | no | confirmed | 71 passed; each of 5 mutations made a test fail |
| 12 | Done when: the phone sweep passes for the dialog | no | confirmed | `playwright test e2e/move-item.mobile.e2e.ts --project phone --project phone-webkit --project tablet` → 3 passed; `fits` and `noSideScroll` at the screen's width, 360px and 320px |
| 13 | The view's repository reads work on all dialects | no | confirmed | `item-move-requests.db.test.ts` → 24 passed on SQLite, PostgreSQL, MySQL and MariaDB |

**Overall:** not met: the scope select doesn't show the scopes' descriptions (row 2), and the line under Ask to move doesn't name the workspace (row 6).

### Re-check (rows 2 and 6)

Witnessed: 2026-10-28 00:39 EDT, by a fresh agent (blind). Commit: 552b32ac + working tree (23 modified, 3 untracked, plus SPEC.md and WITNESS.md). Machine: macOS (Darwin 27), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | Step 1 (as SPEC.md now reads): a select of the workspace's other scopes, the chosen one's description under it | no | confirmed | SPEC.md:74 has the new wording; MoveItem.tsx shows the chosen target's `description` in a `<p>` under the select; move-item.test:76–77 (`>Devops.</p>` with `s2` chosen, none without). Mutation never rendering it → "says what the chosen scope is for, under the select" fails (1 failed / 13 passed) |
| 6 | Step 4: the line under Ask to move names the workspace ("acme's moderators, admins or root will answer") | no | confirmed | `itemMoveView` returns `workspace: workspace.name` (item-moves.ts:602); en `answeredBy` = "{workspace}’s moderators, admins or root will answer.", pt and fr "de {workspace}"; move-item.test:108; the db test expects `workspace: "acme"` (24 passed on SQLite and PostgreSQL). Mutation with a fixed "This workspace" → "asks for anyone else…" fails |
| — | The diff hasn't broken the rest | no | confirmed | `vitest run` on move-item, item-page, item-page translations, `messages.parity` and `messages` → 104 passed (English-leak and `{workspace}` placeholder parity included). Phone sweep (`--project phone --project phone-webkit --project tablet`) → 3 passed |

**Overall:** met: the chosen scope's description shows under the select, and the line under Ask to move names the item's workspace, in all three languages; tests and mutations back both.

## Task 7 — Item moves on the Requests page

Witnessed: 2026-10-28 00:58 EDT, by a fresh agent (blind). Commit: 7456e11d + working tree (24 modified, 2 untracked). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `/workspaces/requests` has a third table, Item moves: root sees every open request, a workspace's moderators and admins their workspace's, a plain member or an outsider none | no | confirmed | `vitest run --project db …/item-move-requests.db.test.ts` → 27 passed; rows for mod, adm and root, `[]` for ana and bob; `requests/page.test.tsx` passed. Mutation: the page renders `null` instead of `<ItemMovesTable>` → "lists the item moves for a workspace's moderators (134)" fails |
| 2 | A workspace's Requests tab shows only that workspace's item moves | no | confirmed | db test: acme's → 1 row, beta's → `[]`, also for root. Mutation ignoring `workspaceId` → it fails. The tab's wiring (`[name]/page.tsx:114-139`) checked by reading only |
| 3 | The asker never sees their own request (no row, no Approve, not in the count), even after promotion to moderator | no | partly | The behaviour holds (probe: ana asks, is promoted, her table and count are empty), but M1 (deleting `if (move.requestedBy === user.id) continue;`) and M2 (count `pending.length`) still pass the task 7 db tests |
| 4 | Each row shows the item and its type, from and to, its new name, who asked and when, the message, and any clash since | no | confirmed | `item-moves-table.test.tsx` → 6 passed; db tests "marks a clash that appeared" (`item`) and scope-moved (`moved`) pass; mutation hiding the refusal line → its test fails |
| 5 | Approve re-checks and moves, or leaves it open and says what refuses it; Decline takes an optional reason; a second answer gets "Already answered" | no | confirmed | task 4's db tests (rerun) pass: clash at approval leaves it open, decline with reason, two approvals → one `ItemMoveAnsweredError`; `actions.ts` returns `refused` for `ItemMoveRefusedError`; the e2e declines with a reason and the asker sees it |
| 6 | Done when: component tests cover each answer | no | partly | Only Approve's `done` and `refused` states are rendered; nothing renders the Decline dialog or the `error` state ("Already answered.") |
| 7 | The nav's Requests count includes item moves | no | confirmed | `shell.test.ts` → 13 passed (12 for root, 9 for a moderator); mutation (`0` in shell.ts) → it fails; db: count 1 for mod and root, 0 for ana and bob, 0 after approval |
| 8 | Messages in en, pt and fr | no | confirmed | `itemMoves` has 17 keys in each; the other keys and `item-move-approve` present in all three; pt/fr English-leak tests pass; the unit project passes in full |
| 9 | The help link `item-move-approve` points to the Documentation | no | confirmed | `Help.tsx` → `docsHref("scopes","moving-items")`; `topics.ts:67`; the component test sees the link |
| 10 | `pendingItemMoves` works on the three servers | no | confirmed | `pnpm test:db:postgres` / `:mysql` / `:mariadb -- …/item-move-requests.db.test.ts` → 27 passed each |
| 11 | The phone sweep passes | no | confirmed | `playwright test e2e/move-item.mobile.e2e.ts e2e/mobile-sweep.mobile.e2e.ts --project phone --project phone-webkit --project tablet` → 48 passed; the build is newer than every edited file |

**Overall:** not met: the behaviour holds, but the task's tests don't protect the "never the asker's own" filter (row 3), and no component test covers Decline or "Already answered" (row 6).

### Re-check (rows 3 and 6)

Witnessed: 2026-10-28 01:13 EDT, by a fresh agent (blind). Commit: 7456e11d + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | The asker never sees their own request (no row, no Approve, not in the count), even after promotion to moderator, and a test guards it | no | confirmed | New case `item-move-requests.db.test.ts:775` → task 7 cases 4 passed on SQLite; the file 28 passed on PostgreSQL, MySQL and MariaDB. M1 (the `requestedBy` skip removed) and M2 (`return pending.length;`) each fail "never lists the asker's own request, nor counts it, even once they moderate" |
| 6 | Done when: component tests cover each answer (Approve moved or refused, Decline with a reason, Already answered) | no | confirmed | `vitest run src/features/workspace-requests` → 25 passed; `item-moves-table.test.tsx` renders `DeclineItemMoveForm` (reason, `maxLength="500"`, "Ana sees it on the item’s page. 0/500") and Approve with `loaded={{ error: "Already answered." }}`; the pt/fr leak checks include the decline form. Mutations `maxLength={5000}` and Approve's `FieldError` with `{null}` each fail a test. (Decline's own "Already answered" state isn't rendered: the form takes no `loaded`; it goes through the same `attempt` and `FieldError` as the scope-move answers) |
| 11 | The phone sweep passes (the only source change is the export of `DeclineItemMoveForm`) | no | confirmed | `ItemMovesTable.tsx:60` is now `export const DeclineItemMoveForm`, nothing else in the source; the first pass's 48 passed holds |

**Overall:** met: the own-request filter now has a test that fails without it, and the component tests render each answer, Decline and "Already answered" included.

## Task 8 — History tab

Witnessed: 2026-10-28 01:27 EDT, by a fresh agent (blind). Commit: 4ce291c5 + working tree. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `?tab=history` is a tab of the item page and renders the History tab; a 404 for a reader who doesn't see the item | no | confirmed | `tabs.ts` adds `history`; `page.tsx` renders `HistoryTab` with `loadHistory`, which calls `notFound()` on null; `vitest run item-page.test.tsx history-tab.test.tsx workspaces.test.ts` → 41 passed |
| 2 | The current name first, then each change newest first, with reason, from → to, date and people | no | confirmed | `item-history.db.test.ts` "lists every change newest first"; ordered by `created_at desc, id desc`; 5 passed on SQLite, PostgreSQL, MySQL and MariaDB |
| 3 | Tests cover each reason | no | confirmed | `rename_workspace`, `move_item` and `move_scope` through the real actions, `migration` from an inserted row; `history-tab.test.tsx` checks all four texts |
| 4 | A backfilled entry without people names nobody | no | partly | The code is right (`direct: row.requestedBy !== null && …`, `item-moves.ts:773`), but dropping `row.requestedBy !== null &&` still passed 5 of 5: a null/null migration row would show "by a former user" |
| 5 | An erased user shows as their pseudonym | no | confirmed | "names an erased person by their pseudonym" passes on all 4 dialects |
| 6 | An earlier name in a private workspace shows as "a workspace you can't see" to an outsider, and every older name stays hidden | no | confirmed | db tests: `move_scope` has `from: null` for ana, mod and bob; bob, once in vault, sees `@vault/infra/deploy`; the earlier migration row is `[null, null]`; mutation `sees(row.fromWorkspaceId)` → `true` fails 2 tests |
| 7 | Moving back: the History tab shows both moves | no | confirmed | Probe (`probe-history.db.test.ts`): infra → devops → infra gives both `move_item` entries and the `move_scope` → passed; no repository test for it |
| 8 | Messages in en, pt and fr | no | confirmed | `tabs.history`, `history.*`, `help.json` `item-history` in all three; parity and help → 65 passed; pt/fr leak tests pass. Side note: `history.when`, `history.change` and `history.who` are never used |
| 9 | The "Why did the name change?" helper links to `items#history`, and both repositories' topics match | no | confirmed | `Help.tsx`, `topics.ts`; the UI test checks the link; `pnpm docs:links` → "Compared 35 topics with the website's"; ronne-web `feat/134-move-items` has the three `history:` sections |
| 10 | The phone sweep passes with the History tab in it | no | confirmed | `e2e/pages.ts` adds `?tab=history`; `playwright test e2e/mobile-sweep.mobile.e2e.ts --project phone --project phone-webkit --project tablet` → 45 passed |

**Overall:** not met: one test gap (row 4): no test fails if a backfilled entry with nobody's name were shown as "by a former user".

### Re-check (row 4)

Witnessed: 2026-10-28 01:33 EDT, by a fresh agent (blind). Commit: 4ce291c5 + working tree. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | A backfilled entry without people names nobody | no | confirmed | `item-history.db.test.ts:234` checks `["migration", null, null, null, null, false]` and the scope move's `direct: true`. The mutation (`direct: row.requestedBy === row.decidedBy`) → "hides every older name once a hidden workspace is crossed" fails, 1 of 6; restored, `cmp` matched |
| 7 | Moving back: the History tab shows both moves | no | confirmed | New case at `item-history.db.test.ts:243`; 6 passed on SQLite, PostgreSQL, MySQL and MariaDB |
| 8 | Messages in en, pt and fr | no | confirmed | the `history` keys in all 3 `item.json` (`when`, `change`, `who` gone; nothing uses them); `vitest run src/i18n/messages.parity.test.ts src/features/item-page/history-tab.test.tsx` → 55 passed |

**Overall:** met: a migration row now has to be `direct: false` with nobody named, the move back is tested on all four dialects, and the unused message keys are gone.
