# 123 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — The page's data

Witnessed: 2026-10-20 09:51 EDT, by a fresh agent (blind). Commit: 05e80d0e plus the uncommitted working-tree diff (8 identity files; no untracked files). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A read of one user for root returns the account, workspaces with roles, two-factor, SCIM state, last sign-in, and session and token counts | no | confirmed | `actions/user-admin.ts` `adminGetUser` → `service.getUser`, built on `findUserDetail` (`withRolesAndTwoFactor`) and on `countSessions` and `countActiveAccessTokens`, the counts `adminDisableImpact` uses; SCIM state from `scimAccountStates`, as the list does. Test "gives root the account, its roles, two-factor and what signing out would end" passes (workspaces `[{global, moderator}]`, twoFactor false, sessions 1, tokens 2); the scim-settings test checks managed, unmanaged and absent SCIM |
| 2 | `users.view` is checked, and a non-root is refused | no | confirmed | `getUser` calls `requirePermission(actor.user,"users.view")` first; `adminGetUser` is in the `permissions` loop of `user-admin.db.test.ts`, which expects `ForbiddenError`; passed on SQLite, PostgreSQL, MySQL and MariaDB |
| 3 | An unknown id gives not-found | no | confirmed | `getUser` throws `UserNotFoundError` when `findUserDetail` returns null; test "refuses an unknown id" passes; `findUserDetail("nobody")` returns null. The action never returns null: the page turns the error into a 404 |
| 4 | An erased account shows no last sign-in and has nothing to end | no | confirmed | `withLastSignIn` skips erased ids; sessions and tokens are 0; the test passes, and the list row is null even with a sign-in event seeded. Mutation in a scratch copy (erased exclusion removed) → that test FAILS (1 failed, 33 passed) |
| 5 | A SCIM-managed account's state is shown | no | confirmed | the scim-settings test checks `adminGetUser` for the managed user (`Acme SSO`, `managed true`), the unmanaged one and root (`scim` undefined); passes on all four databases |
| 6 | `lastSignIns(ids)` returns the latest `auth.signed_in` per actor in one grouped query; none is absent; an empty input is an empty map; other events don't count | no | confirmed | one query: `max(created_at)`, `where action='auth.signed_in' and actor_id in (…)`, `groupBy actor_id`; repository tests cover the latest of several (out of order), none, other actions, the ids asked and the empty list. Mutation (the action filter deleted) → 2 tests FAIL |
| 7 | Password, identity provider and second-step sign-ins all count; `rmk login --web` and tokens do not | no | partly | the code writes `auth.signed_in` at `session.ts:147`, `sso.ts:319` and `two-factor.ts:398`; the tests seed the event for the provider and second step, and only the password path is driven for real. Nothing would fail if a provider or two-factor sign-in stopped writing it |
| 8 | The retention purge keeps the time | no | confirmed | the test nulls `ip_address` on the events and the time stays; the purge itself wasn't run |
| 9 | The list's times come from one query for its page of rows | no | confirmed | `listUsers` calls `withLastSignIn(page.rows)`, one `repo.lastSignIns` call; read from the code, queries not counted at runtime |
| 10 | The `pageUsers` refactor changed no list behaviour | no | confirmed | the diff moves the two queries into `withRolesAndTwoFactor` unchanged; SQLite: `two-factor-reset` 13/13, `erased-user` 11/11, `erase-user` 10/10 |
| 11 | Database tests pass on all three servers | no | confirmed | one file per run: `kysely-identity-repository` 6/6, `user-admin` 35/35, `scim-settings` 4/4 on PostgreSQL, MySQL and MariaDB; SQLite 6/6, 34 passed and 1 skipped, 4/4 |

**Overall:** not met. Row 7 is `partly`: no test drives a real provider or second-step sign-in to the last sign-in read. Bugs found: none in the code.

### Re-check 1 — row 7 (the sign-in kinds)

Witnessed: 2026-10-20 09:55 EDT, by a fresh agent (re-check of one claim, with mutations in a scratch copy). Commit: 05e80d0e plus the uncommitted diff (since the last pass, only `sso.db.test.ts` and `two-factor-sign-in.db.test.ts`). Machine: macOS (Darwin), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7a | The two new assertions sit in tests that drive real flows and pass on SQLite, PostgreSQL, MySQL and MariaDB | no | confirmed | `sso.db.test.ts` 40/40 and `two-factor-sign-in.db.test.ts` 24/24 on each, one file per run; the SSO test signs in through the fake OIDC server, the two-factor test completes a real TOTP second step |
| 7b | A provider sign-in counts, and a test fails if `actions/sso.ts` stops writing `auth.signed_in` | no | confirmed | in a scratch copy the action at `sso.ts:319` renamed → 2 old tests fail; with the old assertion removed, the new one fails alone (`expected undefined to be an instance of Date`, `sso.db.test.ts:172`) |
| 7c | A second-step sign-in counts, and a test fails if `services/two-factor.ts` stops writing `auth.signed_in` | no | partly | the action at `two-factor.ts:398` renamed → 3 old audit assertions fail, but the new `lastSignIns` assertion still passed: `enrolled()` signs in by password first, which already wrote an event, so the assertion was vacuous |
| 7d | `rmk login --web` and access-token use never write `auth.signed_in` | no | confirmed | `grep -rn "auth.signed_in" apps/web/src` outside tests: writers only at `session.ts:147` (password), `sso.ts:319` (provider) and `two-factor.ts:398` (second step); none in `device-grants.ts` or the access-token code |

**Overall:** not met, for 7c: the new two-factor assertion didn't discriminate. Fixed after this pass: the test deletes the `auth.signed_in` rows `enrolled()` wrote and checks there is none, before the second step completes (needs a re-check).

### Re-check 2 — row 7c (the second step)

Witnessed: 2026-10-20 10:02 EDT, by a fresh agent (re-check of claim 7c only, with a mutation in a scratch copy). Commit: 05e80d0e plus uncommitted work. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7c | A second-step sign-in counts as a user's last web sign-in, and a test fails if `services/two-factor.ts` stops writing `auth.signed_in` (line 398) | no | confirmed | unmutated: `two-factor-sign-in.db.test.ts` 24/24 on SQLite, PostgreSQL, MySQL and MariaDB (the other 23 tests pass too, so deleting the rows at the start hides nothing); mutation in a scratch copy (`two-factor.ts:398` changed to `auth.signed_out`, the test's old `events("auth.signed_in")` assertion removed) → the new assertion alone fails: `expected undefined to be an instance of Date` at `two-factor-sign-in.db.test.ts:132`; the test first deletes the rows `enrolled()` wrote and asserts none is on record, so only the second step can produce the Date (a first mutation, to `auth.two_factor_started`, isn't in the audit catalogue, made every test throw and proved nothing: discarded) |

**Overall:** met. Row 7 now stands: 7a, 7b and 7d confirmed in Re-check 1, 7c here; every other row was confirmed in the first pass and the diff since touches only the two sign-in tests.
