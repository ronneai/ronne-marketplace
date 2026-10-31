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

## Task 5 — The top bar, the bell, the popover and the count

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: b83f4f87 plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The header is one sticky top bar from `lg`, to the right of the sidebar and never over it; the logo and Menu are hidden from `lg`; the bell shows at every width; one bell, so one poller | no | confirmed | `AppShell.tsx`; `sidebar.e2e.ts` on Chromium measures the bar against the sidebar |
| 2 | The sidebar is above the top bar, so the fold button (half over the page) is visible (owner, 2026-10-31), and the check can fail | no | confirmed | `Sidebar.tsx` `z-40` over the header's `z-30`; mutation: removing `z-40` and rebuilding made `sidebar.e2e.ts` fail ("Expected: true, Received: false"); restored (md5 `b3b72ea1…` before and after), rebuilt, passes |
| 3 | The bell: "99+", none at zero, the count in its name, polling every minute only while visible, a refresh on a change of page but not on the first render, the latest loaded on open, mark all and mark one update the badge, a row without a link isn't a link, a row it can't word shows the fallback | no | confirmed | `vitest run src/features/notifications src/components/app-shell "src/app/(app)"` → 15 files, 132 tests |
| 4 | The routes are session only (401 signed out) and never cached; the actions touch only the person's own rows | no | confirmed | `routes.test.ts`; `notifications/actions` db test, 6 tests |
| 5 | `loadShell` returns `unread` and the layout passes it | no | confirmed | `shell.ts`, `layout.tsx` |
| 6 | A request for changes reaches the author's bell; the phone sweep passes; the bell's phone checks pass on all three device projects | no | confirmed | `review.e2e.ts` (Chromium); `mobile-sweep.mobile.e2e.ts --project phone` 15 passed; `notifications.mobile.e2e.ts` on phone, phone-webkit, tablet |
| 7 | Lint, typecheck and messages pass | no | confirmed | 42 existing warnings, no errors; `src/i18n` 381 tests |
| 8 | The panel is flat, with tokens only | no | confirmed | no `shadow`, hex or `rgb(` in the new files |

**Overall:** met. Noted: the geometry of "the bar not overlapping the sidebar" is checked in the e2e (the unit test checks order and classes); the action db tests were also run by the implementer on PostgreSQL, MySQL and MariaDB (6 tests each).

## Task 6 — The page /notifications

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 87aa9c6e plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The page lists the person's own notifications newest first on the server data table, 25 a page, state and kind filters in the URL (chips, a GET form), kinds grouped, unknown values dropped | no | confirmed | `list.ts`, `NotificationsPage.tsx`; the e2e saw 30 in all, 25 on page 1, `state=read` 5, `kind=rejected` 10 |
| 2 | The query never carries a person id; someone else's can't appear | no | confirmed | `page.test.tsx`; `countNotifications` takes the id from the session |
| 3 | Hidden rows are neither listed nor counted in the total | no | confirmed | `countVisible`; db tests (SQLite by the witness; the three servers by the implementer) |
| 4 | Mark selected and Mark all go through `serverAction`, touch only the person's own rows, and toast with how many | no | confirmed | `actions.ts`; e2e toasts "Marked 2 notifications as read." and "Marked 23 notifications as read." |
| 5 | The bell's badge follows after the page is shown again | no | confirmed | e2e: 25 → 23 → none |
| 6 | Opening an unread row marks it read, a read one not; a row with no subject is text | no | confirmed | `NotificationsSelection.test.tsx`; the e2e checks the links |
| 7 | The page is in the sweep and the sweep passes on phone, phone-webkit and tablet | no | confirmed | 15 passed on each |
| 8 | Tap targets on a phone are at least 44px | no | partly | the row checkbox was a bare 16px input, with no enlarged tap area |
| 9 | Component, db and e2e tests cover paging, the filters and marking | no | confirmed | 26 files, 424 tests; `notifications.e2e.ts` |
| 10 | Messages with parity, the glossary, Canadian French punctuation, no gendered address | no | confirmed | `src/i18n` |
| 11 | Lint and typecheck | no | confirmed | 42 existing warnings, no errors |
| 12 | The seed writes 30 rows through `notify` for one reader and disturbs nothing else | no | confirmed | `seed.ts`, `users.ts` |

**Overall:** not met: row 8. Also noted: no e2e covered "opening a link marks it read".

### Re-check

