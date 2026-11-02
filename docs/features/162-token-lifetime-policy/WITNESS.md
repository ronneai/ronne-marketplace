# 162 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-11-01 19:04 EST, by a fresh agent (blind). Commit: 5bc0467f + working tree (`git diff`: docs/MVP/MVP.md, docs/features/README.md). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP §15's "Access tokens" row says root sets the longest lifetime on the Authentication tab: 30, 90 or 365 days or no limit | no | confirmed | `git diff docs/MVP/MVP.md` → MVP.md:993 "Root sets the longest lifetime on the Authentication tab … 30, 90 or 365 days or no limit". Matches SPEC Scope |
| 2 | The row says reviewers and root get the same cap or a shorter one, counted as the two-factor policy counts them | no | confirmed | MVP.md:993 "for reviewers and root (counted as the two-factor policy counts them) the same or shorter". `grep coveredBy …/two-factor-coverage.ts` → line 12 |
| 3 | The row gives the defaults, 365 days and 90 days | no | confirmed | MVP.md:993 "defaults 365 and 90 days". Matches SPEC Scope and Decision 2 |
| 4 | The row says which ways of making a token honour the cap, and what each gives | no | confirmed | MVP.md:993 "Account › Tokens, `rmk login` and the device flow honour it (the last two give 90 days, or the cap when shorter)". Matches SPEC Scope's three paths |
| 5 | A request for more than the cap is refused with `token_lifetime_too_long` | no | confirmed | MVP.md:993. Matches SPEC Scope |
| 6 | Shorten sets the earlier expiry and never revokes | no | confirmed | MVP.md:993 "the earlier of their own and the cap, never revoking them". Matches Decision 3. Wording remark: the spec says "now plus the maximum"; "the cap" mixes a date with a duration |
| 7 | Root sees a person's tokens on their page and can revoke one | no | confirmed | MVP.md:993. Matches SPEC Scope |
| 8 | Changing your password (a box, ticked by default) and root's two-factor reset revoke the account's tokens | no | confirmed | MVP.md:993. Matches SPEC Scope and Decision 4 |
| 9 | The row presents nothing as more settled than the spec does | no | partly | SPEC Decisions 1 and 2 mark the reviewers' shorter cap and the 365/90 defaults "(Claude, to confirm)"; MVP.md:993 puts both after "(owner, 2026-11-01, [162])" with no "to confirm" |
| 10 | Nothing else in MVP.md contradicts the spec | no | confirmed | `grep -n -i` for token, expiry, revoke, sessions, two-factor and reset: :647 "optional expiry" still holds; :636 and :1009 don't say tokens survive; :860 lists the policy in M28. Remark: the spec doesn't say whether 128's forced change at `/account/password` shows the box (a spec gap, not a contradiction) |
| 11 | `docs/features/README.md` lists 162 in M28 with the spec's dependencies, a matching description and a fitting status | no | confirmed | README.md:452 M28; deps "009, 105, 107, 122, 123, 128" as the SPEC header; status `specified` → `in progress` |
| 12 | `pnpm witness:check` passes | no | confirmed | `node packages/repo-tools/src/check-witness.js; echo EXIT=$?` → `EXIT=0` |

**Overall:** not met: the row and the index say what the spec says, but MVP.md:993 credits the owner with the reviewers' shorter cap and the defaults, which the spec marks "(Claude, to confirm)".

### Re-check (rows 6 and 9)

Witnessed: 2026-11-01 19:05 EST, by a fresh agent (blind). Commit: 5bc0467f + working tree (`git diff`: docs/MVP/MVP.md, docs/features/README.md; task 2 code outside docs/ ignored). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | The row says Shorten sets the earlier expiry and never revokes | no | confirmed | MVP.md:993 "Shorten sets older tokens' expiry to the earlier of their own and now plus the cap, never revoking them"; matches SPEC Scope ("the earlier of its own and now plus the maximum") and Decision 3 |
| 9 | The row presents nothing as more settled than the spec does | no | confirmed | MVP.md:993 adds "(the separate cap for reviewers and the defaults are Claude's, to confirm: 162's Decisions 1 and 2)"; `grep -n "to confirm" SPEC.md` → :117 and :119, Decisions 1 and 2. The owner's attribution now covers only what the spec credits to the owner |

**Overall:** met: with rows 1–5, 7, 8 and 10–12 of the first pass, every row is confirmed. `node packages/repo-tools/src/check-witness.js` → EXIT=0.

## Task 2 — The policy

