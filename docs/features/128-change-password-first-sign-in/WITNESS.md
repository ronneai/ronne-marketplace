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


## Task 6 — Messages and phone

Witnessed: 2026-10-22 14:10 local, by a fresh agent (blind). Commit: 965d0232 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The held page's text is messages in en, pt and fr | no | confirmed | `account.password.required.*`, `errors.same_password` in all three. |
| 2 | Root's controls (checkbox, hint, row, titles, bodies, results) are messages | no | confirmed | 12 `admin.passwordChange` keys in all three. |
| 3 | The helper `password-change` has its words in the three languages | no | confirmed | `help.json`. |
| 4 | `NoPasswordError` has a message in three languages, and the admin dialogs use `errorText` | no | confirmed | `errors.json`, `errors.test.ts`. |
| 5 | Parity and scan tests pass | no | confirmed | 166 tests. |
| 6 | Lint, with the raw-text rule, passes | no | confirmed | `pnpm lint` exit 0. |
| 7 | No new raw English string in the feature's components | no | partly | The audit-log lines are English, as the rest of that file. |
| 8 | The pt and fr texts read correctly | no | confirmed | Read; typographic apostrophes, no space before "?". |
| 9 | The phone sweep passes on every project | no | confirmed | 16 passed on phone, phone-webkit and tablet. |
| 10 | The held page is measured on a phone | no | partly | English only. |

**Overall:** not met: rows 7 and 10.

### Adversarial pass

Witnessed: 2026-10-22 14:10 local, by a fresh agent (adversarial). Commit: 965d0232 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Parity catches a missing key or a changed placeholder in pt or fr | no | confirmed | Three mutations, each fails. |
| 2 | In pt and fr the held page, the dialogs, the row and the helper show no English or raw key | no | partly | The action results were tested in English only. |
| 3 | Every new string is a message | no | partly | The audit lines and the API texts stay English. |
| 4 | API and audit text stay English by design | no | confirmed | `docs/knowledge/i18n.md`. |
| 5 | The pt and fr wording follows the glossary | no | confirmed | Read. |
| 6 | Lint and the error tests pass | no | confirmed | Mutation: the key removed → 2 tests fail. |
| 7 | The checkbox row fits and is a touch target | no | partly | 16px target, and the helper inside the label. |

**Overall:** not met: rows 2, 3 and 7.

### Re-check (blind rows 7 and 10)

Witnessed: 2026-10-22 14:15 local, by a fresh agent (blind, re-check). Commit: 965d0232 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | Only the audit-log lines and the API message stay English, consistent with the rest of the app and stated in the SPEC | no | confirmed | `admin-audit` is not in the lint override list; its summaries are English literals; SPEC Behaviour says so. |
| 10 | The held page has no overflow and the right title in fr and pt on phone, phone-webkit and tablet | no | confirmed | `must-change.mobile.e2e.ts` and the sweep → 16 passed on each project. |

**Overall:** met.

### Re-check (adversarial rows 2, 3 and 7)

Witnessed: 2026-10-22 14:12 local, by a fresh agent (adversarial re-check). Commit: 965d0232 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The label holds only the input and its text, with the helper beside it | no | confirmed | A French render matched. |
| 2 | The row is a touch target on coarse pointers and the input does not shrink | no | confirmed | Same pattern as the `Checkbox` in `Field.tsx`. |
| 3 | The action results follow the request language | no | confirmed | pt and fr test; a wrong key in the pt file fails it. |
| 4 | Audit lines and API text stay English by design, and the SPEC says so | no | confirmed | `i18n.md`, SPEC Behaviour. |
| 5 | The long French label fits at phone width | no | can't check here | No browser in that pass (checked in the next one). |

**Overall:** not met: row 5.

### Re-check (adversarial rows 5, the e2e)

Witnessed: 2026-10-22 14:30 local, by a fresh agent (adversarial re-check). Commit: 965d0232 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The Create user dialog's password box fits and is a touch target in English and French (`password-change-root.mobile.e2e.ts`) | no | confirmed | 1 passed on each device project; measured rows 44px at 393, 412 and 768 wide, 60px when the French text wraps. |
| 2 | The test catches a row without `pointer-coarse:min-h-11`, on all three projects | no | confirmed | Mutated build: fails on each with the row at 40 or 20px. |
| 3 | The test catches a label that cannot shrink, at phone widths; a label wider than the tablet fails there too | no | confirmed | `w-[420px] shrink-0` fails on phone and phone-webkit and passes on tablet (it fits); `w-[900px] shrink-0` fails on all three. |
| 4 | The unmutated code passes everywhere | no | confirmed | Rebuilt copy → 1 passed on each. |

**Overall:** met.


## Task 7 — End to end