Witnessed: 2026-10-31, by a fresh agent (blind, re-check of row 8 and what the diff touches). Commit: 87aa9c6e plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The checkbox's label gives a 44px tap area on a coarse pointer, and a tap beside the box ticks it on phone, phone-webkit and tablet | no | confirmed | `touch-hit` in `globals.css`; `notifications.mobile.e2e.ts` 2 passed on each |
| 2 | The new e2e can fail | no | confirmed | removing `touch-hit`, rebuilding: "a tap near a row's checkbox ticks it" failed (`toBeChecked()`); restored (md5 identical), rebuilt, passes |
| 3 | The desktop e2e passes, and its click-marks-read step is meaningful | no | confirmed | `notifications.e2e.ts` passed; the bell goes 25 → 24 on the link click, only if `OpenLink` calls `markRead` |
| 4 | The unit tests pass and the checkbox keeps its name "Select: <sentence>"; lint | no | confirmed | 24 files, 175 tests; 42 existing warnings |

**Overall:** met.

## Task 7 — Retention, erasure and your data

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 42f9ce05 plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The purge deletes only notifications created strictly before now − 90 days (a fixed number, no setting), read or not, any user, in batches, oldest first | no | confirmed | `retention-purge.ts` `deleteOldNotifications`; `retention-purge.db.test.ts`: both states, two users, the exact cutoff kept, more than one batch |
| 2 | A dry run only counts; the purge is idempotent, runs last, and touches nothing else | no | confirmed | the "leaves the audit log alone" test |
| 3 | `notificationsDeleted` flows to the job log, the stored result, the log allowlist, the CLI output and the Privacy tab's last run; an old stored result still renders | no | confirmed | `retention-job.ts`, `log/events.ts`, `setup/purge.ts`, `LastRun.tsx` |
| 4 | Erase deletes only the person's own notifications, reports the count when above 0, and leaves those they caused for others | no | confirmed | `erase-user.db.test.ts` |
| 5 | The download has a `notifications` section of the person's own, oldest first, with the limit and `truncated`, no actor, no other person's name or email | no | confirmed | `user-data-export.db.test.ts` |
| 6 | The db tests pass on SQLite and the three servers | no | confirmed | 3 files, 43 tests on each |
| 7 | The messages have parity, follow the glossary, Canadian French punctuation, no gendered address; lint, typecheck | no | confirmed | `src/i18n`; 42 existing warnings |
| 8 | The 103 and 104 spec edits match the behaviour | no | can't check here | not read by the witness |

**Overall:** not met only for row 8.

### Adversarial pass

Witnessed: 2026-10-31, by a fresh agent (adversarial). Commit: 42f9ce05 plus the uncommitted work. Machine: macOS (Darwin), Node v24. Probe in the scratchpad, not committed.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The purge boundary is strict, on all four databases | no | confirmed | rows at the cutoff −1 ms, the cutoff, +1 ms: only the first deleted |
| 2 | A backlog of more than a batch with identical times is deleted fully, with no loop and no skipped row | no | confirmed | 2 × batch + 37 rows |
| 3 | A dry run writes nothing; a second run does nothing; the counts add up | no | confirmed | full-row snapshot before and after |
| 4 | Rows inserted during a run are neither deleted nor break it | no | confirmed | 300 old purged, 20 new kept, on all four |
| 5 | A wrong clock can't delete more than the other rules would | no | partly | no guard on any rule: a clock in 2099 deletes everything; the same for sessions and feedback, so equally safe, no safer |
| 6 | Erase deletes only the person's own rows, in the same transaction | no | confirmed | `kysely-erase-repository.ts`, `erase-user.ts` |
| 7 | Nothing in other people's notifications names the erased person | no | not met | `feedback.new` stored the sender's name in its parameters: erasing the sender deleted their feedback and left their name in root's notification |
| 8 | The download leaks no one else | no | confirmed | `user-data-export.ts`; shipped tests |

**Overall:** not met: row 7. Fixed: `feedback.new` stores only its kind; the sender is the notification's actor, read when shown, so an erased sender reads as the pseudonym.

### Adversarial re-check

Witnessed: 2026-10-31, by a fresh agent (adversarial re-check). Commit: 42f9ce05 plus the uncommitted work. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | An erased sender's name is nowhere in root's `feedback.new` notification, and its displayed actor is the pseudonym | no | confirmed | `erase-user.db.test.ts` ("leaves no name of the sender…") on SQLite, PostgreSQL, MySQL and MariaDB |
| 2 | A sender who is not erased shows their live name | no | confirmed | the messages use `{actor}` in en, pt and fr |
| 3 | No other kind stores a person's name or email in a notification's parameters | no | confirmed | every `notify` site and the e2e seed read: only names of things and codes |
| 4 | The `feedback.new` sentences render in all three languages, with and without an actor | no | confirmed | 24 files, 418 tests |
| 5 | The export still strips `sender` defensively; nothing regressed | no | confirmed | 10 files, 93 tests (SQLite); 7 files, 76 tests on each server |
| 6 | Lint and typecheck | no | confirmed | 42 existing warnings, no errors |

