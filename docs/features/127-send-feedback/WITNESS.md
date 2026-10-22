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
