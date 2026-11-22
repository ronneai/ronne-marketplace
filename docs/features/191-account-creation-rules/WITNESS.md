# 191 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-11-22 11:07 EST, by a fresh agent (blind). Commit: 79633e4c + working-tree diff (only `docs/MVP/MVP.md`). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP.md §15 has a "Who may create accounts" row for option C | no | confirmed | `git diff` → new row at MVP.md:1037, "(owner, 2026-11-20, option C)", linking to 191's SPEC.md |
| 2 | The row says what the Goal and Decision 1 say: a block list that applies to every way in and always wins, over per-way-in settings | no | confirmed | MVP.md:1037; the panel's name and place match Scope |
| 3 | The row gives Scope's rule in Scope's order, throwaway domains only with *Any domain* (Decision 7) | no | confirmed | MVP.md:1037 against SPEC Scope steps 1–4 |
| 4 | Decisions 2–6 are in the row | no | confirmed | MVP.md:1037: exact match, new accounts only, no link by email with *Any domain*, root's ways not governed and Create user warns, no groups while waiting |
| 5 | The row names 106's Decisions 8 and 9 and describes them correctly | no | confirmed | MVP.md:1037 against 106 SPEC Decisions 8 and 9 |
| 6 | The row records `user.created_via` and the no-change migration | no | confirmed | MVP.md:1037 |
| 7 | §14.3's design point is updated for 191 | no | confirmed | MVP.md:855. Remark: "never with link by email" leaves out 192's authority rule, an omission, not a contradiction |
| 8 | §9.5's identity providers bullet points to 191 without saying it's built | no | confirmed | MVP.md:646–648 "Once 191 is built" |
| 9 | Nothing in MVP.md says 191 is built | no | confirmed | `grep -n 191 docs/MVP/MVP.md` → 4 hits, none says built |
| 10 | No other MVP row contradicts 191 | no | confirmed | the SSO and Self-registration rows; greps for `throwaway`, `block list`, `any domain`, `created_via` |
| 11 | `docs/features/README.md` lists 191 in M32, matching the spec | no | confirmed | README.md:527, 533, order line 525 |
| 12 | `pnpm witness:check` passes | no | confirmed | exit 0 |
| 13 | `pnpm docs:check` passes | no | confirmed | exit 0 |

**Overall:** met.

