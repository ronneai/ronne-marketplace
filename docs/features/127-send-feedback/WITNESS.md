# 127 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).


## Task 1 — Table, model and repository

Witnessed: 2026-10-22 09:20 local, by a fresh agent (blind). Commit: 73d89fc1 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration `0035_feedback` creates `feedback` with the spec's columns, is registered and typed | no | confirmed | `0035_feedback.ts`, `index.ts`, `schema.ts` (`FeedbackTable`); "defaults to new, needs a sender" passes. |
| 2 | Deleting a user deletes their feedback (FK cascade); `handled_by` is set null and the row stays | no | confirmed | `foreignKeys` assertion and the delete-user test pass on SQLite, PostgreSQL, MySQL and MariaDB. |
| 3 | The migration is idempotent and the guard test passes | no | confirmed | `migrations.guard` → 36 passed; "is safe to run again" passes. |
| 4 | The model has the 4 kinds, 2 statuses, limits 4000, 200 and 10 an hour | no | confirmed | `models/feedback.ts:6-17`. |
| 5 | `pagePathOf` keeps only the path and drops what is not a path | no | confirmed | `feedback.test.ts`; mutation (query split removed, limit raised) → 3 tests failed. |
| 6 | Validation: kind required, only-spaces refused, over 4000 refused not cut, exactly 4000 accepted, characters not UTF-16 units, CRLF → `\n` | no | confirmed | `feedback.test.ts`; limit mutation 4000 → 99999 fails the over-the-limit test. |
| 7 | The repository sits behind `FeedbackRepository` with a Kysely implementation (insert, keyset page, filters, count, find, countNew, markHandled, remove) | no | confirmed | `kysely-feedback-repository.db.test.ts` 8 tests pass. |
| 8 | `*.db.test.ts` pass on SQLite and once on the other servers | no | confirmed | SQLite 111 tests; `pnpm test:db:postgres`, `:mysql`, `:mariadb` → 2 files, 11 tests each. |
| 9 | Erasing a user (103) deletes their feedback | no | partly | The FK cascade only fires on a hard delete; 103 keeps the user row. The erase delete is task 5's. |
| 10 | Anything that is not one of the app's routes is ignored | no | partly | `pagePathOf` checked the shape only: `/not-a-route` was kept. |

**Overall:** met for task 1's *Done when*; rows 9 and 10 partly (row 9 is task 5's).

### Re-check (rows 9 and 10)

Witnessed: 2026-10-22 09:30 local, by a fresh agent (re-check, rows 9 and 10 of the first pass, with the evidence of the re-check below). Commit: 73d89fc1 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9 | The `feedback` rows go with the user row (the FK cascade); the 103 erase keeps the user row, so its own delete is task 5's, and is not claimed here | yes | confirmed | The cascade test passes on four dialects; task 5's *Done when* names the erase test. |
| 10 | Anything that is not one of the app's routes is ignored | yes | confirmed | `/api/v1/x`, `/not-a-route`, `/Items/x` → null; `PAGE_ROOTS` equals the `app/(app)` page folders plus `feedback` (a test). |

**Overall:** met.

### Adversarial pass

Witnessed: 2026-10-22 09:20 local, by a fresh agent (adversarial). Commit: 73d89fc1 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Unit tests cover message validation (kind, whitespace-only, 4,000 boundary, astral) | no | confirmed | 9 unit tests pass; the limit counts code points. |
| 2 | The sanitiser drops query, fragment, `//host`, other sites, odd characters, `..`, over 200 | no | confirmed | Probes (`///x`, `/a/..`, `/\evil`, NUL, fullwidth, RTL override) → null; 200 kept, 201 dropped; mutation → 3 of 9 fail. |
| 3 | Migration and repository tests pass on SQLite and the other servers | no | confirmed | 11 passed on each of the four. |
| 4 | Foreign keys: sender cascades, handler set null | no | confirmed | Test passes on four dialects. |
| 5 | The migration is safe to rerun, including MySQL index creation | no | partly | Rerun test passes; a half-applied MySQL run was only read. |
| 6 | Search escapes `%`, `_`, `!`, no injection | no | confirmed | Probe on four dialects. |
| 7 | Bulk mark and delete touch only the selected ids; audit per row in one transaction, rolled back on failure | no | confirmed | Probes on four dialects. |
| 8 | Keyset paging is stable with ties and an insert mid-paging | no | confirmed | Probe on four dialects. |
| 9 | Any message that passes `checkFeedback` can be stored | no | not met | A NUL passed and the PostgreSQL insert threw. |
| 10 | Whitespace-only is refused | no | partly | A message of only U+200B was accepted. |

