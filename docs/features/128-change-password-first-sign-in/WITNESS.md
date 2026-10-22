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


## Task 4 — Changing the password

Witnessed: 2026-10-22 13:35 local, by a fresh agent (blind). Commit: 5b12ff35 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A held person sees the explanation on the change page, with only the form | no | confirmed | Account-security page test; the e2e sees "Choose your own password to continue". |
| 2 | The temporary password is refused as the new one, with no state change | no | confirmed | Refusal before the limiter and Better Auth; db test keeps the flag, no event, old password still works. |
| 3 | The flag is cleared only after Better Auth accepted the change | no | confirmed | Order in `session.ts`; "leaves the flag when the current password is wrong". |
| 4 | Other sessions end, this browser keeps one | no | confirmed | db test: other session null, one session row left, new password works. |
| 5 | Audit `user.password_changed` with `required: true`; an ordinary change has no `required` | no | confirmed | db tests. |
| 6 | The person returns to `next`; an off-site `returnTo` cannot redirect | no | confirmed | Component test; `sameSite`; the e2e lands on `/catalogue`. |
| 7 | A person also required to use two-factor lands on the two-factor page after the change | no | partly | Read in code; no test went from the change to enrolment. |
| 8 | Action and component tests cover each behaviour | no | confirmed | 156 tests on SQLite; 47 on each other server. |
| 9 | An end-to-end test signs in with a temporary password and changes it | no | confirmed | `user-admin.e2e.ts` on chromium → 1 passed, twice over (also a recreated user). |
| 10 | Messages in en, pt, fr, with matching keys | no | confirmed | i18n and messages tests → 165 passed. |

**Overall:** not met: row 7.

### Adversarial pass

Witnessed: 2026-10-22 13:31 local, by a fresh agent (adversarial). Commit: 5b12ff35 plus the uncommitted working tree. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The flag is cleared only after Better Auth accepted the new password | no | confirmed | Mutation (clear before the call) → a test fails. |
| 2 | The temporary password is refused as the new one | no | confirmed | Exact equality only, by design; mutation (refusal off) → a test fails. |
| 3 | Success clears the flag, ends other sessions, keeps this one, audits `required: true` | no | confirmed | db test; mutation (audit key changed) → fails. |
| 4 | `returnTo` is no open redirect or loop | no | confirmed | 25 hostile inputs through `safeNextPath`; mutation (raw value) → a test fails. |
| 5 | A person who is not flagged posting `returnTo` only sees "changed" | no | confirmed | `required: false` → no redirect. |
| 6 | Better Auth's own change-password endpoint does not clear the flag; acceptable | no | confirmed | By code; SPEC says what is not held. |
| 7 | The flagged page shows nothing of other panels | no | confirmed | By code; page test. |
| 8 | Audit metadata holds no secret; `required` only when flagged | no | confirmed | db tests. |
| 9 | Messages in step across the three languages | no | confirmed | 165 tests. |
| 10 | Tests pass on SQLite and the three servers | no | confirmed | 57 on each server. |

**Overall:** met. A database failure between the password change and the flag clearing leaves the person held to change it once more; the SPEC says so.

### Re-check (blind row 7)

Witnessed: 2026-10-22 13:35 local, by a fresh agent (blind, re-check). Commit: 5b12ff35 plus the uncommitted working tree. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | Once the password is changed, a person also required to use two-factor is no longer held on the change page and is held for enrolment next | no | confirmed | db test: a real change, then `{password: false, enrol: true}`; `holdPage` ordering test; mutations (flag never cleared, two-factor first) → each fails a test; 48 passed on each server. |

**Overall:** met.


## Task 5 — Root's controls

Witnessed: 2026-10-22 13:45 local, by a fresh agent (blind). Commit: 104dab94 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Reset password offers the checkbox, checked by default | no | confirmed | Mutation (default off) → the component test and the action test fail. |
| 2 | Create user offers the same checkbox, checked by default | no | partly | Through the shared `PasswordChoice`, but no test rendered the open form. |
| 3 | Unchecked is passed on and audited (`changeRequired` in `user.created` and `user.password_reset`) | no | confirmed | Action tests with and without the box; `summary.test.ts`. |
| 4 | No-JS form posting | no | partly | Not run; the dialogs need JavaScript to open. |
| 5 | The user page has a "New password" row with a button to set or clear it | no | confirmed | `user-page.test.tsx`. |
| 6 | The ask and stop dialogs carry the right value and say what changed | no | confirmed | `actions.test.tsx`. |
| 7 | Absence on one's own account | no | partly | By construction; only the Ask button was asserted. |
| 8 | The service refuses the own row | no | confirmed | `CannotModifySelfError` in the db test. |
| 9 | An account with no password is refused with a message | no | confirmed | `NoPasswordError` db test. |
| 10 | Set and clear leave the password, sessions and tokens; audited; a repeat records nothing | no | confirmed | db test on four databases. |
| 11 | Only root can do it | no | confirmed | `ForbiddenError` for a plain user. |
| 12 | Messages in en, pt, fr; the helper link target exists | no | confirmed | i18n tests → 165 passed; `docsHref("admin", "users")`. |

