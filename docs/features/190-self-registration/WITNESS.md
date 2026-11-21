# 190 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-11-21 17:16 EST, by a fresh agent (blind). Commit: 89d6e76e + working-tree diff (CLAUDE.md, docs/MVP/MVP.md, docs/features/README.md; WITNESS.md untracked). Machine: macOS 27.2.1, Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP §9.5 says people can create their own account when root allows it | no | confirmed | MVP.md:647–652 against the spec's Scope |
| 2 | §15 "Web sign-in" says so | no | confirmed | MVP.md:992 |
| 3 | A "Self-registration" row records Decisions 1–15 | no | partly | Decision 10 (the code page bound to the browser) missing |
| 4 | Nothing claims more than the spec, or that 190 is built | no | partly | the Web sign-in addition and CLAUDE.md are in the present tense |
| 5 | No contradiction with other MVP rows | no | not met | MVP.md:88 "only created from the web app (by root)" |
| 6 | CLAUDE.md's line stays true, with the addition | no | confirmed | `git diff CLAUDE.md` |
| 7 | README lists 190 in M32 | no | confirmed | README.md:527, 532 |
| 8 | `pnpm witness:check` | no | confirmed | exit 0 |
| 9 | `pnpm docs:check` | no | confirmed | exit 0 |

**Overall:** not met (rows 3, 4, 5).

Fixes after the pass: MVP.md:88 says users are also created by themselves once 190 is built and root allows it; the "Self-registration" row records Decision 10; the §9.5 bullet, the "Web sign-in" addition and CLAUDE.md are in the future tense ("being built", "once 190 is built").

### Re-check 1

Witnessed: 2026-11-21 17:18 EST, by a fresh agent (blind, wording-only re-check). Commit: 89d6e76e + working-tree diff (CLAUDE.md, docs/MVP/MVP.md, docs/features/README.md). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP.md no longer says only root creates users without 190 | no | confirmed | MVP.md:88; greps for other such statements |
| 2 | The "Self-registration" row records Decisions 1–15, 10 included | no | confirmed | MVP.md:1034 against SPEC.md:270-309 |
| 3 | §9.5, "Web sign-in" and CLAUDE.md:126 don't say 190 is built | no | confirmed | "being built", "will", "once 190 is built" |
| 4 | `pnpm witness:check` and `pnpm docs:check` | no | confirmed | exit 0 each |

**Overall:** met. Remark: Decision 13's "the web asks, the API doesn't" is in the spec, not the row.

## Task 2 — Migration and models

Witnessed: 2026-11-21 17:29 EST, by a fresh agent (blind). Commit: 7ed9f91d + working-tree diff (11 changed or untracked files). Machine: macOS (Darwin 27.2.0), Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration 0046 makes the four tables, registered | no | confirmed | `0046_self_registration.ts`, `index.ts`, `schema.ts`; the db test |
| 2 | The two `user` columns, null for existing accounts | no | confirmed | test on 4 databases; mutation → fails |
| 3 | The settings keys and defaults | no | confirmed | `SIGN_UP_KEYS`, `DEFAULT_SIGN_UP_POLICY`; no rows written; mutation → fails. Plan wording says "in the migration" |
| 4 | The migration's db test on 4 databases | no | confirmed | SQLite 92; each server 51 |
| 5 | Backup and restore tests pass with the new tables | no | confirmed | same server runs |
| 6 | 6 digits from `randomInt`, leading zeros kept | no | confirmed | 20,000 codes |
| 7 | Only an HMAC under HKDF(AUTH_SECRET, `email-code`) | no | partly | code right; mutation (HMAC keyed by the secret) → tests pass |
| 8 | Constant-time comparison | no | confirmed | `timingSafeEqual`; malformed codes HMAC'd too |
| 9 | Bound to purpose and subject; a rotated secret stops old codes | no | confirmed | probe; mutation → 2 fail |
| 10 | 5 wrong tries, racing guesses included | no | confirmed | mutation → 3 fail; race test on 4 databases |
| 11 | Single use, two right answers at once | no | confirmed | test on the servers |
| 12 | Ends at its lifetime | no | confirmed | mutation → fails |
| 13 | A new code ends the previous one | no | confirmed | behaviour holds; removing the `consumed_at` update → tests pass |
| 14 | 60 seconds between sends | no | confirmed | mutation → fails |
| 15 | 3 an hour per address | no | confirmed | mutation → fails |
| 16 | All state in the database | no | confirmed | race tests on the servers |
| 17 | Unit tests cover each rule | no | partly | rows 7 and 13 |

**Overall:** not met (rows 7, 17).

### Adversarial pass