**Overall:** not met: row 9.

### Re-check (rows 9, 10 of the first pass and the adversarial rows 9, 10)

Witnessed: 2026-10-22 09:20 local, by a fresh agent (adversarial, re-check). Commit: 73d89fc1 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Control characters (NUL etc.) are stripped, so the PostgreSQL insert works | yes | confirmed | `checkFeedback` outputs inserted into a real PostgreSQL table; a raw NUL fails with `0x00`, so the strip is what makes it work; `feedback.test.ts` covers it. |
| 2 | A message of only invisible characters is refused | yes | confirmed | `"​​"`, `"\u0000"`, `"  \t\n "` → `message_required`; `"ok​x"` is kept. |
| 3 | `pagePathOf` keeps only paths whose first part is an app page, and drops the query | yes | confirmed | `/api/v1/x`, `/not-a-route`, `/Items/x`, `//items`, `/admin/../x` → null; `/items/@a/b?x=1` → `/items/@a/b`; `PAGE_ROOTS` equals the `app/(app)` page folders plus `feedback` (a test). |
| 4 | The repository test covers `%` and `_` search | yes | confirmed | "searches % and _ as themselves" passes on four dialects. |
| 5 | Existing tests pass on SQLite and once on the other servers | yes | confirmed | 3 files, 25 tests on SQLite; 22 files, 112 tests on each other server. |
| 6 | `pnpm typecheck` and `biome check` pass | yes | confirmed | Both clean. |

**Overall:** met. Rows 9 (erase delete, task 5) of the first pass stays task 5's. Noted, not blocking: a message of only U+3164, U+180E or U+034F counts as non-empty.

## Task 2 — Service and actions

Witnessed: 2026-10-22 09:30 local, by a fresh agent (blind). Commit: cd1ecf19 plus the uncommitted diff and untracked `feedback/actions` and `feedback/services`. Machine: macOS (Darwin 27.0.0).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `sendFeedback` is limited to 10 per person per hour through the existing limiter, and the tests cover the limit | no | confirmed | The test checks 10 pass, the 11th is refused, another user is unaffected, a refused form doesn't use up the limit, and the limit resets; disabling the limiter in a scratch copy made it fail. |
| 2 | Only root can read or act on feedback, checked on the server (list, count, find, countNew, mark handled, delete) | no | confirmed | "is root's alone" calls all six as a user and signed out → `ForbiddenError`, nothing changed or audited; removing the check from `deleteFeedback` made it fail. |
| 3 | A signed-in user can send, a signed-out person is refused, and sending isn't audited | no | confirmed | The "sending" tests pass; `audits()` is empty after a send. |
| 4 | Bulk mark and delete act only on the selected ids (duplicates and bad ids ignored, over 100 refused) | no | confirmed | Three sent, two marked (with a duplicate and a bad id), the third stays `new`; removing the `id in (done)` restriction made the test fail. |
| 5 | `feedback.handled` and `feedback.deleted` rows exist, one per affected id, target type `feedback`, no message text | no | confirmed | Tests assert the rows and that the serialized events don't contain the message; removing the delete audit made the test fail. |
| 6 | The audit catalogue has the two actions, the `feedback` group and target type, and the summaries render them | no | confirmed | `audit-event.ts`, `summary.ts` and their tests pass. |
| 7 | `countNewFeedback` returns the count of new messages for root | no | confirmed | Expected 2 after two sends and 1 after marking two of three. |
| 8 | The tests pass on the supported databases | no | confirmed | SQLite: 8 files, 69 tests; `pnpm test:db:postgres`, `:mysql`, `:mariadb` → 1 file, 9 tests each. |

**Overall:** met.

## Task 3 — The dialog and the page