Witnessed: 2026-11-01 19:10 EST, by a fresh agent (blind). Commit: 70bf1be8 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `models/token-policy.ts` holds the two caps: 30, 90 or 365 days or no limit, keys `token_max_days` and `token_max_days_reviewers`, "no limit" stored as `none` | no | confirmed | `token-policy.ts:7-21`. A probe after `setTokenPolicy(…30,30)` read rows `token_max_days="30"`, `token_max_days_reviewers="30"`; `{none,null}` stored `value: "none"` (db test) |
| 2 | Validation refuses any value that isn't 30, 90, 365 or no limit, with `InvalidTokenPolicyError("lifetime")` | no | confirmed | `npx vitest run …token-policy.test.ts` → 37 passed (0, 7, 60, 366, -30, 30.5, NaN, Infinity, " 30", "30 ", "30.0", "0x1e", "1e2", "+90", "None", undefined, true, {}, [30] refused). Probe: `{}`, "３６５", "٣٠", `30n`, `new Number(30)`, "30\r\n", a 100,000-digit string and "NONE" → `lifetime`. Mutations: removing the regex guard fails 5 unit tests; removing the setter's `undefined` check fails the db test |
| 3 | The reviewers' cap must be the same or shorter; "no limit" for reviewers under everyone's 90 is refused | no | confirmed | `setTokenPolicy`: `capWithin` → `reviewers_longer`. The db test refuses [90,365], [30,90], [90,null], [365,null]; probe `{90, "none"}` → `reviewers_longer`. Mutation `if (false)` fails the db test |
| 4 | With nothing set, reading gives 365 for everyone and 90 for reviewers and root | no | confirmed | `DEFAULT_TOKEN_POLICY` (`token-policy.ts:15`); unit and db tests pass; `instanceSettings` includes `tokenPolicy: {365, 90}`. Mutation (reviewers' default 365) fails 7 tests |
| 5 | A hand-edited value reads as the default; the reviewers' cap never reads longer than everyone's | no | confirmed | Unit: "45"/"forever" → default; "30"/unset → 30/30; "90"/"none" → 90/90. Probe: hand edit `90`/`none` → `{90, 90}` in `tokenPolicy` and `instanceSettings`. Mutations: dropping `shorter(…)` fails 2 tests; invalid-as-no-limit fails 2 |
| 6 | `setTokenPolicy` requires `settings.manage` (root only): a plain user, no user and a moderator are refused, nothing changes | no | confirmed | `requirePermission(actor.user, "settings.manage")`; `permissions.ts:21` `["root"]`. The db test throws `ForbiddenError` for all three, policy and audit unchanged. Mutation (no `requirePermission`) fails it |
| 7 | Saving records `settings.token_policy` with `{ from, to }`, root, the IP and target `instance`; a save that changes nothing records nothing | no | confirmed | The db test checks both events; a repeat with `"90"`/`"30"` → `{changed: false}`, no event. Mutation (no `recordAudit`) fails it |
| 8 | The action is in the audit catalogue and reads as a sentence in en, pt and fr; `InvalidTokenPolicyError` has words in all three | no | confirmed | `audit-event.ts:98`. 9 files (settings, summary, sentences, admin-errors, messages.parity, audit-event, catalogue, admin-untranslated) → 164 passed; English matches `error.message`. Mutation (no "only what changed" filter) fails `summary.test.ts` |
| 9 | Thin action adapter: `setTokenPolicy(headers, value)` and `tokenPolicy()` | no | confirmed | `actions/settings.ts:142-150`; `tsc --noEmit` in a scratch copy → no errors; `biome check` clean |
| 10 | The database tests run on SQLite | no | confirmed | 4 `|db|` token-policy tests pass on in-memory SQLite. No SQL of its own (existing `repo.get`/`set`/`recordAudit`); servers not asked by the Done when |

**Overall:** met: both caps validated, reviewers' never longer, defaults 365/90 with hand edits normalized, root only, audited with `{ from, to }`; every claim's test fails under its mutation.

Remark for task 6: `tokenCapFrom` reads `null` and `""` as no limit, so a form that leaves a field out (`FormData.get` → null) would set the loosest policy. Leading zeros (`"0365"`) are accepted (harmless).

### Adversarial pass

Witnessed: 2026-11-01 19:10 EST, by a fresh agent (adversarial). Commit: 70bf1be8 + working tree (uncommitted diff and the untracked `token-policy.ts` / `token-policy.test.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A cap is only 30, 90 or 365 days or no limit; `tokenCapFrom` refuses anything else | no | confirmed | Probe `models/probe-162.test.ts` → refused `"365\n"`, `"\n365"`, `"30\r\n"`, a zero-width space before 30, Arabic-Indic and fullwidth digits, `new Number(30)`, `new String("30")`, `30n`, `-0`, `0`, `"0"`, `[]`, `["30"]`, `{valueOf}`, `{toString}`, `"NONE"`, `" none"`, `"none "`, `"null"`, `false`, a 400-digit string, a Date. Accepts `"030"` as 30 (harmless). Mutation: drop `/^\d+$/` → 5 unit tests fail |
| 2 | Defaults are 365 and 90; a key never set reads as the default | no | confirmed | `token-policy.ts:15`; `tokenPolicyFrom({null,null})` → `{365,90}`; db test on a new database. Mutation (reviewers' default 365) → 7 tests fail |
| 3 | A hand-edited stored value reads as the default | no | not met | Probe: stored `token_max_days=""` → `{maxDays:null}`, no limit for everyone instead of 365; `token_max_days_reviewers=""` → `{365,365}` instead of 90. Cause: `tokenPolicyFrom` reuses `tokenCapFrom`, which takes `""` as no limit. No test covers a stored `""` |
| 4 | The reviewers' cap never reads longer than everyone's | no | confirmed | Stored `["none","365"]` → `{null,365}`; `["365","none"]` → `{365,365}`; `["90",""]` → `{90,90}`; `["30",null]` → `{30,30}`. Mutation (no `shorter`) → 2 tests fail |
| 5 | `setTokenPolicy` requires `settings.manage` (root only); a non-root is refused and nothing is written | no | confirmed | On SQLite, PostgreSQL 15 and MySQL 8.4: workspace admin, admin plus moderator, `role:"ROOT"`, `role:"admin"`, anonymous → `ForbiddenError`; policy `{365,90}`, 0 audit rows. Mutation (no `requirePermission`) fails |
| 6 | Both caps set at once in a transaction; audited with `{from,to}` and the actor's IP | no | confirmed | Rows `none`/`none`; events carry the IP and correct from/to. Mutations (skip reviewers' `set`, IP null, `from` = new values) each fail. `settings.db.test.ts` on pg15 and mysql8.4 → 25/25 each |
| 7 | The audit row's `from` is the policy it replaced (under concurrent saves) | no | partly | Three concurrent calls: correct on SQLite; on MySQL all 3 events record `from {365,90}`; on PostgreSQL two record `from {90,30}`. No lock on the read; `setUsageMinimum`/`setRetention` read the same way, so this predates 162 |
| 8 | Nothing is recorded when nothing changes | no | confirmed | Same values as strings → `{changed:false}`, 2 events only. Mutation (no early return) fails |
| 9 | Invalid input is refused with `InvalidTokenPolicyError` and nothing changes | no | confirmed | `{}`, `[365]` → `lifetime`; `{365,"none"}` → `reviewers_longer`; `{"null",30}` → `lifetime`; a refused `{30,90}` after `{90,30}` leaves `{90,30}` and 1 event. Mutation fails |
| 10 | The catalogue has the action; the audit page has a sentence in en, pt and fr | no | confirmed | `audit-event.ts:98`; `summary.ts:458`. Probe with partial, null, array, string and nested metadata in 3 locales: never throws, no `{}` leaks. Wording nit: fr "de aucune limite" should elide; pt "de sem limite para" is awkward |
| 11 | The error has words in en, pt and fr | no | confirmed | `messages/{en,pt,fr}/errors.json`; `npx vitest run src/i18n` passes |
| 12 | Unit tests cover validation and defaults; db tests the setter, the audit row and a non-root refused | no | confirmed | 4 files → 76 passed; 11 mutations caught. Gap: the stored `""` (row 3) |
| 13 | Callers of `InstanceSettings` still type-check and pass | no | confirmed | `tsc --noEmit` → 0; admin-settings, admin-audit, i18n → 38 files, 653 passed |

**Overall:** not met: an empty stored `token_max_days` reads as no limit instead of 365 (row 3); concurrent saves on PostgreSQL and MySQL can record a stale audit `from` (row 7, shared with every settings setter).

### Re-check (rows 1, 3, 7, 9, 10 and 12)

Witnessed: 2026-11-01 19:17 EST, by a fresh agent (adversarial). Commit: 70bf1be8 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A cap is only 30, 90 or 365 days (a number, or exactly those digits) or `"none"`; `tokenCapFrom` refuses anything else, `""` and null included | no | confirmed | Probe → refused null, `""`, `"030"`, `"0030"`, `"30.0"`, `"+30"`, `" 30"`, `"1e2"`, NaN, `365.0000000000001`, `"365\n"`, `"30\r\n"`, a zero-width space before 30, Arabic-Indic and fullwidth digits, `new Number(30)`, `new String("30")`, `30n`, `-0`, `[]`, `["30"]`, `valueOf`/`toString` objects, `"NONE"`, `" none"`, `"null"`, false, a Date (`token-policy.ts:31-36`). Mutations: `""`/null as no limit → 5 tests fail; `""` alone → 4; `Number(value)` → 9 |
| 3 | A hand-edited stored value reads as the default; an empty one no longer lifts the cap | no | confirmed | Stored `["",null]` → `{365,90}`; `[null,""]` → `{365,90}`; `["030",null]` → `{365,90}`; `[" 90","30"]` → `{365,30}`. Covered by `token-policy.test.ts:98-99` and `settings.db.test.ts`. Mutation (stored invalid → null) → 2 tests fail |
| 7 | Concurrent saves: the final policy is one of the saves; the stale audit `from` is recorded as a follow-up for every settings setter (outside this task's claims) | no | confirmed | SPEC and the *Done when* make no concurrency claim; the unlocked `from` read is the same in `setUsageMinimum`, `setRetention` and the rest. The setter's transaction is unchanged since the first pass, where PostgreSQL 15 and MySQL 8.4 ended in one of the saves with only `from` stale. `PLAN.md` Notes records the follow-up accurately |
| 9 | Invalid input is refused with `InvalidTokenPolicyError` and nothing changes | no | confirmed | `{}`, `{"030","0030"}`, `{"",""}`, `{[365],90}`, `{new Number(365),90}`, `{"null",30}` → `lifetime`; `{365,"none"}` → `reviewers_longer`; afterwards no `token%` rows, 0 events. Mutation (no `reviewers_longer`) → 1 test fails |
| 10 | The audit page has a sentence in en, pt and fr | no | confirmed | 10 metadata shapes × 3 locales: pt "…a de todos, agora 30 dias (antes: 365 dias)…"; fr "…celle de tout le monde, désormais aucune limite (avant : 30 jours)". Never throws, no `{}` leaks. Remark: swapping `{to}`/`{from}` in pt isn't caught, as for every action (only English is asserted) |
| 12 | Unit tests cover validation and defaults; db tests the setter, the audit row and a non-root refused | no | confirmed | `npx vitest run token-policy.test.ts settings.db.test.ts src/features/admin-audit src/i18n` → 26 files, 509 passed; mutations R1–R6 each fail a test |

**Overall:** met: `tokenCapFrom` is strict for input and storage, empty or hand-edited stored values read as the default, invalid input is refused with nothing written, the pt/fr sentences read correctly, and the tests catch each mutation. The stale `from` under concurrent saves is outside this task and recorded as a follow-up.

## Task 3 — Enforcement

Witnessed: 2026-11-01 19:25 EST, by a fresh agent (blind). Commit: cc44bde3 + working tree (13 modified files, untracked `actions/token-deps.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `createToken` reads the person's cap, the reviewers' one when `coveredBy("reviewers", …)` | no | confirmed | `services/access-tokens.ts:56-57` `tokenCapOf` = `capFor(policy, coveredBy("reviewers", user, true))`. Mutation M1 (reviewer → `false`) → 4 of the 162 tests fail (web ×2, exchange, device) |
| 2 | "Reviewers" are root and moderators/admins of a shared workspace, counted as the two-factor policy counts them | no | partly | Probe P4: root → 30, moderator elsewhere → 30, plain member → 365, admin of own personal workspace → 365. But `hasPassword: true` (`access-tokens.ts:57`) makes a company sign-in moderator a reviewer, which the two-factor `coveredBy` never counts (`two-factor-coverage.ts:16`); the comment says it's deliberate (stricter), the SPEC doesn't say so |
| 3 | The password exchange gives 90 days, or the cap when shorter | no | confirmed | `token-exchange.ts:68` no longer passes `lifetime: 90`. api-v1 test: user 90 under 365/30, moderator 30, user 30 under 30/30, 90 under none. P5: moderator 90 under default and none/none. M3 (`lifetime: 90` back) → api-v1 and device tests fail |
| 4 | The device flow gives 90 days, or the cap when shorter, 30 under a 30-day cap | no | confirmed | `actions/device-grants.ts:19` uses `tokenDeps`. Device test: 30 under 30/30, user 90 and moderator 30 under 365/30. P6: moderator 90 under none; user 90 / moderator 30 under 90/30. M4 (default = cap) → device tests fail |
| 5 | Asking for more than the cap is refused with `token_lifetime_too_long`; no token made or audited | no | confirmed | `access-tokens.ts:66`; `errors.ts:170-176`. Web test: refusals, only 3 `access_token.created`. P2: under 90, `365` and `null` refused with `days: 90`. M2 (no throw) → 3 tests fail |
| 6 | The policy changes while the dialog is open: "The longest lifetime is now 90 days" | no | confirmed | P7: 365 allowed, policy 90/90 → `createMyToken(…365)` rejects with that text; `features/account-tokens/actions.ts:23` turns any `IdentityError` into `errorText` |
| 7 | `token_lifetime_too_long` is in the API's errors | no | confirmed | `http/api-v1.ts:56-57` answers 400. Remark: unreachable today (the exchange reads no lifetime; P5), so untested and deleting it fails nothing |
| 8 | The error's words in en, pt and fr with `{days}` | no | confirmed | `messages/{en,pt,fr}/errors.json`; `src/i18n/errors.test.ts` with the 4 db files → 72 passed |
| 9 | Done when: db tests cover web, exchange and device flow for a plain user and a moderator under each cap, and the refusal | no | partly | Three paths and the refusal covered. Gaps: no moderator under a reviewers' cap of 365 or none, no plain user under an everyone-cap of 90, no moderator under default or none for the exchange, device only 30/30 and 365/30. Mutation M5 (reviewers never above 90) → all 49 tests pass; only probe P1 fails |
| 10 | A role gained later doesn't touch tokens already made; the cap is read when the token is made | no | confirmed | Web test; P8: a 365-day token still authenticates after the user becomes a moderator; their next default token gets 30 |
| 11 | Defaults apply with no policy; a hand edit reads as the default; reviewers' never above everyone's | no | confirmed | Web test 1. P3: stored `bogus`/`bogus` → user 365 ok, moderator 365 refused with 90; `30`/`none` → moderator refused with 30 |
| 12 | The changed files lint and typecheck | no | confirmed | `biome check` on 14 files → clean; `tsc --noEmit` in a scratch copy → no errors |

**Overall:** not met: enforcement works on all three paths and the refusal holds, but the tests don't cover a moderator under a long or unlimited reviewers' cap and other combinations (row 9), and the reviewers' count differs from the spec's wording for company sign-in accounts (row 2).

### Adversarial pass

Witnessed: 2026-11-01 19:31 EST, by a fresh agent (adversarial). Commit: cc44bde3 + working tree (13 modified files, untracked `token-deps.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Account › Tokens applies root's cap | no | confirmed | `actions/access-tokens.ts:17` `tokenDeps(app)`; `services/access-tokens.ts:83` `lifetimeWithin(asked, await tokenCapOf(…))` before the insert; `access-tokens.db.test.ts` → 13 passed |
| 2 | The password exchange applies the cap | no | confirmed | `exchangePassword` passes `deps(app)`; no `lifetime: 90` (`token-exchange.ts:68`). M8 (put it back) → api-v1 and device tests fail. Probe: a moderator who gains the role later gets 30, then 90 under (90,90), 90 under none/none |
| 3 | The device flow applies the cap | no | confirmed | `actions/device-grants.ts:19`; the poll reloads the user with `findActiveUser` (`device-grants.ts:288`); `device-grants.db.test.ts` → 20 passed |
| 4 | No other path inserts into `access_tokens` for a person | no | confirmed | `grep -rln 'insertInto("access_tokens")'` → only `kysely-token-repository.ts:82`; `repo.insert` only from `createToken` (callers `createMyToken`, `createWithFreeName`). `TokenDeps.policy` required, no casts; `tsc --noEmit` → 0 |
| 5 | Reviewers' cap for root and moderators/admins of a shared workspace; a personal workspace doesn't count; memberships loaded on every path | no | confirmed | Probe with a real personal workspace: `getCurrentUser`, `findActiveUser`, `findCredentialByEmail` all load `personal` and memberships; `tokenCapOf` → 365 under (365,30) on each. Root with `{}` → 30; `{p:admin}` with personal=p → 365; `{p:admin, s:moderator}` → 30. M1, M2 → all three files fail |
| 6 | The same however the person signs in | no | confirmed | `coveredBy("reviewers", user, true)`. M12 (`false`) → all three files fail |
| 7 | The cap is read when the token is made | no | confirmed | `tokenDeps.policy` calls `tokenPolicy(...)` each time; the device test changes the policy between grants; probe: a role gained later applies to the next exchange (90 → 30) |
| 8 | A lifetime longer than the cap is refused with `TokenLifetimeTooLongError`, nothing inserted or audited | no | confirmed | Probe: moderator under (365,30), 21 inputs; all above 30 refused; successes only 30, `"30"`, `" 30"`, `""`, undefined (30 days). `"null"`, `"NONE"`, `"  "` → InvalidTokenLifetimeError. Counts unchanged after refusals. M6 (clamp) → tests fail |
| 9 | "No expiry" is refused under any cap | no | confirmed | `"none"` and `null` refused under 30; tests refuse `"none"` under 365 and 90 |
| 10 | No lifetime asked → 90 days or the shorter cap; 90 under no limit | no | confirmed | (30,30) → 30 on all three paths; none/none → 90 on web and exchange. M4 → all fail; M5 (no limit → no expiry) → web and api fail, device passes (row 14) |
| 11 | A hand-edited policy or a failed read never loosens the cap | no | confirmed | Hand edits (`0`, `-1`, `36500`, `""`, `" 30"`, `NONE`, `30.0`, `9e1`) → defaults; `30/none` → reviewers 30; a throwing `policy` → `createToken` rejects, nothing inserted |
| 12 | The API maps the error to 400 `token_lifetime_too_long` | no | confirmed | `api-v1.ts:56`. Probe with a mocked `exchangePassword` → `400 {"error":{"code":"token_lifetime_too_long",…}}`. No repository test reaches it (M9 survives) |
| 13 | The error has words in en, pt and fr | no | confirmed | `messages/{en,pt,fr}/errors.json`; `src/i18n/errors.test.ts` passes |
| 14 | Done when: db tests cover web, exchange and device flow for a plain user and a moderator under each cap, and the refusal | no | partly | (a) `createTestUser` makes no personal workspace, so M3 (`{...user, personal: null}`, counting the personal workspace) passes all 49 tests; (b) the device flow has no "no limit" or default-policy case (M5 passes it); no path tests a moderator under no limit |
| 15 | The same tests hold on PostgreSQL and MySQL | no | confirmed | Own containers (postgres:15, mysql:8.4), removed by id afterwards: the three task db files plus the probe → 56 passed on each |

**Overall:** not met: enforcement holds on all three paths, all three dialects and every hostile input tried, but no test user has a personal workspace (M3 survives) and the device flow has no "no limit" case (M5 survives it).

Notes: the API mapping is unreachable and untested; in the device flow the grant is spent before the token is made, so a failed policy read loses the grant (as other database errors there do); the Create token dialog still sends `"90"` (task 6).

### Re-check (rows 2, 7, 9 of the blind pass and 12, 14 of the adversarial pass)

Witnessed: 2026-11-01 19:37 EST, by a fresh agent (adversarial). Commit: cc44bde3 + working tree (now also `SPEC.md` and the untracked `apps/web/src/server/http/api-v1.test.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| B2 | Who counts as a reviewer matches the spec: root, and moderators and admins of a shared workspace (personal workspace excluded), however they sign in | no | confirmed | `SPEC.md` Scope "For reviewers and root" and Decision 5 (Claude, to confirm); `services/access-tokens.ts:57` `coveredBy("reviewers", user, true)`. M3 (personal workspace counts) → access-tokens, device-grants and api-v1 db tests fail; M12 (`hasPassword` false) → all three fail |
| B7 / A12 | The API maps `TokenLifetimeTooLongError` to 400 `token_lifetime_too_long`, and a test covers it | no | confirmed | `tokenErrorResponse` (`api-v1.ts`), unit-tested in `api-v1.test.ts` (3 passed); M9 (→ `invalid_request`) fails it; a mocked-exchange probe through `postToken` → 400 `token_lifetime_too_long`. Gap: M9b (`postToken` not calling the helper) survived; see the note below |
| B9 | Tests cover each cap (30, 90, 365, none) | no | confirmed | Web: plain under default, (90,90), (30,30), (365,30), none; moderator and root under default, (365,365), none. Exchange: plain under default, (90,90), (365,30), (30,30), none; moderator under default, (365,365), (365,30), none. Device: plain and moderator under default, (365,30), none; plain under (30,30). M1, M4, M5 → all three db files fail; M6 → access-tokens fails; M8 → device and api fail |
| A14 | Done when: db tests cover web, exchange and device flow for a plain user and a moderator under each cap, and the refusal | no | confirmed | Every plain user has a real personal workspace; M3 and M5 now fail on all three paths. 3 db files + `api-v1.test.ts` + `errors.test.ts` (SQLite) → 66 passed; on own postgres:15 and mysql:8.4 containers (stopped by id) the 3 db files + probe → 58 passed each |

**Overall:** met: the personal-workspace and no-limit gaps are closed, the API mapping is unit-tested, and spec and code agree on who counts as a reviewer. Decision 5 waits for the owner's confirmation.

Notes: M9b (the wiring from `postToken` to the helper) was untested; the implementer added a db test after this pass that drives the 50-token limit through `login` and expects 409 `token_limit`. M10 (`""` read as a lifetime asked for) is untested; the dialog always sends a value until task 6.

### Re-check (rows 2, 7 and 9)

Witnessed: 2026-11-01 19:38 EST, by a fresh agent (blind). Commit: cc44bde3 + working tree (now with `apps/web/src/server/http/api-v1.test.ts` and the SPEC.md change). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | "Reviewers" are root and moderators/admins of a shared workspace (personal workspace excluded), however they sign in, and the spec says so | no | confirmed | SPEC.md Scope "For reviewers and root" and Decision 5 (Claude, to confirm) match `services/access-tokens.ts:56-57` (`coveredBy("reviewers", user, true)`, unchanged, `cmp`). Probe P4: root 30, another workspace's moderator 30, member 365, personal-workspace admin 365. Mutation M8 (any non-`user` membership counts, personal included) → 4 tests fail across web, exchange and device |
| 7 | `token_lifetime_too_long` is in the API's errors, tested | no | confirmed | `http/api-v1.ts` `tokenErrorResponse` (400 `token_lifetime_too_long`, 409 `token_limit`, 400 `invalid_request`, or null), used by `postToken`'s catch. M6 (drop the lifetime branch) → `api-v1.test.ts` fails; M7 (`postToken` stops calling it) → api-v1.db "answers the token limit through the same errors" fails |
| 9 | Done when: db tests cover web, exchange and device flow for a plain user and a moderator under each cap, and the refusal | no | confirmed | 4 task files + probe → 63 passed. M5 (reviewers never above 90) now fails "gives reviewers and root a long or unlimited cap when root allows it". Web: plain under 365, 90, 30, none; moderator and root under 90, 30, 365, none. Exchange: user default/90/365-30/30/none, moderator default/365/30/none. Device: user and moderator under default/30-30/365-30/none. Refusals under 365, 90 and 30 |

**Overall:** met: rows 2, 7 and 9 now hold; with the first pass's other rows every claim is confirmed.

## Task 4 — Shorten

Witnessed: 2026-11-01 19:47 EST, by a fresh agent (blind). Commit: 8adb9501 + working tree (uncommitted diff and the 3 untracked token-policy files). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `countTokensPastPolicy` counts the active tokens that last longer than their owner's cap | no | confirmed | `npx vitest run src/server/domains/identity/services/token-policy.db.test.ts` → 5 passed; 10 seeded tokens, count 5, then 0 after Shorten. M1 (drop `revoked_at is null`) → fails |
| 2 | A mix of owners and caps: root and reviewers (shared workspace, not personal) get the reviewers' cap, everyone else the general one; "no limit" handled | no | confirmed | Defaults 365/90, `none/none` → 0, `none/30` → only the moderator's, `90/30`. The predicate at `kysely-token-repository.ts:80-100` matches the two-factor coverage at `kysely-identity-repository.ts:332-343`. M3 (all "others") → 4 fail; M9 (personal counts) → 2 fail. Probe: a shared-workspace admin's 100-day token → 90 days |
| 3 | Shorten uses the cap each owner has today | no | confirmed | Test "reads each owner's cap as it is today" (promoted → 200-day token becomes 90); killed by M3 |
| 4 | Sets the earlier of the token's own expiry and now + cap; shorter tokens left alone | no | confirmed | `plainWithin` stays 300, `modWithin` 50; null or longer go to 365/90. M2 (compare to `now`) → fails. Probe: exactly at 365 days stays, 1 s past moves. `shortenTo` re-applies the guard (a second safeguard; M8 alone stays green) |
| 5 | Revoked and expired tokens are ignored; none is revoked | no | confirmed | Expired, revoked-null and revoked-500 keep their dates; revoked ids unchanged. Killed by M1 |
| 6 | A disabled account's tokens don't count | no | confirmed | Probe: count 3, `disableUser` on one owner → 2; Shorten → `{count: 2}`, the disabled user's token untouched. SQLite, PostgreSQL, MySQL. The task's test has no disabled case |
| 7 | Writes in batches of 500 | no | confirmed | `token-policy.ts:7` `SHORTEN_BATCH = 500`, sliced at 60-61; the test checks `[500,500,3]` for 1003 tokens but from the imported constant, so M5 (`1000`) stays green |
| 8 | All batches run in one transaction | no | confirmed | A failure in batch 3 leaves the first token null and no audit row. M4 (no transaction) → fails. Passes on PG, MySQL, MariaDB |
| 9 | Audited as `access_token.shortened`: one row with actor, IP, instance target and `{count, days, reviewersDays}`, none when nothing changed | no | confirmed | `[root.id, "203.0.113.7", "instance", {count:5, days:365, reviewersDays:90}]`, `{count:1, days:null, reviewersDays:30}`, no row on a second run. M6, M7 → fail |
| 10 | The action is registered; its sentence exists in en, pt and fr | no | confirmed | `audit-event.ts:54`; `npx vitest run src/i18n src/features/admin-audit` → 24 files, 444 passed |
| 11 | Count and Shorten are root's only | no | confirmed | Plain user, moderator, no user → `ForbiddenError`, no change, no audit. `requirePermission(…, "settings.manage")` at `token-policy.ts:29,52` |
| 12 | The db tests pass on PostgreSQL and MySQL (also MariaDB) | no | confirmed | `pnpm test:db:postgres -- src/server/domains/identity/services/token-policy.db.test.ts` → 5 passed; `:mysql` → 5; `:mariadb` → 5 |
| 13 | SPEC records the audit metadata shape | no | confirmed | `SPEC.md:27-29` |

**Overall:** met: count, owner and cap mix, today's cap, already-shorter, revoked, expired and disabled tokens, one transaction, batching and the audit row hold on SQLite, PostgreSQL, MySQL and MariaDB.

Remarks: the batch test doesn't pin 500 (M5); a Biome warning (`useMathMinMax`) at `kysely-token-repository.ts:78`.

### Adversarial pass

Witnessed: 2026-11-01 19:53 EST, by a fresh agent (adversarial). Commit: 8adb9501 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `countTokensPastPolicy` and `shortenTokens` are root only | no | confirmed | `token-policy.ts:31,52` `requirePermission(…, "settings.manage")` before any read; `permissions.ts:21` `["root"]`. Test "is root's alone" covers a plain user, a moderator and null, no change and no audit |
| 2 | Only active tokens count; past the cap means no expiry or one later than now plus the cap | no | confirmed | `kysely-token-repository.ts:69-79`. Probe "ms precision" (NOW with .567 ms, `TZ=America/Sao_Paulo`) on SQLite, PostgreSQL, MySQL, MariaDB: exactly at the cutoff neither counted nor changed, cutoff+1 ms counted. MySQL `datetime(3)`. Mutations (no `revoked_at`, `>`→`>=`, `at(now)`) fail the task test. A disabled owner's unrevoked token would be counted, but disabling revokes tokens (`user-admin.ts:156`) |
| 3 | The owner's cap by today's roles; a no-limit group left alone | no | confirmed | Probe on 4 dialects: SQL and `coveredBy` agree for root with no memberships (90), admin of `global` (90), moderator only in own personal workspace (365), no personal workspace (365), an unknown role (365). They differ only for a role in another user's personal workspace, which the app refuses (`members.ts:431`, `identity-providers.ts:76`); same rule as the 2FA count's SQL. Mutations (no `owner_id is null`, no root branch) fail |
| 4 | Earlier of own expiry and now plus the cap; shorter, expired, revoked untouched; nothing revoked | no | confirmed | `shortenTo` guards (`kysely-token-repository.ts:109-118`); the main test asserts all 10 tokens and the revoked set. Probe: reviewers stored 365 under everyone 30 → both 30, root's 200-day token → 30 |
| 5 | One update per batch of 500, all in one transaction | no | confirmed | `[500,500,3]` for 1003 tokens; a failure in batch 3 changes nothing. Passes on all 4 dialects (500-id IN lists). Mutation (no transaction) → batch test fails |
| 6 | One audit row `{ count, days, reviewersDays }` when anything changed, none otherwise; the count matches what changed | no | confirmed | `token-policy.ts:61-72`; mutation `if (true)` fails. Concurrency probe (two Shortens at once, 40 tokens) on 4 dialects → `{40}` and `{0}`, audits sum to 40. Gap: returning `ids.length` instead of `numUpdatedRows` passed the task's tests |
| 7 | The audit page has a sentence in en, pt and fr | no | confirmed | `messages/{en,pt,fr}/admin.json`; `summary.ts:298-305`; 5 test files → 83 passed |
| 8 | Done when: db tests cover count, mix, shorter, revoked, expired, audit; PostgreSQL and MySQL too | no | confirmed | `token-policy.db.test.ts` → 5 passed on SQLite, PostgreSQL, MySQL and MariaDB |

**Overall:** met: no claim broke on SQLite, PostgreSQL, MySQL or MariaDB, including edge timestamps, concurrent Shortens and time zones; one test gap (a wrong returned count).

After both passes, the implementer pinned the literal 500 in the batch test (the blind pass's remark), added a test that revokes a token between the look-up and the update and expects it not counted (this pass's row 6 gap), and reworded the SQL's comment ("never a personal one"); no code changed. `token-policy.db.test.ts` → 6 passed on SQLite, PostgreSQL and MySQL.

## Task 5 — Recovery revokes tokens

Witnessed: 2026-11-01 20:06 EST, by a fresh agent (blind). Commit: b758ba7d + working tree (13 modified files, none untracked). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `changePassword` revokes the person's tokens when `revokeTokens` is left out (ticked by default) | no | confirmed | `services/session.ts:217-218` revokes unless `revokeTokens === false`. `session.db.test.ts` "revokes my tokens with the box ticked…" → both `token_revoked`. M1 (never revoke), M2 (`!== true`) → that test and the require-token test fail |
| 2 | With `revokeTokens: false` the tokens keep working and `tokensRevoked: 0` is recorded | no | confirmed | "keeps them when I untick it" passes; M3 (ignore the box) → fails at `session.db.test.ts:142` |
| 3 | The revocation runs in the same transaction as the `user.password_changed` audit row | no | confirmed | `session.ts:215-235`, both on the transaction's `repo`. Probe: a throw after `recordAudit` → token still valid on SQLite, PostgreSQL 15, MySQL 8.4. Remark: Better Auth changes the password before the transaction (`session.ts:212`), as before 162 |
| 4 | `user.password_changed` records `tokensRevoked`, shown in en, pt and fr | no | confirmed | Test asserts `tokensRevoked: 2` and `0`. Probe → "Changed their password (2 tokens revoked)", "…(3 other sessions ended, 1 token revoked)", pt "(2 tokens revogados)", fr "(2 jetons révoqués)"; nothing added when both are 0. Mutation (drop the tokens part) → `sentences.test.ts` fails |
| 5 | A wrong current password revokes and records nothing; other people's tokens untouched | no | confirmed | Both tests pass; the repository filters `user_id` and `revoked_at is null` (`kysely-identity-repository.ts:674-681`) |
| 6 | Root's web two-factor reset revokes the tokens in its transaction and records `tokensRevoked` | no | confirmed | `user-admin.ts:393-399`; test: `token_revoked`, `{via:"web", sessionsEnded:1, tokensRevoked:1}`. M4 (no revoke) → fails |
| 7 | The terminal reset revokes the tokens, records it, and the script says so | no | confirmed | `root-account.ts:138-150`; test asserts `tokensRevoked: 1` and `token_revoked`; M5 → fails. Probe running `runResetTwoFactor` end to end → "Turned off two-factor sign-in for a@x.com, ended 1 session and revoked 2 access tokens." on PostgreSQL and MariaDB |
| 8 | A token revoked by a password change gets 401 on the next request (`require-token.db.test.ts`) | no | confirmed | New test → `{status:401, code:"token_revoked"}`; M1 and M2 → fails |
| 9 | The last root changing their password with the box ticked loses their tokens too | no | confirmed | Probe with the only root (two-factor enrolled) → `token_revoked`, root count 1, on SQLite and PostgreSQL; no role branch |
| 10 | The task's db tests pass on all four dialects | no | confirmed | 9 files → 134 passed, 1 skipped (SQLite); the three task files on PostgreSQL 15, MySQL 8.4, MariaDB 10.11 → 35/35 each |

**Overall:** met: a password change (box ticked by default) and both two-factor resets revoke the tokens atomically with the audit row and record `tokensRevoked`; the revoked token gets 401 at the next request.

Remarks: `reset-two-factor.ts:15-18`'s comment doesn't mention tokens; the web reset dialog's `twoFactorBody` says "signs them out everywhere" without the tokens (a screen, for task 6); no test runs `runResetTwoFactor`'s success message (the probe does).

### Adversarial pass

Witnessed: 2026-11-01 20:00 EST, by a fresh agent (adversarial). Commit: b758ba7d + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `changePassword` revokes the person's tokens by default | no | confirmed | `session.db.test.ts` "revokes my tokens…" passes; M1 (missing counts as false) → it and the `require-token` 401 test fail |
| 2 | `revokeTokens: false` keeps the tokens; other values fail safe | no | confirmed | "keeps them when I untick it" passes; M7 (always revoke) → fails. Probe: `"false"`, `0`, `null`, `""`, `"off"` all revoke; only `false` keeps them |
| 3 | The revocation and the audit row are in one transaction | no | confirmed | `session.ts:215-235`. Probe: `recordAudit` throws → the revocation rolled back with it, on SQLite, PostgreSQL and MySQL |
| 4 | A password changed always means the tokens are revoked (no half state) | no | partly | The same probe: Better Auth changes the password before the transaction (`session.ts:212`); afterwards the new password signs in, the token still works, 0 audit rows, the caller gets an error |
| 5 | `tokensRevoked` is the number of active tokens revoked | no | partly | 1 live, 1 expired, 1 already-revoked → `tokensRevoked: 2`: `revokeAccessTokens` (`kysely-identity-repository.ts:674-681`) never filters `expires_at`. Same on all three dialects |
| 6 | A failed change revokes nothing | no | confirmed | Too short, 200 characters, empty, wrong current, no cookie, junk cookie, Bearer instead of a session, rate limited → `ok:false`, token works, 0 audit rows. M4 → fails |
| 7 | Other people's tokens are untouched | no | confirmed | M5 (no `where user_id`) → "leaves other people's tokens alone" fails |
| 8 | Root's forced change (128) takes the same path | no | confirmed | Probe with `password_change_required` → `{ok:true, required:true}`, `{"otherSessionsEnded":0,"tokensRevoked":1,"required":true}`, token revoked |
| 9 | Web two-factor reset revokes tokens, ends sessions, records `tokensRevoked` | no | confirmed | `two-factor-reset.db.test.ts`; M2 → fails |
| 10 | Terminal two-factor reset does the same | no | confirmed | M3 (`root-account.ts:140`) → fails |
| 11 | No two-factor to reset → nothing revoked (web and terminal) | no | partly | Behaviour holds (probe), but M8a2/M8b2 (revoke on the early return) leave 13/13 passing |
| 12 | The terminal says it revoked tokens | no | not met | The line is right (`reset-two-factor.ts:54-56`) but `scripts/reset-two-factor.db.test.ts` fails 1 of 3: it expects the old sentence. The doc comment (line 16) says only "ends its sessions" |
| 13 | A revoked token gets 401 `token_revoked` at its next request | no | confirmed | The `require-token.db.test.ts` 162 test passes, fails under M1 |
| 14 | No way to get a token survives the recovery | no | partly | Probe: start a device login, approve on `/device`, `changePassword`, then exchange → `ok`, a working token; on PostgreSQL and MySQL too. Approved, unspent grants aren't withdrawn; same for the two-factor reset and Reset password |
| 15 | The audit page shows the tokens revoked in en, pt and fr | no | confirmed | en "…(2 other sessions ended, 3 tokens revoked)", pt, fr; none when both 0. M9, M10 → fail |
| 16 | Done when: db tests cover both boxes, both resets and the 401, on every dialect | no | partly | The 3 task files: 35/35 on SQLite, PostgreSQL, MySQL, MariaDB; but the related suite has 1 failure (row 12) and no no-two-factor test (row 11) |

**Overall:** not met: the script test fails, an approved device code still gives a working token after the recovery, the count includes expired tokens, a failed audit write leaves the tokens alive with the new password, and the no-two-factor case has no test.

### Re-check (rows 4, 5, 11, 12, 14 and 16)

Witnessed: 2026-11-01 20:20 EST, by a fresh agent (adversarial). Commit: b758ba7d + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | A password changed always means the tokens are revoked (no half state) | no | confirmed | Probe on SQLite, PostgreSQL, MySQL, MariaDB: `recordAudit` throws → the error goes up, the new password works, the token `token_revoked`; `setPasswordChangeRequired` throws in a forced change → revoked; transaction and revoke both down → the original error, token still works (nothing can be written). M13 (no fallback) → fails |
| 5 | `tokensRevoked` counts only active tokens | no | confirmed | 1 live, 1 expired, 1 revoked → 1 on all four dialects; boundary: expiring in 5 s counted, expired 1 s ago not. M12 (no `expires_at`) → fails |
| 11 | No two-factor to reset → nothing revoked, web and terminal, and a test catches the opposite | no | confirmed | M8a2 (`user-admin.ts`), M8b2 (`root-account.ts`) → each fails "changes and records nothing for someone without it" |
| 12 | The terminal says it revoked tokens, and its test passes | no | confirmed | `vitest run --project db scripts/reset-two-factor.db.test.ts` → 3/3; expects "…, ended 1 session and revoked 1 access token." and `revoked: ["tok-live"]`; the doc comment names the tokens |
| 14 | No way to get a token survives the recovery | no | confirmed | On four dialects: approve, change the password, exchange → no token; the same after root's two-factor reset and Reset password (`access_denied`). Race probe (exchange and change at once, 15× SQLite, 15× PostgreSQL) → 30 minted, 0 working. M11 (no withdrawal) → fails |
| 16 | The db tests pass on every dialect, the shared helper's callers included | no | confirmed | 40 db files on the shared paths → PostgreSQL, MySQL, MariaDB 554 passed, 1 skipped each; SQLite (`--maxWorkers=4`) 549 passed, 6 skipped. Disable records `{"sessionsEnded":1,"tokensRevoked":1}` with 1 live and 1 expired |
| 17 | The fallback revoke respects an unticked box, and a test catches it | no | partly | Behaviour holds (probe), but M14 (`if (true)` in the catch) passes `session.db.test.ts` |
| 18 | Withdrawing grants touches only this person's, and a test catches it | no | partly | The code filters `user_id` (`kysely-identity-repository.ts:677-682`), but M15 (no filter) passes every test |
| 19 | `revoke-access --email` counts what it revokes | no | partly | 1 live, 1 expired: `accessToRevoke` → 2, `revokeAccess` → 1: `countActiveAccessTokens` still counts expired tokens |

**Overall:** not met: rows 4, 5, 11, 12, 14 and 16 hold on all four dialects; two tests are missing (rows 17, 18) and `revoke-access --email`'s preview no longer matches its result (row 19). `revoke-access --everyone` (`revokeAllAccessTokens`) neither filters expired tokens nor withdraws approved grants.

### Re-check (rows 17, 18 and 19)

Witnessed: 2026-11-01 20:40 EST, by a fresh agent (adversarial). Commit: b758ba7d + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 17 | The fallback revoke respects an unticked box, and a test catches it | no | confirmed | M14 (`if (true)` in the catch) → "keeps them, the box unticked, even when the audit row can't be written" fails. Probe on four dialects: `revokeTokens:false` with a throwing `recordAudit` → error, token still works |
| 18 | Withdrawing grants touches only this person's, and a test catches it | no | confirmed | M15 (no `user_id` filter on `device_grants`) → "withdraws only my approved sign-ins, never someone else's" fails |
| 19 | `revoke-access --email` asks about what it revokes | no | confirmed | 1 live, 1 expired on four dialects → preview 1, result 1. M16 (no `expires_at` in `countActiveAccessTokens`) → "--email asks about the live tokens only, and revokes as many" fails. Callers pass their clock (`instance-access.ts:34-45`, `user-admin.ts:106,418`); `tsc --noEmit` clean |
| 19b | `revoke-access --everyone` withdraws approved grants and counts only active tokens, preview and result alike | no | confirmed | 2 people, 2 live, 1 expired, an approved code each, 1 pending → preview 2, result 2; both approved codes `access_denied`; statuses `["denied","denied","pending"]`; the expired token's `revoked_at` stays null; four dialects. M17, M18, M19 each fail "--everyone too, and withdraws sign-ins approved in the browser" |
| 16 | The affected db files pass on every dialect | no | confirmed | 12 files (session, instance-access, scripts/revoke-access, scripts/reset-two-factor, scripts/reset-root-password, user-admin, two-factor-reset, require-token, device-grants, device-page, disabled-users, root-account) → SQLite 167 passed, 1 skipped; PostgreSQL, MySQL, MariaDB 168/168 each |

**Overall:** met: with the earlier rounds, every claim of task 5 is confirmed on all four dialects, and each new test fails without its fix.

## Task 6 — Screens

Witnessed: 2026-11-01 20:49 EST, by a fresh agent (blind). Commit: fa3f4f4b + working tree (30 modified, 6 untracked files). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's component, i18n and db tests pass | no | confirmed | `npx vitest run` on token-policy-form, create-token-dialog, user-page, account, admin-settings, `src/i18n` and access-tokens.db.test → 26 files, 498 passed |
| 2 | The Authentication tab has an Access tokens panel with both caps; the reviewers' cap only the same or shorter | no | confirmed | `AuthenticationTab.tsx` adds the `access-tokens` panel; the test checks the options. Browser probe: choosing 30 left the reviewers' select with `[ '30 days' ]` |
| 3 | Shorten shows the count and asks before it runs, with a component test | no | partly | Works (e2e and probe: Shorten them → dialog → Shorten tokens → toast → "No active token lasts longer than this."). The count text is tested (`count > 0` → `>= 0` fails 1). But the "asks first" check proves nothing: `Dialog` keeps its content in the DOM while closed; a button that opens nothing still passed 3/3 |
| 4 | The helper "Why shorter for reviewers?" links to `authentication#tokens` | no | confirmed | `Help.tsx` `"token-lifetime-reviewers"` → `docsHref("authentication","tokens")`; `topics.ts` adds `tokens`; `help.json` in en, pt, fr; the panel has one such button |
| 5 | The Create token dialog offers only the allowed lifetimes, including under a 30-day cap | no | confirmed | `create-token-dialog.test.tsx` checks 30 → `["30"]` (with the hint), 90, 365, null; dropping the filter fails 2/2. Live probe (cap 30): `[ '30 days' ]`, "Root allows tokens of 30 days at most." |
| 6 | `/admin/users/<id>` lists the person's tokens, never the secret or its preview | no | confirmed | `user-page.test.tsx` covers 3 cases; removing the preview strip in `listTokensOf` fails the db test. Probe: "probe token · the web app · 2026-11-01 · never · 2026-12-01 · active", no `rmk_` in `#user-tokens` |
| 7 | Revoke on a person's page asks first, works, is audited, and has a component test | no | partly | Works (probe: asks, row stays active until confirmed, then "revoked" on both pages; the db test checks `access_token.revoked` by root). But nothing tests `RevokeUserTokenButton` or `revokeUserTokenFromForm`, the e2e never revokes, and the success toast never appears (the form goes with the refresh) |
| 8 | The password form has "Also revoke my access tokens", ticked by default, passed to the action; the same form on root's forced-change page | no | confirmed | Removing `defaultChecked` fails 1 test; always sending `true` fails 1. `/account/password` is the only page with the form. `playwright test e2e/password-change.e2e.ts --project chromium` → 3 passed, `toBeChecked()` on the held page too |
| 9 | An e2e test sets a cap, shortens, and sees a person's token list | no | confirmed | `pnpm exec next build` then `playwright test e2e/token-policy.e2e.ts --project chromium` → 1 passed |
| 10 | Root's Reset two-factor dialog says it also revokes the tokens | no | confirmed | `twoFactorBody` in en, pt, fr; the user page HTML contains "revokes their access tokens" |

**Overall:** not met: the panel, the dialog, the token list, the password box and the e2e work, but Revoke on a person's page has no component test and its toast never shows, and the "asks before Shorten" test checks nothing. Also: `admin.done.users.twoFactorOff` didn't mention the tokens.

### Re-check (rows 3 and 7)

Witnessed: 2026-11-01 20:59 EST, by a fresh agent (blind). Commit: fa3f4f4b + working tree (39 changed or untracked entries). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | Shorten shows the count and asks before it runs, with a component test covering that | no | confirmed | `npx vitest run` on token-policy-form, revoke-user-token, admin-users actions, user-page, `src/i18n` → 24 files, 451 passed. The test checks `dialog.open` false → true and that `shortenTokensFromForm` isn't called. Mutations (a button that opens nothing; Shorten called on click) → each fails 1 of 3. The e2e passes |
| 7 | Revoke on a person's page asks first, works, is audited, says so, and has a component test | no | confirmed | `revoke-user-token.test.tsx`: mutations (opens nothing; no hidden ids; Cancel doesn't close) → each fails. `actions.test.tsx`: dropping `flashToast("tokenRevoked")` or swapping the ids → fails. The e2e revokes and expects the toast, "revoked" and no button. Probe after rebuild: the toast `'OK:Revoked. It stops working on its next request.'` (count 1); the row reads "revoked" on both pages |
| 10b | The toast after root's Reset two-factor says the tokens are revoked | no | confirmed | `done.users.twoFactorOff` in en, pt, fr; `e2e/two-factor-hold.e2e.ts:180`; `playwright test e2e/token-policy.e2e.ts e2e/two-factor-hold.e2e.ts --project chromium` → 3 passed |

**Overall:** met: with the first pass's rows 1, 2, 4, 5, 6, 8, 9 and 10, every claim of task 6 is confirmed.

## Task 7 — Messages

Witnessed: 2026-11-01 21:09 EST, by a fresh agent (blind). Commit: 4cc15715. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Every key 162 added or changed in `en` (account, admin, errors, help) is also in `pt` and `fr` | no | confirmed | Probe `probe-keys.mjs <repo> 70bf1be8 4cc15715` → "checked 62 new/changed en keys, 0 problems" |
| 2 | Each has the same ICU arguments and tags in all three languages, and valid ICU | no | confirmed | The probe parses each with `@formatjs/icu-messageformat-parser` and compares arguments, plurals, selects, tags → 0 problems; `password_changed` uses `{ended}` in all three |
| 3 | The parity, placeholder and untranslated tests pass | no | confirmed | `npx vitest run src/i18n` → 20 files, 403 passed; `admin-untranslated.test.ts` lists only the keys that are really the same (pt `Status`, fr `Actions`, `rmk login`) |
| 4 | The pt and fr texts are Portuguese and French and follow the glossary | no | confirmed | Read the full `git diff 70bf1be8 4cc15715 -- apps/web/messages`: token/jeton, revisor/réviseur, espaços de trabalho/espaces de travail, autenticação de dois fatores/double authentification, root stays root |
| 5 | Typography: no space before punctuation in pt; Canadian French space before a colon only, curly apostrophes | no | confirmed | Grep of the added fr lines for ` [?;!]`, a colon without space and `'` → only correct ` : `; pt: no ` [?;:!]` |
| 6 | The screens use the new keys and none is unused | no | confirmed | `capHint` CreateTokenDialog.tsx:68, `revokeTokens*` ChangePasswordForm.tsx:86, `tokens.title` UserPage.tsx:175, `twoFactorOff` admin-users/actions.ts:181, `done.settings.*` admin-settings/actions.ts:86,101, audit parts in summary.ts, help id TokenPolicyForm.tsx:109; the error classes carry the fields their messages use |
| 7 | No raw text in the new screens | no | confirmed | `biome check` on the 62 changed files → 0 errors. Mutation (raw text for `shortenTitle`) → "Text on the screen comes from the message files (feature 129)" |
| 8 | The feature's UI tests pass | no | confirmed | admin-audit, admin-settings, admin-users, account-tokens, account, components/help → 37 files, 439 passed |
| 9 | The phone sweep passes on the settings page and the user page, in en, pt and fr | no | confirmed | After `pnpm exec next build`: `mobile-sweep.mobile.e2e.ts` → 15 passed each on `phone`, `phone-webkit`, `tablet`; pages.ts:169 and :179 include both pages; the swept member has a token, so the table and Revoke are swept |
| 10 | The language sweeps find no English left in pt or fr | no | confirmed | `languages-admin.e2e.ts languages-rest.e2e.ts --project chromium` → 24 passed, including `noEnglish` on `?tab=authentication` |

**Overall:** met: every new key is in en, pt and fr with matching ICU and proper Portuguese and Canadian French, the screens use them with no raw text, and the parity, lint, phone and language sweeps pass.

Remarks: no English-leak unit test renders the user page's token table or the panel in pt or fr (the probe found them translated; the e2e language sweep covers the panel); optional wording in fr `past` ("…plus longtemps que cela") and `confirmBody`.

## Task 9 — Access tokens in the Account tabs

Witnessed: 2026-11-01 21:28 EST, by a fresh agent (blind). Commit: a2e76127 + working tree (11 modified files, uncommitted). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The Account tabs list Access tokens at `/account/tokens`, after Two-factor sign-in and before Language, and the tabs test checks it | no | confirmed | `AccountTabs.tsx:8-13`. `npx vitest run account-tabs.test.tsx account-tokens.test.tsx translations.test.tsx src/features/account-security` → 48 passed. Mutations: removing the entry → 3 tests fail; moving it after language → the order test fails |
| 2 | `/account/tokens` shows the Account header and the tabs, Access tokens current | no | confirmed | Probe on a real `next start`: one h1 "Account"; tabs password, security, tokens (aria-current), language. Mutation (no `<AccountTabs current="tokens">`) → the account-tokens test fails |
| 3 | The page keeps its Access tokens heading and Create token, which works | no | confirmed | `TokensPage.tsx:44-47`. Probe: h2 "Access tokens"; Create token made "probe" and its row appeared. Mutation (h2 shows the description) → fails |
| 4 | The title reads "Access tokens · Account · Ronne AI Marketplace", in each language; `tokens.metaTitle` removed, unused | no | confirmed | Probe `page.title()` → `Access tokens · Account · Ronne AI Marketplace`; fr `Jetons d’accès · Compte · …`; pt `Tokens de acesso · Conta · …`. `page.tsx:11` `accountMetadata("tokens")`. Parity, messages and raw-text tests → 62 passed; `tsc --noEmit` 0; `biome check` clean |
| 5 | The Password, Two-factor sign-in and Language pages show the new tab too | no | confirmed | Probe: each lists password, security, tokens, language with itself current; their titles unchanged |
| 6 | Language drops out of the tabs, on the tokens page too, when root turns choosing off | no | confirmed | Probe (choosing off, default fr) → `/account/tokens` tabs `[password, security, tokens*]`. `page.tsx:26` passes `choosable.length > 1`. Gap: dropping `language={language}` in `TokensPage.tsx` passed the unit tests |
| 7 | The sidebar's CLI & tokens still leads to `/account/tokens` | no | confirmed | `nav.ts:161` unchanged; probe: the link lands on `/account/tokens` |
| 8 | The e2e tests that use the page pass | no | confirmed | `next build` 0; `playwright test access-tokens token-policy device getting-started languages-rest registry-api scim --project chromium` → 27 passed |
| 9 | The phone sweep passes on it | no | confirmed | `dialogs.mobile navigation.mobile mobile-sweep.mobile --project phone --project phone-webkit --project tablet` → 57 passed; `pages.ts:164` sweeps `/account/tokens` in en, pt and fr |
| 10 | SPEC.md Scope describes Account › Access tokens | no | confirmed | `git diff SPEC.md` → the new bullet |

**Overall:** met: Access tokens is a tab of Account at the same address, with the Account header, its own heading and Create token, and the title in all three languages; Language still drops out when choosing is off; e2e and the phone sweep pass.

After this pass the implementer added a test that renders `TokensPage` with `language={false}` and expects no Language tab (the row 6 gap).

## Task 10 — No CLI & tokens in the sidebar

Witnessed: 2026-11-01 21:51 EST, by a fresh agent (blind). Commit: b6cb9759 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The sidebar's Tools group no longer lists CLI & tokens | no | confirmed | `git diff nav.ts` → the `/account/tokens` entry is gone from `NAV`, `"tokens"` from the `NavIcon` type; `NavIcon.tsx` no longer imports `SquareTerminal` |
| 2 | The navigation unit tests no longer find it, and would catch it coming back | no | confirmed | `vitest run AppShell.test.tsx getting-started.test.tsx` → 71 passed. Mutation (entry and `shell.json` keys back) → 6 failed; AppShell.test.tsx:212 checks `navFor(ROOT)` has no `/account/tokens` |
| 3 | The phone Menu doesn't list it | no | confirmed | navigation.mobile.e2e.ts:28-31 checks the link has count 0; `navigation.mobile getting-started.mobile mobile-sweep.mobile` → 21 passed on each of phone, phone-webkit, tablet |
| 4 | The `shell` messages drop the label in all three languages, consistently | no | confirmed | `nav.tokens` removed in en, pt, fr; `vitest run src/i18n` → 403 passed; `tsc --noEmit` 0 |
| 5 | The Getting started button reads "Open Access tokens" and leads to `/account/tokens` | no | confirmed | home.json en/pt/fr; GettingStartedPanel.tsx:163, :236 link to `/account/tokens`; getting-started.test.tsx:180. Mutation (old label) → that test fails |
| 6 | Account's Access tokens tab is the way there | no | confirmed | AccountTabs.tsx:11; two-factor-hold.e2e.ts clicks the tabs "Access tokens" and "Password" → passed |
| 7 | Nothing in the app still names the CLI & tokens page | no | confirmed | `grep -rnEi "CLI (&|&amp;|e|et) (tokens|jetons)"` over apps/, packages/, README.md → only the absence check in navigation.mobile.e2e.ts:31 |
| 8 | Nothing in the Documentation still names it | no | confirmed | ronne-web `www/src` → no match; product-facts names it only as removed; the overview's Tools line lists Documentation and Send feedback; runbooks say Account › Access tokens. Remark: `docs/knowledge/i18n.md:169` still had a glossary row for it |
| 9 | The e2e tests that used it pass | no | confirmed | `next build` 0; `two-factor-hold getting-started --project chromium` → 5 passed; mobile set → 21 passed each |
| 10 | The spec notes match: 162 Scope, 119 and 126 | no | confirmed | 162 SPEC.md:37-39; 119 SPEC.md:32, :47; 126 SPEC.md:28-29 |

**Overall:** met: the link is gone from the sidebar and the Menu, the messages are consistent in three languages, the button is renamed and still leads to `/account/tokens`, nothing in the app, the website or the runbooks names the page, and the tests pass (both mutations fail).

After this pass the implementer removed the stale glossary row from `docs/knowledge/i18n.md`.