**Overall:** met. Noted: no clock guard in any purge rule, a wrong clock far in the future would delete everything older than its cutoff; left as the other rules have it.

### Re-check

Witnessed: 2026-10-31, by a fresh agent (blind, re-check of the one row it couldn't check). Commit: 42f9ce05 plus the staged work. Machine: macOS (Darwin).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | 103: the erased person's own notifications are deleted | no | confirmed | `deleteNotifications` (`where user_id`), called in the erase transaction; `erase-user.db.test.ts` |
| 2 | 103: `notificationsDeleted` is in the `user.erased` metadata only when above 0 | no | confirmed | `erase-user.ts`; the tests for a person with and without notifications |
| 3 | 103: notifications the person caused for others stay and read as the pseudonym | no | confirmed | the test checks root's row survives and `latestVisible` gives `erasedName` |
| 4 | 103: a notification's parameters never hold a person's name | no | confirmed | `kysely-feedback-repository.ts` stores `{ feedbackKind }`; every `params:` site read |
| 5 | 104: the `notifications` section is {id, kind, subjectType, subjectId, params, createdAt, readAt}, with no actor | no | confirmed | `user-data.ts`, `kysely-user-data-repository.ts` |
| 6 | 104: oldest first, the same row limit and `truncated` note | no | confirmed | repository and test |
| 7 | 104: `sender` dropped, other emails scrubbed, version unchanged (1) | no | confirmed | `user-data-export.ts`; `USER_DATA_VERSION` |
| 8 | The helper answers for erase and your data say the same | no | confirmed | `help.json` |

**Overall:** met.

## Task 8 — Documentation

Witnessed: 2026-10-31, by a fresh agent (blind). Commit: 12782511 plus the uncommitted work; ronne-web `docs/marketplace-139-notifications` at 82bbb9b. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | ronne-web has en/pt/fr `notifications.tsx` with exactly the sections what, reading, kept, not-email, registered in `index.ts`, `docsTopics` and a group | no | confirmed | `git show --stat HEAD`; `topics.ts`; `pnpm test` 193 passed, lint, typecheck |
| 2 | The app's `topics.ts` mirrors the website's, and `pnpm docs:links` passes | no | confirmed | "Compared 37 topics with the website's." |
| 3 | The helper `notifications` → `notifications#what` (a real section) is in the page's header, with en/pt/fr text, without invalid nesting | no | confirmed | `Help.tsx`, `NotificationsPage.tsx`; 443 tests |
| 4 | The kinds and who receives each, the bell, the popover, the page, 90 days, erase, the download, no email, match the code | no | partly | all matched except that the topic said the total "says at least" past 1,000, when the app shows "1,000+" |
| 5 | The privacy additions are accurate for 102, 103 and 104 | no | confirmed | `retention-purge.ts`, `erase-user.ts`, `user-data-export.ts` |
| 6 | The pt and fr copy matches the app's labels and the glossary, with Canadian French punctuation and no gendered address of the person | no | partly | gendered participles in pt and fr, a space before `;` and `?` in the fr |

**Overall:** not met: rows 4 and 6.

### Re-check

Witnessed: 2026-10-31, by a fresh agent (blind, re-check of the findings). Commit: 12782511 plus the uncommitted help.json; ronne-web 3fb3e9e. Machine: macOS (Darwin), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The total reads "1,000+" past 1,000 in all three languages, and no "at least" is left in the topic or the privacy additions | no | confirmed | `en/notifications.tsx:105`; pt "1.000+", fr "1 000+" |
| 2 | fr has no space before `;`, `?` or `!` in the website prose and the helper question | no | confirmed | grep; `fr/help.json:15` |
| 3 | pt and fr have no gendered address of the person, and no new gendered form | no | confirmed | both files read in full |
| 4 | The clumsy pt phrase is gone | no | confirmed | "não aparece no registro de auditoria" |
| 5 | The tests, `pnpm docs:links`, typecheck and lint pass | no | confirmed | 193 tests (ronne-web); "Compared 37 topics"; 443 tests; 42 existing warnings |

**Overall:** met. Not language-reviewed by the project's review agents (133) yet: the pt and fr copy was checked against the glossary and punctuation rules by the witness only.