Witnessed: 2026-10-22 09:35 local, by a fresh agent (blind). Commit: 30d8958a plus the uncommitted diff and untracked files. Machine: macOS (Darwin 27.0.0).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Component tests cover the validation messages (kind required, message required or only spaces, over 4,000 refused beside the field) | no | confirmed | `feedback.test.tsx` "says what is wrong beside the field" checks the three texts, `feedback-kind-error` and `aria-invalid`; the rate-limit case too. |
| 2 | Component tests cover the page path option (checked by default, path only, absent with no page) | no | confirmed | `feedback.test.tsx` (default checked, no option without a page, restored state), `feedbackHref` drops the query, `page.test.tsx` reduces `from` to a path. |
| 3 | Component tests cover the confirmation: thanks, Done in the dialog, a link home on the page | no | confirmed | `feedback.test.tsx` and `FeedbackForm.tsx`. |
| 4 | Held people are redirected first, and the guard test lists the page | no | confirmed | `page.tsx` calls `await holdPage()` first; `hold.test.ts` scans every `page.tsx` and passed with feedback included; `pages-coverage.test.ts` and `e2e/pages.ts` list `/feedback`. |
| 5 | Sidebar and Menu entry in the Tools group, for everyone signed in | no | confirmed | `nav.ts`; `AppShell.test.tsx` lists "Send feedback" last in Tools for user, moderator and root, and in the Menu sheet. |
| 6 | The sidebar opens the dialog; the Menu and no-JavaScript link goes to `/feedback?from=<path>`; the dialog is full-screen below `sm` | no | partly | No test covered clicking the sidebar link, sending, or focus returning. |
| 7 | The `/feedback` page is a plain form post that works without JavaScript | no | confirmed | `feedback.test.tsx` "is a plain form post". |
| 8 | Everything on screen is a message in three languages | no | confirmed | `feedback.json` ×3, `translations.test.tsx` and the i18n parity tests pass; `biome.json` scan folders added. |
| 9 | Checks on the touched areas pass | no | confirmed | 19 files, 237 tests passed; `tsc --noEmit` clean. |

**Overall:** not met: row 6.

### Re-check (row 6)

Witnessed: 2026-10-22 09:40 local, by a fresh agent (blind, re-check). Commit: 30d8958a plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | The sidebar link opens the dialog (opening, validation, sending, Done/Cancel, focus return) and the no-JavaScript page works, covered by an e2e test; the Menu link goes to `/feedback?from=<path>`; the hold guard test fails if the page loses its guard | yes | confirmed | `next build` then `playwright test e2e/feedback.e2e.ts --project chromium` → 2 passed. Removing the sidebar `onClick` in a scratch copy made test 1 fail at the dialog lookup. A 375×700 probe: the Menu link's href is `/feedback?from=%2Fcatalogue`, it lands on the page. Removing `await holdPage()` made `hold.test.ts` fail with `feedback/page.tsx` missing. |

**Overall:** met for the sidebar click, sending, focus return, the no-JavaScript page, the Menu link and the hold guard.

### Re-check (row 6, full screen)

Witnessed: 2026-10-22 09:45 local, by a fresh agent (blind, re-check). Commit: 30d8958a plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | The dialog is full-screen below `sm`, and a test covers it | yes | confirmed | `feedback.test.tsx` "the dialog on a small screen" expects `max-sm:h-dvh`, `max-sm:w-screen`, `max-sm:rounded-none`; stripping the `max-sm:` classes from the shared `Dialog.tsx` in a scratch copy made it fail. Checked from the class names, not a render at 375px (the sidebar, where the dialog opens, shows from `lg`; phones use the page). |

**Overall:** met.

## Task 4 — Admin › Feedback

