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
