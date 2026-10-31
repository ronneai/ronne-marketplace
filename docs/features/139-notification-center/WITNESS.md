# 139 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 7b92e5d2 plus the uncommitted working tree. Machine: macOS (Darwin).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP §15 "Notifications" row says a bell with a count in a top bar over the content area, in-app only | no | confirmed | `git diff docs/MVP/MVP.md` → line 1010 changed from "a bell in the sidebar" |
| 2 | §14.5 says in-app is in and email and webhooks are out | no | confirmed | MVP.md:860 |
| 3 | MVP §2 says in-app notifications are in | no | partly | §2 has no wording; the matching line is the non-goals line 35, already consistent |
| 4 | README lists 139 in M21 with its dependencies | no | partly | README.md:392 had the right dependencies but said "in the sidebar and Menu" |
| 5 | No other doc puts the bell in the sidebar or Menu sheet | no | not met | README.md:392 |
| 6 | 139 SPEC Scope, Design and Decision 2 agree | no | confirmed | SPEC.md read in full |
| 7 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** not met: README.md:392 still said the bell is in the sidebar and Menu.

### Re-check

Witnessed: 2026-10-31, by a fresh agent (blind, re-check of claims 4 and 5, with 3). Commit: 7b92e5d2 plus the uncommitted working tree. Machine: macOS (Darwin).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | README's 139 row matches the spec and lists 007, 060, 102, 103, 104, 119, 129 | no | confirmed | README.md:392 → "a top bar over the content area (and in the phone header)" |
| 2 | No doc outside UI-Mocks-Materials puts 139's bell in the sidebar or Menu sheet | no | confirmed | grep of docs: only 140's "Update available" mark at the sidebar's foot, a separate thing |
| 3 | MVP.md:35, :860, :941 and the Notifications row agree with the spec (§2 itself has no wording; line 35 is the non-goals line) | no | confirmed | MVP.md read at those lines |
| 4 | `pnpm witness:check` passes | no | confirmed | exit 0 |

**Overall:** met: the README, MVP.md and the spec agree on the bell in a top bar and the phone header.

## Task 2 — The table and the domain

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 8e4a30ac plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration 0041 creates `notifications` with the spec's columns | no | confirmed | `0041_notifications.ts:22-31`; `schema.ts` has `NotificationTable`; `index.ts` registers it |
| 2 | Foreign keys are table-level: user cascade, actor set null | no | confirmed | `addForeignKeyConstraint` ×2; the db test "has two keys to the user" passes |
| 3 | Indexes (user_id, read_at, created_at) and (created_at) exist | no | confirmed | both in the migration, plus an extra `(user_id, id)` for the list; MySQL guarded |
| 4 | Migration and repository db tests pass on SQLite, PostgreSQL, MySQL, MariaDB | no | confirmed | `pnpm test:db:<d> -- <the two files>` → 2 files / 13 tests on each |
| 5 | The repository has insert many, keyset list, capped unread count, mark read, mark all read, delete older than | no | confirmed | `kysely-notification-repository.ts`; db tests cover each |
| 6 | `notify` drops the actor, duplicates, disabled and erased users, writes one row per recipient in the caller's transaction, refuses oversized parameters | no | confirmed | `services/notify.ts`; four db tests pass on all four |
| 7 | The migrations guard test passes | no | confirmed | 3 files / 56 tests |
| 8 | Arrow functions only; no new lint warnings | no | confirmed | `biome check` → 42 warnings, none in these files |

**Overall:** met.

### Adversarial pass

Witnessed: 2026-10-31, by a fresh agent (adversarial). Commit: 8e4a30ac plus the uncommitted work. Machine: macOS (Darwin), Node v24. Probe kept in the scratchpad, not committed.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The actor, duplicates, disabled and erased users are never written | no | confirmed | `[c,c,c]` with actor `c` wrote 0; the rest covered by the db tests |
| 2 | A rolled-back transaction writes nothing | no | confirmed | 0 rows after a throw, on all four |
| 3 | Parameters over 2 KiB or not flat are refused, counted in bytes | no | confirmed | 2100 ASCII, 1100 "é" (about 2.2 KB), nested and array refused; exactly 2048 bytes accepted, 2049 refused |
| 4 | A very long recipient list works | no | confirmed | 5000 unknown ids plus one real user, and 1200 real users in one call: no bind-parameter error on any of the four |
| 5 | `markRead` touches only the caller's own unread rows | no | confirmed | another user's id, 5000 mixed ids, an empty list, a repeat, 5000 real rows |
| 6 | The unread count honours its cap | no | confirmed | cap 5 with 7 rows → 5; cap 100 → 7; cap 0 → 0 |
| 7 | Paging has no gaps or repeats, and a tampered cursor is harmless | no | confirmed | 7 rows with the same time in pages of 3; garbage, SQL text, numeric and another user's cursors |
| 8 | Unknown kinds are skipped; `deleteOlderThan` is strict; foreign keys and re-running the migration hold | no | confirmed | each tried on all four databases |
| 9 | `NaN` and `Infinity` are refused | no | partly | accepted and stored as `null`; fixed after the pass (see the re-check) |

**Overall:** not met until the re-check: a non-finite number turned into `null`.

### Adversarial re-check

Witnessed: 2026-10-31, by a fresh agent (adversarial re-check of claim 9 and what the diff touches). Commit: 8e4a30ac plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `encodeParams` throws on NaN, Infinity and -Infinity; finite numbers (0, -0, 1e21, 1.5, -3) still round-trip | no | confirmed | probe with tsx; guard at `notification.ts:102-104` |
| 2 | `notify` with a NaN parameter writes nothing | no | confirmed | `notify.ts:20` encodes the parameters before any read or write (by reading) |
| 3 | The model test and the repository db test pass on SQLite | no | confirmed | 4/4 and 10/10 |
| 4 | The 2 KiB byte limit and the flat-value check did not regress | no | confirmed | 1000 "é" encode, 1100 throw; an array value throws |

**Overall:** met.