Witnessed: 2026-10-22 09:50 local, by a fresh agent (blind). Commit: 45062be0 plus the uncommitted diff and untracked files. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Component tests for the inbox, the page, the shell, the nav and pages-coverage pass | no | confirmed | 8 files, 93 tests passed. |
| 2 | The `*.db.test.ts` for the query pass on SQLite | no | confirmed | 14 files, 194 tests passed, including paging, filters, search, `%` and `_`, sort, cursors, count of new, mark and delete only the rows asked for. |
| 3 | The same db tests pass on PostgreSQL, MySQL and MariaDB | no | confirmed | `pnpm test:db:postgres`, `:mysql`, `:mariadb` → 2 files, 18 tests each. |
| 4 | A non-root user gets not-found | no | confirmed | `page.tsx` calls `notFound()` unless `can(me, "feedback.manage")`; the page test; in a browser a signed-in user got HTTP 404. |
| 5 | A server data table with sender, kind, message, page, version, status and time; sort by time or kind; kind and status filters; search; paging, all in the URL | no | confirmed | `list.ts`, `FeedbackInbox.tsx`; tests for reading the URL, dropping unknown values and the sort headers; in a browser `?status=new` listed exactly the new row. |
| 6 | Each row opens a detail dialog | no | confirmed | Browser: Open showed From, Kind, Sent, Page, Version, Status, the message, Delete and Mark handled. |
| 7 | The message is plain text, never HTML | no | confirmed | Sent `First <b>bold</b> msg`; table and dialog showed the literal text, `table b` count 0. |
| 8 | Bulk Mark handled applies to the selected rows only | no | confirmed | Browser: 3 messages, 2 selected and marked; the third stayed New. |
| 9 | Delete asks first and deletes only the selected rows | no | partly | The confirm click and the refresh were not seen end to end. |
| 10 | A count of new feedback beside Admin › Feedback in the sidebar, for root | no | confirmed | `shell.ts` and its test; browser: the link read "Feedback 3", then "Feedback 1" after marking two. |
| 11 | The nav entry appears for root only | no | confirmed | `nav.ts` permission `feedback.manage`; `AppShell.test.tsx`. |
| 12 | Everything on screen is in messages in three languages | no | confirmed | Parity tests pass; no raw JSX strings found. |
| 13 | Typecheck and lint are clean on the touched folders | no | not met | `AppShell.test.tsx` failed the formatter. |

**Overall:** not met: rows 9 and 13.

### Re-check (rows 9 and 13)

Witnessed: 2026-10-22 10:05 local, by a fresh agent (blind re-check). Commit: 45062be0 plus the uncommitted diff. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9 | Delete asks first, Cancel leaves the rows, confirming deletes only the selected rows; Mark handled changes only the selected rows and lowers the sidebar count | yes | confirmed | `playwright test e2e/feedback.e2e.ts --project chromium` → 3 passed. In a scratch copy: the Delete confirm not calling `deleteFeedbackAction` made it fail at "1 message deleted."; Mark handled sending every id on the page made it fail at "2 messages marked handled.". |
| 13 | Lint is clean on the touched folders | yes | confirmed | `pnpm lint` → 44 warnings, no errors; none on this task's files. |

**Overall:** met.

## Task 5 — Privacy

Witnessed: 2026-10-22 10:10 local, by a fresh agent (blind). Commit: 64397b24 plus the uncommitted diff and the untracked `privacy.db.test.ts`. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | "Your data" (104) includes the person's feedback, as written, with status and dates | no | confirmed | `UserDataFeedback`, the repository's `feedback()` and the export section; `feedback/privacy` → 5 passed (exact shape, empty list, text stays text in JSON). |
| 2 | The export holds only that person's feedback | no | confirmed | Dropping the `user_id` filter in a scratch copy made "is theirs alone" fail. |
| 3 | Erasing deletes their feedback rows, keeps no message text under a pseudonym, and leaves others' | no | confirmed | `deleteFeedback` in the erase repository and service; replacing the delete with a select made 2 tests fail. |
| 4 | The erase audit carries counts only, never message text | no | confirmed | `user.erased` metadata has `feedbackDeleted: 2`; neither message appears in `audit_log`. |
| 5 | Erasing the handler keeps the message | no | confirmed | "keeps a message root handled…" passes. |
| 6 | Retention gets `feedbackDays`, default 365, validated, audited, kept when omitted | no | confirmed | `settings.db.test.ts` (21 passed): default, "30", invalid values rejected, a stored 99999 reading as 365, audit `from`/`to`. |
| 7 | The job purges handled feedback by `handled_at` and never new feedback | no | confirmed | `retention-purge.db.test.ts` → 12 passed: cutoff edge, handled recently after sending long ago kept, new kept, dry run, changed policy, batching. |
| 8 | The Privacy form, last-run line, audit summary and CLI output show the setting and count | no | confirmed | `RetentionForm.tsx`, `LastRun.tsx`, `summary.ts`, `purge.ts`; 118 unit tests passed. |
| 9 | The same on PostgreSQL, MySQL and MariaDB | no | confirmed | Five db files on each → all passed. |
| 10 | Typecheck and lint clean on the touched code | no | confirmed | `typecheck` clean; `biome check` 0 errors. |
| 11 | Root can delete any feedback row | no | partly | Task 4's action; not tested in this task's files. |
| 12 | The Privacy tab setting is labelled as the spec says | no | partly | The label said "Keep handled feedback for", the spec "Handled feedback kept for". |