Fix after the pass (wording, row 7's remark): MVP.md §14.3 says "never with link by email, except 192's authority rule".

### Re-check 1

Witnessed: 2026-11-22 11:08 EST, by a fresh agent (blind, wording only). Commit: 79633e4c + working-tree diff of docs/MVP/MVP.md. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | §14.3 "Root keeps control." carries 192's authority rule as the only exception, and says neither 191 nor 192 is built | no | confirmed | MVP.md:855 against SPEC.md:43–44; "Being built", "will"; `grep -n 192 docs/MVP/MVP.md` → only line 855 |
| 8 | `pnpm witness:check` and `pnpm docs:check` still pass | no | confirmed | exit 0 each |

**Overall:** met.

## Task 2 — Migration

Witnessed: 2026-11-22 11:19 EST, by a fresh agent (blind). Commit: 9f95eacb + working-tree diff (42 tracked files, 4 untracked: `0047_account_rules.ts` and its `.db.test.ts`, `account-rules.ts` and its `.test.ts`). Machine: macOS 27.2, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `identity_providers` gains `creates_accounts`, `any_domain`, `needs_approval`, in `schema.ts` and the provider repository | no | confirmed | `0047_account_rules.ts:47-55`; `IdentityProviderTable`; the repository reads and writes the three |
| 2 | The migration sets them from each provider's `domains`; existing providers keep their behaviour | no | confirmed | db test "keeps every provider's behaviour"; mutation `> 0`→`>= 0` fails it |
| 3 | A rerun never overwrites a provider setting or a `created_via` saved since | no | confirmed | `0047…ts:57`; the rerun db test passes on all 4 dialects |
| 4 | Settings `blocked_domains` and `account_rules_version`, defaulting to an empty list and version 0, no row written | no | confirmed | `ACCOUNT_RULES_KEYS`; `accountRulesFromRows({})` equals the default (unit test) |
| 5 | `user.created_via` is a string(48), not null, default `unknown` | no | confirmed | `0047…ts:66-70`; db test "an account made after it gets unknown" |
| 6 | The backfill's four cases: sign-up, else SCIM, else the earliest provider link, else `unknown` | no | confirmed | db test "backfills created_via…"; mutations (`desc`, no scim step, no sign_up step) fail it |
| 7 | Every creation path writes it; `insertUser` takes it | no | confirmed | required `createdVia`; the five callers; each mutation fails its db test (sso, scim-users-api, sign-up, root-account, user-admin) |
| 8 | Shown on the user page (123) | no | confirmed | `UserPage.tsx:154-160`; `findUserDetail` selects it; `user-page.test.tsx` checks six values; keys in en, fr, pt with `{provider}` |
| 9 | In your data (104) | no | confirmed | `kysely-user-data-repository.ts:94,141`; mutation fails `user-data-export.db.test.ts` |
| 10 | Entries normalised: trimmed, no leading `@`, lowercased, no final dot | no | confirmed | unit tests; probe `probe-191.test.ts`; mutation without the final-dot strip fails 2 tests |
| 11 | Entries validated: non-ASCII, one label, wildcard, address, bad label, too long, past 1000 refused | no | confirmed | the refuse table; probe (`@@acme.com`, `ac_me.com`, 1001 entries) |
| 12 | Domains match exactly (Decision 2) | no | confirmed | probe; mutation to a suffix match fails the test |
| 13 | The task's tests pass on SQLite | no | confirmed | 11 db files: 211 passed, 6 skipped; 5 unit files: 117 passed |
| 14 | The same on PostgreSQL, MySQL and MariaDB | no | confirmed | 217 passed on each |

**Overall:** met. Remarks: the user page shows the provider's id, not its name; the scim and sign_up steps could overwrite a `provider:` value written since 191 on a rerun.

### Adversarial pass

Witnessed: 2026-11-22 11:19 EST, by a fresh agent (adversarial). Commit: 9f95eacb + working-tree diff and the 4 untracked files. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | 0047 adds the three columns; a provider with domains creates for them, none without | no | confirmed | 0047 db test on all four databases; probe P2 (`' [ "acme.com" ] '` true; `not json`, `{"x":1}` false); P4 (300 linked users) |
| 2 | A rerun after a failed MySQL run keeps 106's behaviour and never overwrites what root saved since | no | not met | probe P1: with `creates_accounts` added and the run stopped, the rerun leaves `createsAccounts` false on all four databases (the backfill ran only when this run added the column) |
| 3 | Saving through the 106 form keeps the same behaviour | no | partly | it holds (probe `adv-provider-probe.db.test.ts`), but mutating `accountSettings` to `createsAccounts: true` fails no test |
| 4 | `created_via` backfilled sign-up, SCIM, earliest link, `unknown` | no | confirmed | 0047 db test on all four; probe P3; `provider:` + a 32-character id is 41, within 48 |
| 5 | Every creation path writes it | no | confirmed | the one user insert and its five callers, each asserted in a db test; 9 files pass on all four databases |
| 6 | Shown on the user page and in the export; an unexpected value reads `unknown` | no | partly | it holds (probe P5: `web`, `provider:`, `SETUP`), but making `createdVia()` return the raw value fails no test |
| 7 | Block list normalised; non-ASCII refused; invalid host names refused | no | partly | `"Kacme.com"` (Kelvin sign) accepted as `kacme.com`: lowercasing ran before the ASCII check (harmless: IDNA maps it the same) |
| 8 | Exact match; an unreadable list blocks everything | no | confirmed | probe; mutation without the `damaged` check fails 5+ tests |
| 9 | Passes on SQLite, PostgreSQL, MySQL and MariaDB | no | confirmed | SQLite 202 passed, 6 skipped; the servers 208 each |

**Overall:** not met (row 2; rows 3, 6 and 7 partly).

Fixes after the passes:
- `creates_accounts` and `created_via` are added with no default: null is "not backfilled yet". Every save and every new account writes a value, and each backfill step fills only nulls, so a rerun finishes the backfill and never overwrites anything written since (the blind pass's remark too). A null left reads as off, or `unknown`. New db tests: a rerun after a run that stopped part-way, and the rerun test with SCIM adopting an account since.
- `identity-providers.db.test.ts`: creating and editing a provider keep creating exactly while it lists domains.
- `models.test.ts`: `createdVia()` reads `null`, `""`, `web`, `SETUP`, `provider:` and `Provider:entra` as `unknown`.
- `normalizeBlockedDomain` checks for ASCII before lowercasing; the Kelvin sign is in the refuse table.
- The touched db files (13) pass on SQLite (255 passed, 6 skipped), PostgreSQL, MySQL and MariaDB (261 each).

### Re-check 1 (adversarial)

Witnessed: 2026-11-22 11:29 EST, by a fresh agent (adversarial). Commit: 9f95eacb + working-tree diff and the 4 untracked files. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | (Adv. row 2) A rerun after a failed MySQL run keeps 106's behaviour and never overwrites what was written since | yes | confirmed | probes on all four databases: P1b (only a nullable `creates_accounts`), P6 (only `any_domain`), P7 (all columns, providers saved since kept), P8 (`created_via` written since kept); 0 nulls left; dropping `created_via is null` from the scim step fails the rerun test |
| 2 | (Adv. row 3) Saving through the 106 form keeps it, and a test fails if not | yes | confirmed | `identity-providers.ts:202-207`; mutations to `true` and `false` each fail the new test |
| 3 | (Adv. row 6) An unexpected `created_via` reads `unknown`, and a test fails if not | yes | confirmed | probe P5 on all four; returning the raw value fails 5 tests in `models.test.ts` |
| 4 | (Adv. row 7) Every non-ASCII entry refused before lowercasing, the Kelvin sign included | yes | confirmed | `account-rules.ts:52`; probe `adv-recheck.test.ts` (Kelvin anywhere, `İ`, `ſ`, `é`, full-width, combining, ZWSP, NBSP, DEL); moving the check fails the test. Unicode whitespace at the ends is trimmed, and is a separator in a list anyway |
| 5 | (Blind row 3) `creates_accounts` has no default; every provider insert writes it; null reads as off | yes | confirmed | the one app insert writes it through `columns()`; `Boolean(row.creates_accounts)`; 0 nulls after a run |
| 6 | (Blind row 5) `created_via` has no default; every user insert writes it; null reads `unknown`; none left after a run | yes | confirmed | `insertUser` and its five callers; Better Auth creates no users (`disableSignUp`); `createdVia(row.created_via)` in the summary and the export |
| 7 | The touched db and unit files pass on all four databases | yes | confirmed | SQLite 226 passed, 5 skipped; PostgreSQL, MySQL 8.4, MariaDB 231 each; unit 65 passed |

**Overall:** met. Remark: the `is null` filters on the two selects only save work; each update repeats the guard.
