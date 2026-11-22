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

## Task 3 — The rule in SSO sign-in

Witnessed: 2026-11-22 11:47 EST, by a fresh agent (blind; it read PLAN.md's task 3 notes while finding the task, before its verdicts, and says every verdict rests on code it read and commands it ran). Commit: 25b0cab5 + working-tree diff and the untracked `settings/services/account-rules.ts`. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A blocked domain refuses a new account (`domain_blocked`) before every other step, over a provider's allowed list (case 10) | no | confirmed | `sso-sign-in.ts:131`; M1 → 7 tests fail; M5 (order) → 1 fails; probe: case and trailing-dot variants → `domain_blocked` |
| 2 | A throwaway domain refused only with *Any domain* while the setting is on | no | confirmed | `sso-sign-in.ts:132-133`; M3 → 2 tests fail |
| 3 | `creating_off` refuses a new account, still signs in and links existing ones | no | confirmed | `sso-sign-in.ts:134`; M4 → 2 tests fail |
| 4 | *Any domain* creates in any domain not blocked and never links by email (Decision 4) | no | confirmed | `sso-sign-in.ts:124`; M2 → 2 tests fail |
| 5 | `create_pending` when the provider needs approval | no | confirmed | unit "case 3"; M8 → 2 tests fail |
| 6 | The waiting account: linked, `approval_pending_at`, `created_via`, no session, no groups; groups after approval (Decision 6) | no | confirmed | `sso-sign-in.ts:217-245`; sso-groups.db; M6 → fails |
| 7 | The person sees 190's "waits for a root's approval" notice | no | confirmed | `actions/sso.ts:314-319` → `/sign-in?signedUp=waiting` |
| 8 | Roots are notified (139) | no | confirmed | `kysely-sso-repository.ts:147-161`; M7 → fails |
| 9 | The approval and decline emails name the provider, in three languages | no | partly | works (probe), but `provider: null` in `kysely-approval-repository.ts` fails no test |
| 10 | The audit `why` has the three new reasons, worded in en, pt, fr | no | confirmed | sso.db asserts all three; keys in each `admin.json` |
| 11 | *Test sign-in* words `domain_blocked`, `creating_off`, waiting | no | confirmed | test-sign-in.db asserts all three |
| 12 | *Test sign-in* plans no group changes for a waiting account | no | partly | `test-sign-in.ts:117`, but removing the condition fails no test |
| 13 | A null `creates_accounts` reads as 106's rule | no | confirmed | 0047 db test; M10 → fails |
| 14 | The tests cover cases 1, 3, 4, 8, 10, 12, 13 | no | confirmed | unit "case 1/3/4/8/10/12"; sso.db; scim-users-api.db case 13 |
| 15 | Existing tests unchanged and passing | no | confirmed | `git diff 25b0cab5 -- '*.test.ts'`: only the fake's signature and the snapshot loop's values; 120/120 on each server |
| 16 | No way to link or create past the block list (one blind attempt) | no | confirmed | probes (case, dots, padding, `a@b@acme.com`, `x@[1.2.3.4]`, bad punycode, damaged list) |

**Overall:** not met (rows 9, 12). Observation: with *Any domain*, `ana@acme.com.` beside an existing `ana@acme.com` plans `create`: a second account (`normalizeEmail` keeps the dot, the block list strips it).

### Adversarial pass

Witnessed: 2026-11-22 11:47 EST, by a fresh agent (adversarial). Commit: 25b0cab5 + working-tree diff and the untracked `settings/services/account-rules.ts`. Machine: macOS (Darwin 27.2), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A blocked domain refused before every other create check, even when listed | no | confirmed | probe `adv-probe.test.ts`: 22 hostile addresses, none created; M1 → 4 fail |
| 2 | Domains compared exactly, as delivery reads them; subdomains not covered | no | confirmed | `Bob@YAHOO.com.` → blocked; `bob@eu.yahoo.com` → create; non-ASCII refused first |
| 3 | A damaged list refuses everything | no | confirmed | probe: 7 damaged forms → `domain_blocked` |
| 4 | Throwaway with *Any domain* only, subdomains too | no | confirmed | probe; M6 → 2 fail |
| 5 | `creating_off`, `domain_not_allowed`, `create_pending` in order | no | confirmed | probe `LINK` |
| 6 | New accounts only; linking keeps 106's check | no | confirmed | sso.db; probe `root-link-under-block` |
| 7 | *Any domain* never links by email | no | confirmed | probe `anydomain-root`; M2 → 2 fail |
| 8 | Waiting: linked, no groups, no session, `signedUp=waiting`, roots told | no | confirmed | sso-groups.db on all 4; M5 → 2 fail |
| 9 | Groups after approval; refused while waiting; declined deletes account and link | no | confirmed | sso-groups.db; probe |
| 10 | The emails name the provider | no | partly | works (probe reads `mail_outbox`), but M7 (`providerId = null`) leaves every test green |
| 11 | *Test sign-in* words | no | confirmed | test-sign-in.db on all 4 |
| 12 | *Test sign-in* predicts no group changes when waiting | no | partly | M3 leaves test-sign-in.db green |
| 13 | Audit `why` in en, pt, fr | no | confirmed | sso.db; `git diff messages/*/admin.json` |
| 14 | SCIM not governed (case 13) | no | confirmed | scim-users-api.db on all 4 |
| 15 | A null `creates_accounts` reads as 106's rule | no | confirmed | probe; M4 → 3 fail |
| 16 | The race retry can't create past the rules; no two accounts at once | no | confirmed | probes on all 4 (3× one subject, 2 subjects one email, 2 providers, 2 waiting) |
| 17 | Existing SSO tests unchanged | no | confirmed | only the fake's signature and the snapshot loop |
| 18 | All pass on SQLite, PostgreSQL, MySQL, MariaDB | no | confirmed | SQLite 184 passed, 4 skipped; servers 120 each |

**Overall:** not met (rows 10, 12). Wording: an address whose domain delivery can't read (`ana@acme.com:25`, `ana@xn--acme-.com`) is refused as `domain_blocked`, with an empty domain in *Test sign-in*'s words.

Fixes after the passes:
- `sso.db.test.ts`: a provider's waiting account approved and another declined, through real sign-ins with email set up; the queued emails name Acme SSO, never a password or "you typed". Mutation `providerId = null` in `kysely-approval-repository.ts` → it fails.
- `test-sign-in.db.test.ts`: with a mapping and groups in the claims, a new account's group changes are predicted, and none once the provider needs approval. Removing the condition in `test-sign-in.ts` → it fails.
- `planSsoSignIn` refuses an address whose domain isn't spelled as delivery reads it (`invalid_email`): a final dot, a port, a domain delivery can't read. So no second account beside `ana@acme.com`, and no empty domain in the words. New unit cases; the case-4 test asserts `Bob@YAHOO.com` instead of the dotted one.
- Identity, http and mail suites on SQLite: 107 files, 1391 passed, 6 skipped; the 5 changed db files on PostgreSQL, MySQL and MariaDB: 100 each.

### Re-check 1 (blind)

Witnessed: 2026-11-22 12:10 EST, by a fresh agent (blind). Commit: 25b0cab5 + working-tree diff + untracked `settings/services/account-rules.ts`. Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9 | The approval and decline emails for a provider-made waiting account name the provider; a test fails if the name is lost | yes | confirmed | `kysely-approval-repository.ts:38-48`, `approval.ts:49-53`; sso.db "answers a provider's waiting account by email…"; M1 (null), M1b (the id), M2 (`approval.ts` drops it) each fail it |
| 12 | *Test sign-in* predicts no group changes for a waiting account; a test fails if it does | yes | confirmed | `test-sign-in.ts:116-117`; test-sign-in.db "predicts no group changes…"; M3 fails it |
| obs | With *Any domain*, `ana@acme.com.` beside `ana@acme.com` makes no second account | yes | confirmed | `sso-sign-in.ts:118-119`; probe `probe-trailing.db.test.ts` (6 spellings, real sign-in) → `error=not_allowed`, no new user; M4 → 4 unit cases fail |
| 15 | Existing tests unchanged; no way past the block list | yes | confirmed | `git diff 25b0cab5 -- '*.test.ts'`: 2 removed lines (the fake's signature, the snapshot loop's values), no snapshot changed |
| 16 | The task's files pass on SQLite and the three servers | yes | confirmed | SQLite 7 files, 172 passed; each server 6 files, 102 passed |

**Overall:** met.

### Re-check 1 (adversarial)

Witnessed: 2026-11-22 12:04 EST, by a fresh agent (adversarial). Commit: 25b0cab5 + working-tree diff and the untracked `settings/services/account-rules.ts`. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | (adv 10 / blind 9) The emails name the provider; a test fails if the name is lost | yes | confirmed | `sso.db.test.ts:1092`; M7 (null) and M7b (the id) fail it; pt/fr in `templates.test.ts:100` |
| 2 | (adv 12 / blind 12) No group changes predicted for a waiting account; a test fails without the guard | yes | confirmed | `test-sign-in.db.test.ts:201`; M3 fails it |
| 3 | A domain part not spelled as `emailDomain` reads it is refused `invalid_email` before any lookup or rule | yes | confirmed | `sso-sign-in.ts:118-119`; probe `adv-probe-recheck.test.ts`, 33 hostile addresses; `accountRules` and `findUserByEmail` not called for `ana@acme.com.` |
| 4 | No second account beside an existing one; the block list and the lookup compare the same domain | yes | confirmed | `ana@acme.com.` → `invalid_email` (was `create`); every address still planning `create` has its domain part unchanged by `emailDomain` |
| 5 | The check refuses nothing it shouldn't | no | confirmed | 10 good addresses (case, subdomains, valid `xn--`, `+`, `'`, `co.uk`) → `create` |
| 6 | No way to create past the block list | no | confirmed | the previous pass's 22 hostile addresses rerun: none created |
| 7 | Existing SSO tests unchanged | no | confirmed | `git diff 25b0cab5 -- '*.test.ts'` → 2 removed lines (the fake's signature, the snapshot loop) |
| 8 | The task's files pass on all four databases | yes | confirmed | 6 db files: SQLite 134 passed, 4 skipped; PostgreSQL, MySQL, MariaDB 138 each; unit 72 |

**Overall:** met. Observations: with *Any domain*, addresses delivery leaves unchanged but can't reach (`ana@acme..com`, `ana@1.2.3.4`) still plan `create`, which doesn't get around the block list; and an unlinked account stored with a final dot can no longer be linked by email.

Fix after the pass (wording): the comment at `sso-sign-in.ts:115-117` now says what the check does (a final dot, or a domain IDNA changes or can't read), not "a name delivery can't read".

## Task 4 — The rule in email sign-up

Witnessed: 2026-11-22 12:12 EST, by a fresh agent (blind). Commit: 73942376 + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The request checks the block list before the allowed-domains rule, with the same answer (`domain_not_allowed` on `email`), sending nothing | no | confirmed | `sign-up.ts` `domainRefusal`; test "a blocked domain gets the answer…"; M1 → 4 of 5 new tests fail |
| 2 | Exact match, any case; a subdomain isn't covered; with *Any domain* too | no | confirmed | `isDomainBlocked`; test "blocks with any domain too, exactly" |
| 3 | The account write checks again, read in its transaction | no | confirmed | `enterSignUpCode` → `repo.accountRules()` on `trx`; M2 → that test fails |
| 4 | A db test covers a domain blocked at request time | no | confirmed | the 191 describe; a damaged list too |
| 5 | A db test covers a domain blocked while a code is pending | no | confirmed | resend → `closed`, code → `closed`, no `user`, no pending row |
| 6 | Passes on all four databases; audit words in three languages | no | confirmed | 28 passed on each; `signUpOutcomes.domain_blocked`, `signUpCodeReasons.domain_blocked` in en, fr, pt; i18n tests 58 passed |

**Overall:** met. Remark: on the usual path a refused code is recorded `closed`, `domain_blocked` only in the race.

### Adversarial pass

Witnessed: 2026-11-22 12:25 EST, by a fresh agent (adversarial). Commit: 73942376 + working-tree diff (8 files). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | No account for a blocked domain: before the form, while a code is pending, or between the read and the write | no | confirmed | probes P1, P6, P7, P8, P10 on all four databases |
| 2 | The form refuses a blocked domain first, same answer, nothing sent, `domain_blocked` recorded | no | confirmed | `sign-up.ts:51-59`, `:277-281`; P1 (an existing account in a blocked domain), P2 (honeypot) |
| 3 | *Any domain* too; compared as delivery reads them; a subdomain isn't blocked | no | confirmed | P3: a raw stored `["ACME.COM.","xn--bcher-kva.com"]`; 11 spellings refused, only `eu.acme.com` and `acme.co` pending |
| 4 | Once blocked, no new code, no account, the sign-up ends | no | partly | a refused resend leaves the pending row and the code page (P5); a resend racing the block sends a new code (P9), and so does a request (P10) |
| 5 | The account write reads the block list in its transaction | no | confirmed | `sign-up.ts:429`; M2 fails the test |
| 6 | A damaged list lets nobody sign up | no | confirmed | P7 (6 damaged forms), P8 (damaged after the read) |
| 7 | The answer never says an account exists or the domain is blocked | no | confirmed | P1; `domain_blocked` only in the audit |
| 8 | 190's tests unchanged; all four databases | no | confirmed | `git diff --numstat` → 72 added, 0 removed; 28 passed on each |

**Overall:** not met (row 4). Also: on the usual path a refused code is recorded `closed`, so root rarely sees `domain_blocked`.

Fixes after the passes:
- `requestSignUp` reads the block list again in the transaction that writes the sign-up: blocked meanwhile, no code, no pending row, the domain's answer, `domain_blocked` recorded.
- `resendSignUpCode` reads it again in the transaction that sends the code, and a refused resend (closed, or the domain no longer taken) ends the sign-up, as a typed code does.
- A typed code for a domain blocked since is recorded `domain_blocked` on the usual path too.
- New db tests for each (a mutation of each in-transaction read fails its test); the pending test now checks the code page is gone. sign-up.db 31 passed on SQLite, PostgreSQL, MySQL and MariaDB.

### Re-check 1 (adversarial)

Witnessed: 2026-11-22 12:20 EST, by a fresh agent (adversarial). Commit: 73942376 + working-tree diff (8 files). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | No account for a blocked domain, at any step | no | confirmed | P1, P6, P7, P8, P10, P10b on all four databases |
| 2 | The form refuses a blocked domain first, same answer, `domain_blocked` recorded | no | confirmed | P1, P2 |
| 3 | *Any domain* too; delivery's reading; subdomains not blocked | no | confirmed | P3 |
| 4 | Once blocked: no new code (the race included), no account, the sign-up ends after a refused resend | yes | confirmed | P5, P9, P10; mutations of each in-transaction read fail the repo's tests |
| 5 | The account write reads the list in its transaction | no | confirmed | P8 |
| 6 | A damaged list lets nobody sign up | no | confirmed | P7, P8 |
| 7 | The answer never says an account exists or the domain is blocked | no | confirmed | P1, P10b, P13 (closed resend: same for `has@` and `none@`) |
| 8 | A code for a domain blocked since is recorded `domain_blocked` on the usual path | yes | confirmed | P6; M4 fails the repo test |
| 9 | A closed or narrowed sign-up stays `closed` | yes | confirmed | P11, P12 |
| 10 | A resend while sign-up is closed ends the sign-up, keeps 190's behaviour, and has a test | yes | partly | it holds (P11), but returning without ending fails no repo test |
| 11 | 190's tests unchanged; all four databases | no | confirmed | `--numstat` 121 added, 0 removed; 45 passed on each with the probes |

**Overall:** not met (row 10). Remarks: in the request race the browser's previous sign-up is deleted first, as 190 does for `limited`; *Send a new code* doesn't clear the cookie on `closed`, unlike a typed code.

Fixes after the pass:
- `sign-up.db.test.ts`: "a new code asked for once sign-up is closed ends the sign-up" (closed resend → `closed`, no code page, no new mail, the code then `ended`); the mutation the pass named fails it. 32 passed on SQLite, PostgreSQL, MySQL and MariaDB.
- `features/sign-up/actions.ts`: *Send a new code* clears the sign-up cookie when the sign-up ended (`ended`, `closed`), as the code form does. No test covers either action's cookie (the actions aren't unit-tested; the components mock them).

### Re-check 2 (adversarial)

Witnessed: 2026-11-22 12:23 EST, by a fresh agent (adversarial). Commit: 73942376 + working-tree diff (10 files). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | A resend while sign-up is closed ends the sign-up, keeps 190's behaviour, and a repo test fails without it | yes | confirmed | `services/sign-up.ts:541` → `end()`; test `sign-up.db.test.ts:694`; the mutation → 1 failed |
| 12 | *Send a new code* clears the cookie only on `ended` and `closed`, so never for a live sign-up | yes | confirmed | `features/sign-up/actions.ts:108-109`; every `closed` comes from `end()` after `deletePending`; matches `signUpCodeFromForm` |
| 13 | What the code page shows afterwards | yes | confirmed | the notice at once (`CodeStep.tsx:45-66`); on reload a 404 while closed, as after a typed code refused `closed`; "This sign-up has ended." when open (read from the code) |
| 11 | `sign-up.db.test.ts` passes on all four databases | no | confirmed | 32 passed on each |

**Overall:** met. Remark: no test covers either form action's cookie.

## Task 5 — The panel and the provider form

Witnessed: 2026-11-22 12:43 EST, by a fresh agent (blind). Commit: 5f8a1f0f + working-tree diff and the 4 untracked paths. Machine: macOS (Darwin 27.2), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The panel saves the block list, root only, entries normalised, at most 1,000 | no | confirmed | 15 task files → 286 passed; 3 db files → 92 passed on each server; `AuthenticationTab.tsx:110` |
| 2 | Audited `settings.account_rules_changed` with before and after; no change, no audit; the sentence in en, pt, fr | no | confirmed | removing `recordAudit` → 4 db tests fail; probe `probe-191-t5.sentences.test.ts` |
| 3 | Stale check (edge case 14): an older form refused, and of two saves at once one lands | no | confirmed | the stale mutation → 2 fail; probe `probe-191-t5.db.test.ts` on all four databases |
| 4 | The db tests cover two saves at once past the first save | no | partly | only from version 0 (the insert path); removing `value = expected` passes every shipped test |
| 5 | The throwaway setting moved; a sign-up save keeps it | no | confirmed | `SignUpForm.tsx`, `sign-up-input.ts`, `sign-up.ts:131`; probe `probe-191-t5-throwaway.db.test.ts` |
| 6 | A test shows a sign-up save keeps the throwaway setting | no | partly | `on(input.blockThrowaway)` in `sign-up.ts` passes every test |
| 7 | One row per way in, the columns, each row's link, the block list above the table | no | confirmed | `overview.ts:36-70`, `AccountRulesPanel.tsx`; `account-rules.test.tsx` 7 passed |
| 8 | A listed domain on the block list warns in the overview | no | confirmed | the `includes` mutation → 2 component tests fail |
| 9 | The overview warns about approval without email (Decision 8) | no | confirmed | `overview.ts:68`; component test |
| 10 | Step 3's new fields, posted and saved, audited by field name | no | confirmed | `ProviderForm.tsx`, `providers/actions.ts:61-64`; providers.test 32 passed; the db test on all four |
| 11 | No link by email with *Any domain* (edge case 11, Decision 4): disabled with why, forced off | no | confirmed | form and service mutations each fail a test |
| 12 | Approval only while email is set up, with why; once on it stays (Decision 8) | no | confirmed | form and service mutations each fail a test |
| 13 | The provider form warns about a listed domain on the block list (edge case 10) | no | not met | no block list on `ProviderPage`, no message for it |
| 14 | Create user warns for a blocked domain and needs a confirm; the audit records it | no | partly | ASCII works; `sam@bücher.example` with `xn--bcher-kva.example` blocked: the server refuses it unconfirmed, the dialog shows no box |
| 15 | Every new screen string in en, pt, fr | no | confirmed | 40 admin and 7 errors keys, none missing or an English copy |

**Overall:** not met (rows 4, 6, 13, 14).

Fixes after the pass:
- The provider form gets the block list (`ProviderPage.blockedDomains`) and warns under the allowed domains, as typed, for each listed domain on it, while it creates accounts for its list ("acme.org is on the block list, so this provider can't create accounts for it.", in three languages). Test in `providers.test.tsx`.
- Create user reads the typed domain through the URL parser's IDNA, as the server reads it (`typedDomain`), so `sam@bücher.example` shows *Create anyway*. Test in `create-user-blocked.test.tsx`.
- `account-rules.db.test.ts`: three rounds of two saves at once after the first save; removing `value = expected` fails it on PostgreSQL.
- `settings/services/sign-up.db.test.ts`: the panel saves throwaway off then on, and a sign-up save without the field keeps each; `on(input.blockThrowaway)` fails it.
- The two settings db files: 19 passed on SQLite, PostgreSQL, MySQL and MariaDB.

### Re-check 1

Witnessed: 2026-11-22 12:55 EST, by a fresh agent (blind). Commit: 5f8a1f0f + working tree. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | The db tests catch a broken stale check for two saves at once past the first save | no | confirmed | dropping `value = expected` → "lets only one of two saves land after the first save too" fails on PostgreSQL, MySQL, MariaDB (SQLite runs the saves one after the other) |
| 6 | A test catches a sign-up save switching the throwaway setting | no | confirmed | `on(input.blockThrowaway)` → the sign-up db test fails |
| 13 | The provider form warns about a listed blocked domain, only while it creates for its list | no | confirmed | `ProviderForm.tsx` `blockedListed`; two mutations each fail the test |
| 14 | *Create anyway* appears for an internationalised blocked domain; the server and the dialog read the domain alike | no | partly | IDNA forms agree (probe `probe-parity.test.tsx`); but `sam@[1.2.3.4]`, with nothing blocked, is refused by the server (an empty domain counts as blocked) and the dialog shows no box |
| 15 | The touched files pass on SQLite and the three servers | no | confirmed | 2 db files 19 passed on each; 2 component files 35 passed |

**Overall:** not met (row 14).

Fix after the pass: Create user asks only for a domain that's on the list (`domain !== ""` and listed), not by the sign-ins' `isDomainBlocked`, which refuses an unreadable domain; an address like `ip@[1.2.3.4]` is root's to make, as before 191. `user-admin.db.test.ts` creates one with no confirmation; 54 passed on SQLite, PostgreSQL, MySQL and MariaDB.

### Re-check 2

Witnessed: 2026-11-22 12:57 EST, by a fresh agent (blind). Commit: 5f8a1f0f + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 14 | *Create anyway* appears whenever the server would ask, and the server asks only for a listed domain | yes | confirmed | `services/user-admin.ts:217-220`; probe `probe-ip-literal.db.test.ts`: `sam@[1.2.3.4]` created without asking; `sam@bücher.example`, `sam@XN--BCHER-KVA.example`, `sam@acme.org.` ask; probe `probe-parity.test.tsx`: 16 inputs, no case where the server asks and the dialog hides the box; restoring `isDomainBlocked` fails the test; `user-admin.db.test.ts` 53 passed (1 skipped) on SQLite, 54 on each server |

**Overall:** met. Remark: for `sam@acme.org:80` with `acme.org` blocked, the dialog shows the box though the server can't read the domain and doesn't ask: the safe way round.