Witnessed: 2026-11-21 17:30 EST, by a fresh agent (adversarial; it read PLAN.md's two task 2 Notes lines while looking for the task, and says they didn't shape the verdicts). Commit: 7ed9f91d + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The db tests pass on 4 databases | yes | confirmed | 27 on SQLite; 13 on each server |
| 2 | The tables and columns; nothing clashing with Better Auth | yes | confirmed | no `additionalFields` |
| 3 | Column sizes | yes | confirmed | email 254; MySQL index sizes fine |
| 4 | Timestamps end in `_at` | yes | confirmed | grep |
| 5 | Indexes for the purge, erase and approvals | yes | confirmed | m9 → fails |
| 6 | A MySQL rerun completes | yes | confirmed | P6; m10, m11 → fail |
| 7 | No settings rows; defaults read off | yes | confirmed | m12 → 2 fail |
| 8 | A corrupt settings row reads safely | yes | partly | a damaged or empty domain list read as `"any"` (fails open) |
| 9 | The lifetime clamped | yes | confirmed | `issue()` doesn't clamp |
| 10 | Uniform codes | yes | confirmed | 1,000,000 samples |
| 11 | Only the HKDF HMAC stored | yes | confirmed | row JSON |
| 12 | Bound to subject, purpose, secret | yes | confirmed | P3 |
| 13 | Constant time | yes | confirmed | timings within noise |
| 14 | Single use under a race | yes | confirmed | P7; without the guard → 8 `ok` |
| 15 | 5 tries under a race | yes | confirmed | P4; m1 → fails |
| 16 | Lifetime | yes | confirmed | m6 → fails |
| 17 | A new code ends the previous | yes | confirmed | m3 survives |
| 18 | 60 seconds between sends | yes | not met | concurrent issues: PostgreSQL 2 codes; MySQL/MariaDB a raw deadlock |
| 19 | 3 an hour per address | yes | not met | 4 concurrent issues, 4 subjects → 4 codes on every database |
| 20 | Tests fail when a rule is removed | yes | partly | m2 survives on the servers; m3 everywhere |

**Overall:** not met (rows 8, 18, 19, 20).

Fixes after both passes:
- The send limits: `reserveEmailCodeSend` (models/email-code.ts) counts each send under 109's database-backed limiter, one a minute per purpose and subject and 3 an hour per purpose and address, all or nothing under row locks, before the transaction that issues the code; `issue` keeps its exact check for sends one after another. A db test races 12 sends for one address on 6 warm connections (3 pass) and 8 for one subject on 4 (1 passes), on every database. The spec says so.
- The domain list fails closed: anything stored that isn't `"any"` or a list reads as an empty list, which lets no domain in; empty strings are dropped. Tested; the spec says so.
- Tests: a known-answer test pins the HKDF key (the mutation keyed by the secret now fails); the earlier code's `consumed_at` is asserted; the single-use race runs 12 answers on 6 warm connections (removing the guard fails on PostgreSQL, rerun by the implementer, file restored).
- `issue` clamps the lifetime itself. The plan's task 2 bullet says the defaults are in a settings model.
- Left as they are: MySQL's case-blind collation lets a case variant of an internal purpose or subject ID find the row (both are the server's own values); a right answer after racing tries ran out reads `used` rather than `spent`.

### Re-check (blind)

Witnessed: 2026-11-21 17:44 EST, by a fresh agent (blind re-check: rows 7, 13 and 17, and the fixes). Commit: 7ed9f91d + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The db, code, backup and restore tests on 4 databases | no | confirmed | SQLite 221; each server 56 |
| 2 | The HKDF key pinned | no | confirmed | m1 → fails |
| 3 | The earlier code's `consumed_at` asserted | no | confirmed | m5 → fails |
| 4 | Single use under a race | no | confirmed | m7 → fails on 4 databases |
| 5 | 5 tries under a race | no | confirmed | m8 → fails on 4 databases |
| 6 | One send a minute per subject, under 109's limiter | no | confirmed | m9 → 2 fail |
| 7 | 3 an hour per address, racing included | no | confirmed | m3, m2 → fail |
| 8 | A damaged or empty domain list fails closed | no | confirmed | m4 → 2 fail |
| 9 | `issue` clamps the lifetime | no | partly | m6 → repository tests pass |
| 10 | Unit tests cover each rule | no | partly | row 9 |
| 11 | The working tree unchanged by the witness | no | confirmed | `git status` |

**Overall:** not met (rows 9, 10).

### Re-check (adversarial)