Witnessed: 2026-10-22 14:45 local, by a fresh agent (blind). Commit: 6f151d16 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Root creates a user with the box on; the user is held, changes the password and lands on the page asked for (Home when none) | no | confirmed | `user-admin.e2e.ts` on chromium → passed; `must-change.mobile.e2e.ts` ends at `/` on phone, phone-webkit and tablet. |
| 2 | The device flow after a change: the code survives the hold and the rmk login is approved | no | confirmed | `password-change.e2e.ts` test 1 → passed; the API gave 201, 200 on `/me`, 403 on `/workspaces`, then 200 once changed. |
| 3 | With two-factor required, the order is password then two-factor | no | confirmed | Test 2 → passed; the policy is put back in a `finally`. |
| 4 | Root asks and stops asking from the user page, and an account created with the box unchecked is not held | no | confirmed | Test 3 → passed. |
| 5 | The tests pass on every project | no | confirmed | The full suite: 275 passed and 4 failed (the SCIM e2e on each project, since a reset now asks for a new password); `scim.ts` unchecks the box and the SCIM e2e passes on all four. |
| 6 | The seed users are used by one test each, and secrets are recorded for the log scan | no | confirmed | `grep`; the suite's log scan passed. |
| 7 | No other e2e signs in as an admin-created or admin-reset user | no | confirmed | `grep` over `e2e/`. |

**Overall:** met.

### Adversarial pass

Witnessed: 2026-10-22 14:57 local, by a fresh agent (adversarial). Commit: 6f151d16 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The password hold not redirecting fails the tests | no | confirmed | Scratch build → 3 desktop tests, `user-admin` and the phone test fail. |
| 2 | Dropping `next` from the redirect fails the tests | no | confirmed | The desktop tests fail (the phone test does not assert `next`). |
| 3 | `changePassword` not clearing the flag fails the tests | no | confirmed | Tests 1 and 2, `user-admin` and the phone test fail. |
| 4 | The password hold checked after two-factor fails the tests | no | confirmed | Test 2 fails with a redirect loop. |
| 5 | `requireToken` not refusing a held token fails the test | no | confirmed | Test 1 fails at the 403. |
| 6 | The SCIM change is needed | no | confirmed | Without the uncheck the SCIM e2e fails. |
| 7 | A failure of the two-factor test leaves the policy on | no | partly | Restored in a `finally`; no reset at the start. |
| 8 | The users are not shared with other tests | no | confirmed | `grep`. |
| 9 | The assertions are not vacuous | no | partly | The audit check for the unchecked account matched either wording. |
| 10 | Creation always asking for a change is caught by the unchecked-account test | no | confirmed | Scratch mutation → test 3 fails. |
| 11 | The Create user box not checked by default is caught | no | confirmed | Mutation → the phone test fails. |

**Overall:** met, with rows 7 and 9 `partly` (see the re-check).

### Re-check (adversarial rows 7 and 9)

Witnessed: 2026-10-22 15:10 local, by a fresh agent (adversarial re-check). Commit: 6f151d16 plus the uncommitted working tree. Machine: macOS (Darwin 27), Node 24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | The two-factor test starts from a known policy and restores it | no | confirmed | `setRequirement("optional")` first, then `"everyone"`, and `"optional"` in a `finally`; the helper deletes the row and inserts a fresh one. |
| 9 | The "left alone" audit check is not vacuous | no | confirmed | The audit line is one element; a probe with the box checked shows "…as user, asking for a new password at their first sign-in", so the negated assertion fails there. |
| 10 | `password-change.e2e.ts` passes on chromium | no | confirmed | 3 passed. |

**Overall:** met.


## Task 8 — Decision log and index

Witnessed: 2026-10-22 15:20 local, by a fresh agent (blind). Commit: a9a8bfb9 plus the uncommitted working tree. Machine: macOS (Darwin 27).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The row "Password change at first sign-in" is in the §15 decision log, in the table's format | no | confirmed | One added line between the Feedback and Personal data rows; 4 pipes on it and its neighbours. |
| 2 | The checkbox default, the unchecking audited, the column and its clearing, the hold on pages and the data download, the API 403 but for `/me`, password before two-factor, "must differ", other sessions ended, the audit event | no | confirmed | Read against `PasswordChoice.tsx`, `user-admin.ts`, `session.ts`, `hold.ts`, `user-data-api.ts`, `require-token.ts`, `api-v1.ts`. |
| 3 | The user page's Ask and Stop buttons are named as in the app | no | partly | The row said "Stop asking"; the label is "Stop asking for a new password". |
| 4 | Every server action is held but the ones listed | no | partly | The closing of a notice was left out. |
| 5 | Accounts with no password, the setup's root and `reset-root-password` are never asked | no | confirmed | `setPasswordChangeRequired` refuses a person with no password; the other two never set the flag. |
| 6 | Nothing else in MVP.md is made false | no | confirmed | The Auth, Admin, sign-in and permission rows are still true. |

**Overall:** not met: rows 3 and 4 (wording only).

### Re-check (rows 3 and 4)

Witnessed: 2026-10-22 15:25 local, by a fresh agent (blind, re-check). Commit: a9a8bfb9 plus the uncommitted working tree. Machine: macOS (Darwin 27).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | The row names the button "Stop asking for a new password", the real label | no | confirmed | `MVP.md` and `admin.json` `clearTitle`. |
| 4 | The actions open during the hold in the row are the seven the code marks (sign-in covers the password, two-factor and provider forms) | no | confirmed | `grep whilePasswordHeld`; `server-action.test.ts` pins the list. |
| – | The row still has 4 pipes and no other sentence is wrong | no | confirmed | Pipe count; read against the messages and code. |

**Overall:** met.
