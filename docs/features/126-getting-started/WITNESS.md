# 126 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).


## Task 1 — The state table

Witnessed: 2026-10-21 22:20 local, by a fresh agent (blind). Commit: bb596efe plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration `0034_user_onboarding` creates `user_onboarding` (`user_id` PK, `hidden_at`, `install_confirmed_at`, `completed_seen_at`, `updated_at`), is registered, and is safe to rerun | no | confirmed | `0034_user_onboarding.ts`, `index.ts` and `schema.ts` (`UserOnboardingTable`) read; "is safe to run again" passes on SQLite, PostgreSQL, MySQL and MariaDB. |
| 2 | The foreign key to `user` cascades on delete | no | confirmed | "has one key, to the user, that cascades" and "goes with them" pass on all four databases. |
| 3 | No row gives defaults; writes don't touch other users or columns; the first time is kept for a confirmed install and a seen "You're set up"; concurrent writes don't undo each other | no | confirmed | `kysely-onboarding-repository.db.test.ts` → 8 tests passed; the implementation (an upsert plus an "is null" update) read. |
| 4 | "Your data" (104) includes the row, and null when there is none | no | confirmed | `privacy.db.test.ts` "the data file" (2 tests) through `exportUserData`: null, filled, and not another person's. |
| 5 | Erase (103) removes the row and leaves others' | no | confirmed | Removing `repo.deleteOnboarding` from `erase-user.ts` made "deletes the person's row and leaves everyone else's" fail (1 failed, 3 passed). |
| 6 | `*.db.test.ts` pass on SQLite and, once, on the other servers | no | confirmed | SQLite: 35 files, 402 tests passed; `pnpm test:db:postgres`, `:mysql`, `:mariadb` on onboarding and 0034 → 3 files, 15 tests each; typecheck clean. |
| 7 | The data-export and erase tests are extended | no | partly | No existing export or erase test file was modified: the coverage was in a new file. |
| 8 | MVP.md's table list and the 103 and 104 SPECs are updated | no | confirmed | `git diff` shows one line in each. |

**Overall:** not met: row 7.

### Re-check (row 7)

Witnessed: 2026-10-21 22:35 local, by a fresh agent (blind re-check). Commit: bb596efe plus the uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | The data-export and erase tests are extended | yes | confirmed | `erase-user.db.test.ts` and `user-data-export.db.test.ts` now seed a `user_onboarding` row; the erase list has `user_onboarding`, the export asserts `data.onboarding`. SQLite and PostgreSQL → 20 of 20 passed. Removing `deleteOnboarding` failed the existing erase test; removing `onboarding,` from the export failed the existing export test; both restored, `cmp` matched. |

**Overall:** met.
