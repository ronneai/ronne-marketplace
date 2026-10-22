# 128 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).


## Task 1 — The flag

Witnessed: 2026-10-22 12:35 local, by a fresh agent (blind). Commit: ddf47f46 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration 0036 adds nullable `user.password_change_required_at`, is registered and typed | no | confirmed | `0036_password_change_required.ts`, `index.ts`, `schema.ts`; its test → 2 passed. |
| 2 | The migration guard test passes | no | confirmed | `migrations.guard.test.ts` → 37 passed. |
| 3 | Model and repository carry the flag (`passwordChangeRequiredAt`, `setPasswordChangeRequired`, `USER_COLUMNS`) | no | confirmed | Read back with `findUser` in the tests. |
| 4 | `createUser` flags by default; unchecked leaves null | no | confirmed | Two tests pass. |
| 5 | `resetPassword` takes `requireChange` (default true); an unchecked reset clears an earlier request | no | confirmed | Test passes; the action passes it on. |
| 6 | `changeRequired` is in the metadata of `user.created` and `user.password_reset` | no | confirmed | Tests assert true and false. |
| 7 | Root's own reset is not flagged | no | confirmed | `CannotModifySelfError` before any flag write; `root-account.ts` and the CLI reset never call it. |
| 8 | SSO and SCIM accounts are never flagged | no | confirmed | No flag call in `sso-sign-in.ts` / `scim-users.ts`. |
| 9 | Disabling and enabling keeps the flag | no | confirmed | Test passes. |
| 10 | Tests pass on SQLite, PostgreSQL, MySQL, MariaDB | no | confirmed | 2 files, 42 tests on each server. |

**Overall:** met.

### Adversarial pass

Witnessed: 2026-10-22 12:45 local, by a fresh agent (adversarial). Commit: ddf47f46 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Create flags by default and audits `changeRequired` | no | confirmed | Mutations (`=== true`, audit field dropped) → 2 tests fail each. |
| 2 | Reset always sets or clears the flag | no | confirmed | Mutations (no clear, action default false) → the reset test fails. |
| 3 | SCIM and SSO accounts are never flagged, through the real flows | no | partly | The test called the repository only. |
| 4 | Flag and audit are in one transaction; the audit holds no secret | no | partly | Writing the flag outside the transaction → 30 s timeouts; no rollback test. |
| 5 | The service-level reset default | no | partly | The action always passes the value; untested. |
| 6 | Setup root, `reset-root-password` never flag | no | confirmed | The only callers of `setPasswordChangeRequired` are create and reset. |
| 7 | The tests pass on the other servers | no | confirmed | 42 passed on each. |

**Overall:** not met: rows 3, 4, 5.

### Re-check (adversarial rows 3, 4, 5)

Witnessed: 2026-10-22 12:50 local, by a fresh agent (adversarial re-check). Commit: ddf47f46 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | SCIM and SSO accounts are never flagged, through the real flows | no | confirmed | `createUserWithoutPassword` mutated to set the flag → the SCIM create test and the SSO first sign-in test fail. |
| 4 | A failed audit write leaves the reset's flag as it was | no | confirmed | Flag written outside the transaction → the test fails. The create half only shows no account is left behind (the flag is a column of that row), so the test is named for that and claims no more. |
| 5 | The service-level reset default is covered | no | confirmed | Default flipped to false → "asks by default" fails. |
| 6 | The three files pass on the other servers | no | confirmed | 118 tests on PostgreSQL, MySQL and MariaDB. |

**Overall:** met (row 4 narrowed to what the test checks; only wording changed after the pass).