**Overall:** not met: rows 2, 4 and 7.

### Adversarial pass

Witnessed: 2026-10-22 13:50 local, by a fresh agent (adversarial). Commit: 104dab94 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The service sets or clears the flag, refuses a non-root, and audits `user.password_change_requested` | no | confirmed | Probe on four databases; a signed-out caller, a user, a moderator, a disabled root and a demoted root are refused. |
| 2 | Permission is enforced by the entry check and by the lock recheck, each with a test | no | partly | Dropping either alone failed no test. |
| 3 | The checkbox is on by default; unchecked means off | no | confirmed | Mutation → a test fails; tampered values count as unchecked. |
| 4 | Programmatic callers get the right default | no | confirmed | Service defaults to asking; SCIM and SSO never flag. |
| 5 | Ask and stop dialogs, and their values | no | confirmed | Tests. |
| 6 | An account that cannot clear the flag is refused (no password, erased, own row, unknown) | no | confirmed | Probes; mutations fail tests. |
| 7 | No self-lockout from flagging | no | partly | Read in code, not driven. |
| 8 | Audit: listed, summarised, no secret | no | confirmed | `AUDIT_ACTIONS`, `summary.test.ts`. |
| 9 | "Already so" returns `changed: false` with no audit | no | confirmed | Mutations fail 2 tests. |
| 10 | Concurrent toggles stay consistent | no | confirmed | Four at once on four databases. |
| 11 | i18n parity; no markup hazard | no | confirmed | 165 tests. |

**Overall:** not met: rows 2 and 7.

### Re-check (adversarial rows 2 and 7)

Witnessed: 2026-10-22 13:50 local, by a fresh agent (adversarial re-check). Commit: 104dab94 plus the uncommitted working tree. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2a | Dropping `lockAndRecheckActor` alone fails a test | no | confirmed | The demoted-or-disabled test fails. |
| 2b | Dropping `requirePermission` alone fails a test | no | partly | The mutant was equivalent without a test of the early exit (a test was added after this pass). |
| 2c | Dropping both fails the permission tests | no | confirmed | 3 tests fail. |
| 2d | The new tests pass on every dialect | no | confirmed | 51 passed on each server. |
| 7 | A flagged person, also required to use two-factor, can always reach `/account/password` | no | confirmed | `holdPage` returns on the change page before two-factor; `hold.test.ts`; the db test after the change. |

**Overall:** met, except row 2b (see the next re-check).

### Re-check (adversarial row 2b)

Witnessed: 2026-10-22 13:55 local, by a fresh agent (adversarial re-check, one row). Commit: 104dab94 plus the uncommitted working tree. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | "refuses a caller who isn't root before opening a transaction" passes | no | confirmed | 51 passed on SQLite, 52 on each other server. |
| 2 | It fails when the upfront `requirePermission` is dropped | no | confirmed | Scratch mutation → exactly that test fails. |
| 3 | Dropping only `lockAndRecheckActor` fails the demoted-or-disabled test and not this one, so each guard has its own test | no | confirmed | Scratch mutation. |

**Overall:** met.

### Re-check (blind rows 2, 4 and 7)

Witnessed: 2026-10-22 13:55 local, by a fresh agent (blind, re-check). Commit: 104dab94 plus the uncommitted working tree. Machine: macOS (Darwin), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | Create user offers the checkbox, checked by default (the open `CreateUserForm` is rendered) | no | confirmed | Removing `PasswordChoice` from the form, or `defaultChecked`, fails the test. |
| 4 | The dialogs need JavaScript to open, so the claim is the FormData shape: absent box is false, `on` is true | no | confirmed | Action tests cover create and reset both ways. |
| 7 | Root's own page has no Reset password, no Ask or Stop, no checkbox | no | confirmed | Mutating the `changeable` guard fails 2 tests; the service refuses the own row. |
| 9 | The user-admin db test passes on all servers | no | confirmed | 52 on each server, 51 on SQLite. |
| 10 | The upfront permission test fails without the early exit | no | confirmed | In-memory mutation → exactly that test. |

**Overall:** met.