Witnessed: 2026-11-21 17:33 EST, by a fresh agent (adversarial re-check). Commit: 7ed9f91d + working-tree diff (the repository db test changed during the pass, at 17:38). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | At most 3 an hour to one address, racing included | no | not met | P2: racing at the fixed window's edge → 4 in 60 minutes on PostgreSQL and MySQL |
| 2 | The spec says what's guaranteed | no | not met | no mention of fixed windows |
| 3 | One a minute per subject, racing included | no | confirmed | P3 on 4 databases |
| 4 | The hourly limit's tests | no | confirmed | m6 → 2 fail |
| 5 | Once, never past 5 tries, racing | no | confirmed | P4; m7, m8 → fail |
| 6 | A damaged or empty domain list never `"any"` | no | partly | a stored `""` → `"any"` |
| 7 | The HKDF key tested | no | confirmed | m1, m1b → fail |
| 8 | The binding tested | no | confirmed | m2, m2b → fail |
| 9 | Ending the earlier code tested | no | confirmed | m3 → fails |
| 10 | The clamp in `issue` tested | no | confirmed | m4 → fails (the test added at 17:38) |
| 11 | Nothing broken | no | confirmed | 73 on each server |

**Overall:** not met (rows 1, 2, 6).

Fixes after both re-checks:
- A test issues with 999, 1 and 30 minutes and expects 60, 5 and 30 (m6 now fails; rerun by the implementer, file restored).
- The hourly cap's guarantee is stated as it is (an implementer's decision, raised with the owner): 109's windows are fixed, an hour starting at its window's first send; with `issue`'s exact check, sends one after another never pass 3 in any 60 minutes, and sends racing as a window opens reach at most 5 (no 60 minutes holds both a window's first send and the next window's, so at most 2 of the old window's sends share it with the 3 of the new), with 189's 10 behind it. The minute per subject is exact. SPEC.md and `reserveEmailCodeSend`'s comment say so.
- A stored domain value, an empty or blank one included, is read; only an absent key is `"any"`. Tested.

### Re-check 2 (blind)

Witnessed: 2026-11-21 17:42 EST, by a fresh agent (blind). Commit: 7ed9f91d + working-tree diff. Machine: macOS 27.2.1, Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `issue` holds the lifetime to 5–60 minutes | no | confirmed | repository:80; the test 999→60, 1→5, 30→30 |
| 2 | A test fails without the clamp | no | confirmed | mutation → "expected 59940000 to be 3600000"; restored |
| 3 | The repository and model tests pass on SQLite | no | confirmed | 23 passed |
| 4 | The spec's lifetime rule matches | no | confirmed | SPEC.md:27, 44-48, 231 |

**Overall:** met.

### Re-check 2 (adversarial)

Witnessed: 2026-11-21 17:45 EST, by a fresh agent (adversarial). Commit: 7ed9f91d + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Racing as a window opens, at most 5 in 60 minutes | no | confirmed | P8 worst case on 8 warm connections → `halfopen=5` on PG, MySQL, MariaDB |
| 2 | One after another, never past 3 in 60 minutes | no | confirmed | P6 on 4 databases → `halfopen=3` |
| 3 | The minute per subject exact | no | confirmed | P7 on 4 databases |
| 4 | The spec says what's true | no | partly | "in any 60 minutes" doesn't say which ends count; a closed span holds 6 and 4 |
| 5 | Only an absent key reads as `"any"` | no | confirmed | `""`, blanks → `[]`; values are `notNull()` |
| 6 | A damaged list fails closed | no | confirmed | 29 values; mutation → fails |
| 7 | The tests pass on 4 databases | no | confirmed | 19 on each |

**Overall:** not met (row 4): wording. Note for task 5: `["any"]` and `["*"]` read as literal domains.

Fixes after re-check 2: SPEC.md and `reserveEmailCodeSend`'s comment say a code leaves the hour exactly 60 minutes after it was sent ("in any 60 minutes" includes a span's last moment and not its first); the plan's Notes tell task 5 to match listed domains exactly, never as a wildcard.

### Re-check 3 (adversarial)

Witnessed: 2026-11-21 17:46 EST, by a fresh agent (adversarial, a third round on wording only). Commit: 7ed9f91d + working-tree diff. Machine: macOS (Darwin 27.2.0), Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The spec says which 60 minutes, as the code counts | no | confirmed | SPEC.md:58-59; `email-code.ts:125-126`; repository:59; `database-store.ts:41,102` |
| 2 | `reserveEmailCodeSend`'s comment says the same | no | confirmed | `email-code.ts:149-150` |
| 3 | The plan's note on exact domain matching | no | confirmed | probe on a copy of `sign-up-policy.ts` |

**Overall:** met. With re-check 2 (blind) met, both latest passes are met. Cosmetic: a long spec line, rewrapped before the commit.
