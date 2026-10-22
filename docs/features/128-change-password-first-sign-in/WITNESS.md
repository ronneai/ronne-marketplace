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


## Task 2 — The hold

Witnessed: 2026-10-22 12:55 local, by a fresh agent (blind). Commit: 55e7bfc7 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `passwordChangeHold(headers)` sits next to `twoFactorHold`, reads the flag from the session's user, stops early without a session cookie or an instance | no | confirmed | `password-change-hold.ts`; the db test on the session passes on four databases. |
| 2 | `holdPage` checks the password first, before two-factor | no | confirmed | Mutation (`if (false && …)`) → 2 hold tests fail. |
| 3 | Only the change page is open; other pages redirect to it with `next` kept, `/device` and its code too | no | confirmed | Tests for `/catalogue?q=a`, `/device?user_code=…`, no path, and the change page; `safeNextPath` leaves no open redirect or loop. |
| 4 | The guard test covers every page and fails on one without `holdPage` | no | confirmed | `holdPage` removed from `catalogue/page.tsx` in a scratch copy → the guard test fails; 31 pages. |
| 5 | The security page, exempt from `holdPage`, does the password hold itself | no | partly | Behaviour right; no test (since added). |
| 6 | Server actions respect the hold; the password hold wins over `whileHeld`; a stale tab cannot act | no | confirmed | 2 new tests in `two-factor-hold-actions.test.ts`. |
| 7 | Allowed while held: the change page, sign-out, the language switch | no | partly | Sign-in actions and notice dismissal are also allowed (needed, harmless); the other marks untested. |
| 8 | The data download respects the hold | no | partly | 403 `password_change_required`; no test (since added). |

**Overall:** not met: rows 5 and 8 (no tests).

### Adversarial pass

Witnessed: 2026-10-22 12:58 local, by a fresh agent (adversarial). Commit: 55e7bfc7 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Every page in `(app)` redirects a flagged person, keeping `next` | no | confirmed | Every page calls `holdPage`; `x-ronne-path` is overwritten by the proxy. |
| 2 | `next` is no open redirect or loop | no | confirmed | `//evil`, `\`, dot segments and encoded variants fall back to `/` or reach the real page once. |
| 3 | The security page redirects too | no | confirmed | Removing the line fails a test (after the added test). |
| 4 | Actions are refused except the allowed ones | no | confirmed | `whilePasswordHeld` on exactly the seven; every `use server` export is wrapped. |
| 5 | The data download refuses | no | confirmed | Removing the check fails a test (after the added test). |
| 6 | The password hold is before two-factor everywhere | no | confirmed | Tests on pages and actions. |
| 7 | Each removed check fails a test | no | partly | 4 of 5; the session-cookie pre-check was untested. |
| 8 | Cookie names cannot bypass the pre-check | no | confirmed | Both names contain `session_token`; no cookie cache. |
| 9 | Everything else reachable by a flagged session is held or harmless | no | partly | Not held: `/current-workspace`, `/api/auth/*` (the same as the two-factor hold), `/api/v1/*` (task 3). |

**Overall:** not met: rows 7 and 9 (a test; the spec to say what is not held).

### Re-check (adversarial rows 7 and 9, and the blind rows 5 and 8)

Witnessed: 2026-10-22 13:10 local, by a fresh agent (adversarial re-check). Commit: 55e7bfc7 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The cookie pre-check, the no-instance return and the flag wiring are tested | no | confirmed | Three mutations of `password-change-hold.ts` → each fails `password-change-hold.test.ts`. |
| 2 | The security page redirect is tested | no | confirmed | Line deleted → the source-order test fails (a structural check, not a rendered page). |
| 3 | The data route check is tested | no | confirmed | Check removed → the 128 test fails (`two_factor_required` instead). |
| 4 | SPEC says what is not held (`/api/auth/*`, `/current-workspace`) and it is true | no | confirmed | `/current-workspace` only sets a cookie after `requireUser`; `/api/auth` is a plain handler. |

**Overall:** met.


### Re-check (blind rows 5, 7 and 8)

Witnessed: 2026-10-22 13:10 local, by a fresh agent (blind, re-check). Commit: 55e7bfc7 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | The security page, exempt from `holdPage`, redirects a person who must change their password, before the two-factor logic | no | confirmed | Redirect line deleted in a scratch copy → `hold.test.ts` "keeps the security page…" fails. |
| 7 | The actions open to such a person are exactly the change, sign-out, the language form, the three sign-in actions and the notice; every other action is wrapped without the mark | no | confirmed | `grep` → 7 uses; adding the mark to another action, or removing it from `dismissNotice` → the new `server-action.test.ts` test fails; 30 action files use `serverAction(`. |
| 8 | The data download refuses with 403 `password_change_required` | no | confirmed | `user-data-api.db.test.ts` passes; check disabled in a scratch copy → it fails. |

**Overall:** met.


## Task 3 — The API

Witnessed: 2026-10-22 13:25 local, by a fresh agent (blind). Commit: 8986e0e9 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The bearer guard answers 403 `password_change_required` for a flagged account's token unless the route allows it; the 401 checks come first | no | confirmed | `require-token.ts`; guard replaced by `false && …` in a scratch copy → 3 tests fail. |
| 2 | `GET /api/v1/me` is the only route that gets through | no | confirmed | One `allowPasswordChange` caller (`getMe`); getMe set back → 2 fail; option added to `getWorkspaces` → 2 fail. |
| 3 | The flag is read through the token lookup; `Authenticated.passwordChangeRequired` is a required boolean | no | confirmed | `kysely-token-repository.ts`, `access-tokens.ts`; column not read → 3 fail; `tsc` clean. |
| 4 | API tests cover a flagged token on several endpoints and on `/me` | no | confirmed | `/me` 200; `/workspaces`, `DELETE /auth/token`, registry items, drafts scopes, usage and the feed 403 with the code; a bad token stays 401; clearing restores. |
| 5 | A test keeps `allowPasswordChange` in `getMe` alone | no | confirmed | `password-change-guard.test.ts` fails under the getMe and workspaces mutations. |
| 6 | The tests pass on SQLite, PostgreSQL, MySQL and MariaDB | no | confirmed | 3 db files, 32 tests on each server. |

**Overall:** met.

### Adversarial pass

Witnessed: 2026-10-22 13:25 local, by a fresh agent (adversarial re-check). Commit: 8986e0e9 plus the uncommitted working tree. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The ten `requireToken` sites with no flagged-token test cannot be reached unguarded: the guard is default-deny and only `getMe` passes the exemption | no | confirmed | 17 call sites, one with the option; no other code calls `authenticateToken` apart from a test harness. |
| 2 | The guard test fails if another route opens the exemption | no | confirmed | Option added to `getTarball`, `postDraft`, `postUsage` and `getPluginZip` one at a time → each fails the test. A different spelling (`!0`) passed the first version; the test now matches `allowPasswordChange\s*:`. |
| 3 | An `authenticate` that omits the field is a compile error | no | confirmed | A probe typed as `TokenGuardDeps` → TS2322. |
| 4 | A held token over HTTP: 403 on the routes tested, `/me` 200, restored once cleared, a bad token not hidden | no | confirmed | `api-v1.db.test.ts`; 26 tests on SQLite, 22 on each other server. |
| 5 | SPEC says `DELETE /auth/token` is refused and `POST /auth/token` still hands out a held token | no | confirmed | The SPEC text; the DELETE test. |

**Overall:** met.
