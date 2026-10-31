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

## Task 3 — Writing them from the services

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 64b7726b plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Each of the 20 kinds (all but `update.available`, 140's) has a write site, called beside its audit event, in the same transaction, to the spec's recipients | no | confirmed | `reviews.ts`, `publish.ts`, `access-requests.ts`, `members.ts`, `scope-moves.ts`, `item-moves.ts`, `group-sync.ts`, `identity-providers.ts`, `kysely-feedback-repository.ts`; every call goes through a transaction-bound repository |
| 2 | A db test per kind checks recipients, kind, subject, and that the actor gets nothing | no | confirmed | 8 db files, 105 tests, on SQLite, PostgreSQL, MySQL and MariaDB |
| 3 | No free text (messages, reasons, comments, feedback text) in the parameters | no | confirmed | every call's params read; tests assert the review message and decline reasons are absent |
| 4 | `request.scope_move_waiting` goes to root and admins, as the spec says | no | partly | the spec said moderators too; the code follows 115 (the target's admins or root answer). The spec was corrected |
| 5 | "A rolled-back decision writes none" is tested per kind | no | partly | tests only covered refused actions, never a failure after the notification was written |

**Overall:** not met: rows 4 and 5.

### Adversarial pass

Witnessed: 2026-10-31, by a fresh agent (adversarial). Commit: 64b7726b plus the uncommitted work. Machine: macOS (Darwin), Node v24. Probes in the scratchpad, not committed.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A refused or failed change leaves no notification and no audit row | no | confirmed | every site is after its guards; a bulk release where one group's storage put failed wrote 1 notification and 1 audit row |
| 2 | A bulk release or approve writes one notification per submission | no | confirmed | 3 released → 3 rows; a repeat call → no more |
| 3 | Concurrent answers write one notification | no | confirmed | four racing answers to one join request → 1 fulfilled, 1 notification, on all four databases |
| 4 | The actor, disabled and erased people are never notified | no | confirmed | root's override, own comment and own release, an erased moderator, a disabled author |
| 5 | A private workspace leaks nothing | no | confirmed | an ordinary member got none of a join request's notifications |
| 6 | `global` at account creation, SSO or SCIM is silent; an open join request gets one notification, not two | no | confirmed | probes on all four |
| 7 | `request.*_waiting` once, to the right answerers | no | confirmed | a repeat request writes nothing more |
| 8 | Every covered audit action has its notification | no | confirmed | grep of every write site |

**Overall:** met: no bugs. Notes: a first SSO sign-in that maps someone to a `global` role other than `user` sends a "role changed" notice (left as is); erasing a user doesn't delete notifications yet (task 7); `scope_move_waiting` for `global` and personal targets had no test (added).

### Re-check

Witnessed: 2026-10-31, by a fresh agent (blind, re-check of rows 4 and 5, and the claims the diff touches). Commit: 64b7726b plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A rollback test exists for each write path, throwing after `notify` wrote (`throw-after-notify.ts`), checking notifications, audit and state, with an unarmed control | no | confirmed | four `*.rollback.db.test.ts` files; mutation: moving the feedback `notify` out of its transaction made `feedback-notifications.rollback` fail ("expected 1 to be +0"); file restored, sha and diff unchanged |
| 2 | The spec matches the code for the three `*_waiting` kinds, and `scope_move_waiting` is tested for shared, global and personal targets | no | confirmed | SPEC.md; `notifications-written.db.test.ts` |
| 3 | Root's override of its own submission rolls back (status, thread, audit, notifications), and its unarmed control goes through | no | confirmed | the added test; mutation: the armed wrapper throwing before `notify` made it fail (3 failed, 5 passed), restored (md5 before and after `a2facffa…`), 8 of 8 pass |
| 4 | Every new and changed db test passes on all three servers | no | confirmed | 13 files, 137 tests on PostgreSQL, MySQL and MariaDB |
| 5 | No stray probe files | no | confirmed | `git status` |

**Overall:** met. Not covered, noted: the SCIM entry point (`scim-groups.ts:69`) has no test that checks notifications; it shares `applyGroups` with the SSO sign-in path, which is tested, including its rollback.

## Task 4 — Reading them, with the visibility check

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 249044f7 plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Db tests cover a person removed from a private workspace (not shown, not counted), a deleted subject (no link) and an erased actor, on all four databases | no | confirmed | `read.db.test.ts` 11/11 on SQLite, PostgreSQL, MySQL and MariaDB |
| 2 | Every kind has a sentence in en, pt and fr with matching placeholders | no | confirmed | `vitest run src/i18n src/features/notifications` → 21 files, 386 tests |
| 3 | The glossary and typography are followed (neutral address, Canadian punctuation) | no | confirmed | pt and fr files read |
| 4 | The visibility rules match the spec | no | confirmed | `visibility.ts` |
| 5 | Every subject type written by task 3 is resolved | no | confirmed | six subject types, six branches in `read.ts` |
| 6 | Hidden rows are not counted; the count caps at 100 | no | confirmed | `countVisibleUnread` and its tests |
| 7 | Queries are batched, one per subject type | no | confirmed | `resolveSubjects` (by reading) |
| 8 | The actor's name is read at display time | no | confirmed | erased → pseudonym, deleted → null |
| 9 | `pnpm lint` and `pnpm typecheck` | no | confirmed | 42 existing warnings, no errors |

**Overall:** met.

### Adversarial pass

Witnessed: 2026-10-31, by a fresh agent (adversarial). Commit: 249044f7 plus the uncommitted work. Machine: macOS (Darwin), Node v24. Probes in the scratchpad, not committed.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A hidden notification stays hidden when its subject is deleted | no | not met | deleting an item (its move cascades away) or a submission made a hidden notification visible and counted: `shownTo` showed any notification with no subject, without a visibility check |
| 2 | The count agrees with the list | no | not met | a row with an unknown subject type was counted but not listed |
| 3 | The count and the popover are exact however many rows are hidden | no | partly | the count looks at the newest 100 unread rows, the popover at five batches: documented as accepted limits in the spec |
| 4 | A sentence with a missing parameter doesn't break the page | no | partly | the translator returns the message path, shown as raw text: guarded by `renderSentence` |

**Overall:** not met: rows 1 and 2.

### Adversarial re-check

Witnessed: 2026-10-31, by a fresh agent (adversarial re-check). Commit: 249044f7 plus the uncommitted work. Machine: macOS (Darwin), Node v22/24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A hidden notification stays hidden and uncounted after its submission, item move, scope move or join request is deleted | no | confirmed | five kinds against a private workspace the reader is not in: list `[]` and count 0 before and after, on all four databases |
| 2 | `notify` stores at most two workspace ids, and null when the subject can't be resolved; every call site inserts the subject before notifying | no | confirmed | `notify.ts`; the sites in access requests, moves, reviews, publish, members and feedback read (the identity sites notify about a workspace that exists) |
| 3 | A member of the private workspace still sees a deleted subject's notification, without a link, and it is counted | no | confirmed | 5 rows, count 5 |
| 4 | Tampered, garbage or huge `workspace_ids` can't expose a hidden row or crash | no | confirmed | nine values tried, including an 800 KB array |
| 5 | The count and the list agree for an unknown kind, an unknown subject type and bad parameters | no | confirmed | list 2, `countVisibleUnread` 2, `countUnread` 2, on four databases |
| 6 | The spec documents the accepted limits | no | confirmed | SPEC.md "Who may still see it" |
| 7 | `renderSentence` never returns a key or path | no | confirmed | 20 kinds plus a bogus one × 3 languages × 3 parameter sets, next-intl's real translator |
| 8 | The suites pass | no | confirmed | notifications, 0041 and 0042 on SQLite and the three servers; 21 files and 389 tests in `features/notifications` and `i18n` |

**Overall:** met. Noted, not blocking: a private workspace deleted later leaves its old notifications visible, without links, with the names they carry; rows with no stored workspaces (written before 0042) keep showing once their subject is deleted.