**Overall:** not met: rows 11 and 12.

### Re-check (rows 11 and 12)

Witnessed: 2026-10-22 10:25 local, by a fresh agent (blind). Commit: 64397b24 plus the uncommitted diff. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 11 | Root can delete any feedback row, and only root can | yes | confirmed | `feedback/actions` and `feedback/privacy` db tests → 14 passed: "is root's alone" (member and signed-out refused, row stays, nothing audited), "deletes only the selected messages and audits each without its text". The e2e path was read, not run. |
| 12 | The Privacy tab label and the SPEC agree | yes | confirmed | `SPEC.md:57` and `RetentionForm.tsx:38` both say "Keep handled feedback for". |
| 13 | The filler assertion in `privacy.db.test.ts` is gone | yes | confirmed | No `newId` left. |
| 14 | The handler-erase test asserts the pointer | yes | confirmed | It reads `handled_by` after erasing the handler and expects it to hold (the erased user's row stays). |

**Overall:** met.

### Adversarial pass

Witnessed: 2026-10-22 10:05 local, by a fresh agent (adversarial). Commit: 64397b24 plus the uncommitted diff and the untracked `privacy.db.test.ts`. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's own tests pass on SQLite, PostgreSQL, MySQL and MariaDB | no | confirmed | 58 passed on SQLite; 66 on each other server. |
| 2 | The purge deletes only `status='handled'` rows with `handled_at` before the cutoff, by handling time | no | confirmed | A probe on three databases with 1 and 3650 days and rows at cutoff −1 ms, exactly, +1 ms: only the −1 ms row went; new feedback of 2020 kept; a handled row with null `handled_at` kept; mutations `<=` and `created_at` failed tests. |
| 3 | The `status='handled'` filter is covered by a test | no | partly | Removing the condition left the tests green. |
| 4 | Batches, dry run and the audit log | no | confirmed | `onBatch` `[PURGE_BATCH, PURGE_BATCH+3]`; dry run changes nothing; the audit log is identical before and after. |
| 5 | Erase deletes all of the person's feedback and no one else's; no message text in `user.erased` or the audit log | no | confirmed | Mutations (no delete, no `user_id` filter) failed 2 tests each; no logger call in the feedback domain. |
| 6 | A message root handled stays when the handler is erased | no | confirmed | The FK is SET NULL; the test passes. |
| 7 | An erased message cannot come back after a retention rerun | no | confirmed | Rows are hard-deleted; a second purge returned `feedbackDeleted: 0`. |
| 8 | The export holds exactly the person's feedback, as text, with `truncated` listing `feedback` | no | confirmed | A probe with `maxRows: 1` kept the oldest and listed `feedback`; the existing truncation test did not cover it. |
| 9 | Retention validation, audit, omitted value, out-of-range read, root only | no | confirmed | `settings.db.test.ts` on four databases. |
| 10 | An old audit event without `feedbackDays` still renders | no | confirmed | A probe event → "Changed the retention: IP addresses from 90 to 30 days". |
| 11 | The audit-log insert-only guard still passes | no | confirmed | 13 files, 229 passed. |

**Overall:** not met: row 3.

### Re-check (row 3)

Witnessed: 2026-10-22 10:20 local, by a fresh agent (adversarial). Commit: 64397b24 plus the uncommitted diff. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | The purge's `status='handled'` filter is covered by a test | yes | confirmed | Removing the condition in a scratch copy made "keeps a message that is not handled, even with an old handled_at" fail. |
| 3b | The feedback export truncation is covered by a test | yes | confirmed | Replacing `list("feedback", …)` with a plain slice made "cuts the feedback list past the limit too" fail. |
| 3c | The real tree's tests pass on every database | yes | confirmed | 57 passed on SQLite, PostgreSQL, MySQL and MariaDB. |
| 3d | The handler-pointer test checks something | yes | confirmed | It sets `handled_at` with `handled_by` and reads the pointer after the erase; it holds because the erased user's row stays. |
| 3e | Typecheck and Biome are clean | yes | confirmed | `typecheck` 7 of 7; `lint` no errors. |

**Overall:** met.

## Task 6 — Messages and phone

Witnessed: 2026-10-22 10:20 local, by a fresh agent (blind). Commit: 2091e822 plus the uncommitted diff and untracked files. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Parity: pt and fr have every key of en (feedback, shell, common) with the same placeholders | no | confirmed | 16 files, 196 tests passed; deleting `title` from pt and fr in a scratch copy failed the two parity tests. |
| 2 | Pt and fr messages are not left as English | no | confirmed | `feedback-untranslated.test.ts` passes, with an allowlist of shared words. |
| 3 | The raw-text lint rule covers the feedback folders | no | confirmed | `biome.json` lists the four folders; a raw `<span>` in each in a scratch copy failed lint at each. |
| 4 | The form's JSX has no text that is not a message | no | confirmed | Read `FeedbackForm.tsx`, `FeedbackDialog.tsx`, the page. |
| 5 | The message is the sender's own words, shown as written | no | partly | Only the form was read; the inbox's rendering was not. |
| 6 | The phone sweep passes on every project | no | confirmed | After one build: phone 15, phone-webkit 15, tablet 15 passed (three languages); `pages.ts` lists `/feedback` and `/admin/feedback`. |
| 7 | Send feedback is in the Menu sheet and opens the form on a phone | no | confirmed | `feedback.mobile.e2e.ts` passed on phone, phone-webkit and tablet. |
| 8 | With the message field focused the form's buttons stay on screen | no | partly | Emulated only; a real keyboard can't be shown here. |
| 9 | The desktop dialog and page flows still work | no | confirmed | `feedback.e2e.ts` → 3 passed. |

**Overall:** not met: rows 5 and 8.

### Re-check (rows 5 and 8)

Witnessed: 2026-10-22 10:35 local, by a fresh agent (blind). Commit: 2091e822 plus the uncommitted diff. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5a | The inbox table cell shows the message as written | yes | confirmed | "shows a message as it was written" and "never as HTML" pass (12 tests); `{row.message}` is a text child. |
| 5b | The detail dialog shows the whole message with its line breaks | yes | partly | The code keeps them; nothing ran it. |
| 8a | The spec's Phone line matches the code | yes | confirmed | `SPEC.md` against `Sidebar.tsx` and `Dialog.tsx`. |
| 8b | With the field focused the buttons stay on screen | yes | confirmed | `feedback.mobile.e2e.ts` on three projects. |
| 8c | A real on-screen keyboard keeps the bar in reach | yes | can't check here | Emulation does not shrink the visual viewport; moved to PLAN's notes as a check by hand. |

**Overall:** not met: 5b; 8c moved out of the task.

### Re-check (row 5b)

Witnessed: 2026-10-22 11:05 local, by a fresh agent (blind). Commit: 2091e822 plus the uncommitted diff. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5b | The detail dialog shows the whole message as written (line break, other-language text), and the test fails without the fix | yes | confirmed | Removing `whitespace-pre-wrap` from `InboxSelection.tsx`, rebuilding and running "marks two of four handled…" failed at `toHaveCSS("white-space","pre-wrap")` (received "normal"); restored (`cmp` identical), rebuilt, 3 passed; `git status` unchanged. |
| 8a | The spec's Phone line matches the code | yes | confirmed | As before. |
| 8b | With the field focused the buttons stay on screen | yes | confirmed | As before. |

**Overall:** met.

## Task 7 — End to end

Witnessed: 2026-10-22 11:30 local, by a fresh agent (blind). Commit: 5a60d5fe plus the uncommitted diff (`e2e/feedback.e2e.ts`, `e2e/user-admin.e2e.ts`, `e2e/users.ts`). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The desktop feedback tests pass: dialog, no-JavaScript page, root's inbox with count, bulk handled, delete confirm, detail, the hourly limit, erase | no | confirmed | `next build`, then `playwright test e2e/feedback.e2e.ts e2e/user-admin.e2e.ts --project chromium` → 6 passed. |
| 2 | Phone, phone-webkit and tablet pass `feedback.mobile` and `mobile-sweep` | no | confirmed | `playwright test e2e/feedback.mobile.e2e.ts e2e/mobile-sweep.mobile.e2e.ts --project <p>` → 16 passed on each. |
| 3 | The new users and the erased account broke no other chromium test | no | confirmed | `playwright test --project chromium` → 124 passed, 0 failed. |
| 4 | The limit test fails if the limit is wrong | no | confirmed | `FEEDBACK_PER_HOUR = 11`, rebuilt → the limit test failed. |
| 5 | The erase test fails if the feedback delete is removed | no | confirmed | `deleteFeedback` made to delete nothing, rebuilt → the erase test failed. |
| 6 | Mutation hygiene | no | confirmed | Both files restored from backups, `cmp` identical, `git status` showed only the three e2e files, rebuilt. |

Not run in full: the whole phone, phone-webkit and tablet suites (only the two feedback files).

**Overall:** met.

## Task 8 — Decision log and index

Witnessed: 2026-10-22 12:00 local, by a fresh agent (blind). Commit: ff5d2d1e plus the uncommitted diff to `docs/MVP/MVP.md` and `docs/features/127-send-feedback/PLAN.md`. Machine: macOS (Darwin).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The `Feedback` row is in §15 after "Getting started checklist", with the same column count as its neighbours | no | confirmed | `git diff docs/MVP/MVP.md` → added at line 999; `awk -F'|'` gives NF=5 for lines 998 and 999. |
| 2 | Kinds: Problem, Idea, Question, Praise | no | confirmed | `FEEDBACK_KINDS` in `models/feedback.ts`. |
| 3 | 4,000 characters, plain text | no | confirmed | `FEEDBACK_MESSAGE_MAX = 4000`, counted in characters, refused rather than cut. |
| 4 | The page is the path only, only a page of the app; `/feedback?from=<path>` | no | confirmed | `pagePathOf`, `href.ts`, `page.tsx`. |
| 5 | The sidebar's Tools group opens a dialog; a page on a phone and without JavaScript | no | confirmed | `nav.ts`, `Sidebar.tsx`, `MenuList.tsx`, `FeedbackForm`. Read, not run. |
| 6 | Root reads it in Admin › Feedback: search, filters, detail, bulk actions, the count of new | no | confirmed | `nav.ts`, `list.ts`, `FeedbackInbox.tsx`, `shell.ts`. |
| 7 | Table `feedback` with sender, kind, message, page, version and status | no | confirmed | Migration `0035_feedback.ts`. |
| 8 | 10 an hour per person, in memory | no | confirmed | `FEEDBACK_PER_HOUR`, `feedback-limiter.ts`. |
| 9 | Audited per row with the id only; sending isn't audited | no | confirmed | `eventOf` and `recordAudit` once per id; the send path has no audit call. |
| 10 | In the data download | no | confirmed | `kysely-user-data-repository.ts`, `user-data-export.ts`. |
| 11 | Deleted on erase, not pseudonymised | no | confirmed | `deleteFrom("feedback").where("user_id", …)` in the erase repository. |
| 12 | Retention `retention_feedback_days`, 365, from when handled, never new | no | confirmed | `retention-policy.ts`, `retention-purge.ts`. |
| 13 | Matrix rows: send for everyone; read, handle, delete for root | no | confirmed | `permissions.ts`; six columns like the neighbours. |
| 14 | Links resolve | no | confirmed | `SPEC.md` exists; the relative path matches the neighbours. |
| 15 | The index and nothing else in MVP.md contradict the row | no | partly | `docs/features/README.md` still said "specified". |
| 16 | `pnpm witness:check` passes | no | partly | It failed only for the missing record of this task. |

**Overall:** not met: rows 15 and 16.

### Re-check (rows 15 and 16)

Witnessed: 2026-10-22 12:10 local, by a fresh agent (blind). Commit: ff5d2d1e plus the uncommitted diff to `docs/MVP/MVP.md`, `PLAN.md` and `docs/features/README.md`. Machine: macOS (Darwin).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 15 | The index agrees with the MVP row and the PLAN, and nothing else in MVP.md contradicts the row | yes | confirmed | `README.md:342` shows 127 "in progress"; PLAN has tasks 1–8 ticked and 9 open; `MVP.md` has only the three added lines; no other mention contradicts. |
| 16 | `pnpm witness:check` fails only because this task's record is missing | yes | confirmed | The one failure was `task 8 is ticked but WITNESS.md has no pass for it`: the expected state before the record is pasted. |

**Overall:** met.
