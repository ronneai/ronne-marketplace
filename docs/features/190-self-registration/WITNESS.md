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

## Task 3 — Bot protection

Witnessed: 2026-11-21 18:05 EST, by a fresh agent (blind; a `grep` of PLAN.md showed it the task 3 Notes before its own checks, and it says it didn't rely on them). Commit: 27410ba1 + working-tree diff. Machine: macOS (Darwin 27.2.0), Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The checklist run on `altcha`; it failed, so our own solver | yes | confirmed | npm registry: one maintainer, 3.7.0 a day old; no `altcha` in `package.json`; `solve-challenge.ts` on `crypto.subtle` |
| 2 | The server side on `node:crypto`: a signed challenge, verified | no | confirmed | mutation (no signature check) → fails |
| 3 | A replay refused through `challenges_used`, racing included | no | confirmed | 1 of 8 concurrent takes, on 4 databases |
| 4 | The list's licence passes | yes | confirmed | `LICENSE.txt` is CC0 1.0 |
| 5 | The list bundled with its source, matching upstream | yes | confirmed | the raw file at the commit is identical |
| 6 | The notice ships, and the test covers it | no | confirmed | `notices.js --filter @ronneai/web` → CC0 entry |
| 7 | `pnpm licenses:check` passes | no | confirmed | 351 packages |
| 8 | A release step refreshes it, with refusals | no | confirmed | `package.json`, CONTRIBUTING, release.md, tests |
| 9 | A throwaway address refused with *Any domain* | no | partly | `bot@mailinator.com.` and `"bot@mailinator.com "` → allowed |
| 10 | An allow list ignores the throwaway list | no | confirmed | mutation → fails |
| 11 | Honeypot and fast post are bots | no | confirmed | mutations → fail |
| 12 | Wrong answer and expired challenge refused | no | confirmed | mutations → fail |
| 13 | Too many tries, on 109's limiter | no | confirmed | 4 databases |
| 14 | A real solve accepted | no | confirmed | test |
| 15 | Under 1.5 s in the e2e browser | yes | partly | read only (Playwright not run, as asked); Node worst case 534 ms |

**Overall:** not met (rows 9, 15).

### Adversarial pass

Witnessed: 2026-11-21 18:10 EST, by a fresh agent (adversarial). Commit: 27410ba1 + working-tree diff. Machine: macOS 27.2.1, Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A changed or foreign challenge refused | no | partly | `signature + "0"`, `+ "0zz"`, upper case → `ok` (Node's hex decoder); extra keys accepted |
| 2 | A replay refused, racing on warm connections | no | confirmed | 64 concurrent takes × 5 rounds on 4 databases |
| 3 | 10-minute expiry | no | confirmed | — |
| 4 | Out-of-range or malformed answers refused | no | confirmed | — |
| 5 | Salt and number random; the check cheap | no | confirmed | no test pins the randomness |
| 6 | The solver; under 1.5 s in the e2e browser | no | partly | Node 557 ms; Playwright not run |
| 7 | The stamp | no | confirmed | same hex malleability, no effect |
| 8 | The honeypot | no | confirmed | — |
| 9 | Throwaway refused, subdomains included | no | partly | trailing dot, `0-mailer.dynv6。net`, `ｍailinator.com` → allowed |
| 10 | An allow list exact; `*` literal; empty closed | no | confirmed | — |
| 11 | The limits match the spec | no | confirmed | windows and names untested |
| 12 | The module is the script's output for the commit | no | confirmed | regenerated == bundled |
| 13 | The refresh refuses dangerous lines | no | partly | `co.uk`, `com.br`, `github.io`, `yahoo.co.uk`, `outlook.fr` accepted |
| 14 | Licence and notices | no | confirmed | `main()` adding the data untested |
| 15 | Tests fail when a rule is removed | no | partly | fixed salt, fixed number, a limit's window, a shared limit name, the notices' data survive |

**Overall:** not met (rows 1, 6, 9, 13, 15).

Fixes after both passes:
- Signatures: a challenge's and a stamp's signature must be exactly 64 lower-case hex digits before they're compared; an answer must carry exactly Ronne's fields.
- Domains: read as mail delivery does (`deliveryDomain`: trimmed, IDNA through `node:url`'s `domainToASCII`, lower-cased, trailing dots dropped; "" refuses), for the throwaway list and an allow list alike.
- The refresh refuses a wider list of real providers and a list of shared suffixes (`co.uk`, `com.br`, `github.io`, …); the bundled list has none (its `co.cc` and `gob.re` are throwaway services listed upstream on purpose).
- Tests: altered signatures and stamps, extra fields, full-width and ideographic look-alikes, trailing dots and spaces, fresh salts and varied secret numbers, each limit's window and distinct name, `noticeFileEntries` ending with the bundled data. Rerun by the implementer: removing the canonical-hex check, the IDNA step, the random salt, the random number or the field check each fails a test (files restored, `cmp`).

### Re-check (blind)

Witnessed: 2026-11-21 18:08 EST, by a fresh agent (blind; the earlier passes and their fixes were in WITNESS.md, which it read). Commit: 27410ba1 + working-tree diff. Machine: macOS (Darwin 27.2.0), Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm licenses:check` | no | confirmed | 351 packages |
| 2 | The notices test covers the list | no | confirmed | mutation → fails |
| 3 | The refresh refuses providers, suffixes, short lists; the list clean | no | confirmed | probe; mutation → 2 fail |
| 4 | Throwaway refused with trailing dot, space, full-width, ideographic stop | no | confirmed | probe of 19 forms; mutations → fail |
| 5 | An allow list ignores the throwaway list; exact | no | confirmed | mutation → fails |
| 6 | Honeypot | no | confirmed | mutation → fails |
| 7 | Fast post | no | confirmed | mutation → fails |
| 8 | Wrong answer | no | confirmed | mutation → fails |
| 9 | Expired challenge | no | confirmed | mutation → fails |
| 10 | Changed or unsigned challenge, canonical hex | no | confirmed | mutations → fail |
| 11 | Replay, racing | no | confirmed | 4 databases; mutation → fails |
| 12 | The limits, counted apart | no | confirmed | 4 databases; mutations → fail |
| 13 | A real solve; random salt and number | no | confirmed | mutations → fail |
| 14 | Under 1.5 s in the e2e browser | no | confirmed | `playwright test e2e/sign-up-challenge.e2e.ts --project chromium` ×3 → 188 / 190 / 192 ms |

**Overall:** met. Remarks: removing `.trim()` in `deliveryDomain` survived (only a spaced allow-list entry needs it); the timing runs on the page's thread (the worker is task 5's).

### Re-check (adversarial)

Witnessed: 2026-11-21 18:08 EST, by a fresh agent (adversarial). Commit: 27410ba1 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Only canonical lower-case hex signatures | no | confirmed | probe; mutations → fail |
| 2 | Exactly Ronne's fields | no | confirmed | `__proto__`, strings, arrays refused |
| 3 | Throwaway can't be slipped past | no | confirmed | 30+ forms |
| 4 | An allow list read as delivery reads it | no | partly | `deliveryDomain(listed)` → `listed` survives; URL syntax maps to a bare domain (task 5's address check) |
| 5 | The refresh refuses suffixes and providers | no | not met | `gouv.fr`, `qc.ca`, `gov.br`, `yahoo.com.br`, `hotmail.ca`, `mail.com` … accepted |
| 6 | Each limit apart, an hour | no | confirmed | mutations on the servers |
| 7 | Replay on every dialect | no | confirmed | — |
| 8 | Notices carry the data | no | confirmed | — |
| 9 | No cost attack | no | partly | `isThrowawayDomain` quadratic in labels: 60,000 characters 3 s |

**Overall:** not met (rows 4, 5, 9).

Fixes after both re-checks:
- The refresh refuses a wider provider list (country domains of the big providers, Brazil's and Canada's providers, `mail.com`), more shared suffixes (`s3.amazonaws.com`, `eu.org`, …), and any two-label line shaped like a country's second-level suffix (`gouv.fr`, `qc.ca`, `com.br`) except the five upstream carries on purpose (`KNOWN_LISTED`); it prints every line added and removed for the refresh's pull request. The Public Suffix List (MPL-2.0) would be complete; it needs an exception, raised with the owner.
- `deliveryDomain` refuses a name longer than 253 characters (and input over 1,024) before any work; a test checks 60,000 characters are refused within 200 ms.
- Tests: root's allow-list entries normalised (`EXAMPLE.com.`, full-width, ideographic stop) and spaced. Rerun by the implementer: removing the length cap or `deliveryDomain(listed)` each fails a test (files restored).
- Plan Notes: task 5 checks the address with 106's rules before the guard.

### Re-check 2 (blind)

Witnessed: 2026-11-21 18:20 EST, by a fresh agent (blind). Commit: 27410ba1 + working-tree diff. Machine: macOS 27.2.1, Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm licenses:check` | no | confirmed | 351 packages |
| 2 | The notices test | no | confirmed | 9 passed |
| 3 | The bundled list valid | no | confirmed | `--check` → 10455, valid |
| 4 | Throwaway refused with *Any domain*; ignored with an allow list | no | confirmed | 20 passed on SQLite |
| 5 | Honeypot, fast post, wrong, expired, replay, too many tries; a real solve | no | confirmed | SQLite and PostgreSQL |
| 6 | Under 1.5 s in the e2e browser | no | can't check here | not rerun as asked; the solver unchanged since the 188–192 ms runs |
| 7 | The 253-character cap tested | no | confirmed | mutation → fails |
| 8 | The 1,024-character refusal tested | no | partly | removing it → 16/16 pass; its comment claims more |
| 9 | An allow-list entry normalised, tested | no | confirmed | mutations → fail |
| 10 | The wider refresh checks tested | no | confirmed | mutations → fail |

**Overall:** not met (row 8).

### Re-check 2 (adversarial)

Witnessed: 2026-11-21 18:16 EST, by a fresh agent (adversarial). Commit: 27410ba1 + working-tree diff. Machine: macOS (Darwin 27.2.0), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests and `--check` pass | no | confirmed | 20 and 4 passed; 10455 valid |
| 2 | The refresh refuses provider country domains, suffixes, suffix-shaped lines | no | confirmed | probe; mutation → fails |
| 3 | It prints the lines it adds and removes | no | confirmed | `main()` with a stubbed fetch |
| 4 | What a hand-built check misses is stated, left to the owner | no | confirmed | `us.com`, `myshopify.com`, `nhs.uk`, `yahoo.co.jp` pass; PLAN.md says so |
| 5 | A crafted domain costs nothing | no | confirmed | every shape under 1 ms; mutation → fails |
| 6 | An allow-list entry normalised, tested | no | confirmed | mutations → fail |

**Overall:** met. Remarks: `mooo.com` is a shared host upstream lists; a suffix in both checks was named twice; the 1,024 refusal untested.

Fixes after re-check 2: a test refuses `a@acme.com` followed by 2,000 dots against an allow list of `acme.com` (removing the 1,024 refusal now fails it; rerun by the implementer, file restored) and its comment says what it does; a refusal names each suffix once; the plan's Notes list what the hand-built check misses, `mooo.com` included, for the owner.

### Re-check 3 (blind)

Witnessed: 2026-11-21 19:09 local time, by a fresh agent (blind, a third round at the owner's request). Commit: 27410ba1 + working-tree diff. Machine: macOS (Darwin 27.2.0), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `deliveryDomain` refuses input over 1,024 characters first | no | confirmed | `sign-up-guard.ts:57`, before `trim` and `domainToASCII` |
| 2 | Its comment says what the code does | no | confirmed | lines 55-56 against 57 and 59 |
| 3 | A test fails without the refusal | no | confirmed | line 57 removed → "refuses a name longer than a domain can be, at once" fails |
| 4 | `sign-up-guard.test.ts` passes | no | confirmed | 16 passed |
| 5 | `disposable-domains.test.js` passes | no | confirmed | 4 passed |

**Overall:** met. With re-check 2 (adversarial) met, both latest passes are met. Process note: the witness ran its one mutation on the repository file, not a scratch copy, and restored it (`cmp` identical, `git status` unchanged); the implementer confirmed the file is identical to its own copy from before the pass.

## Task 4 — Settings panel

### Blind pass

Witnessed: 2026-11-21 19:52 EST, by a fresh agent (blind). Commit: 6a988a23 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The panel is on the Authentication tab, root only | no | confirmed | `AuthenticationTab.tsx` panel `self-registration`; `requirePermission(…, "settings.manage")`; "is root's only" passes |
| 2 | The switch is disabled with its reason and a link, without email, the contact, or with *Root only* | no | confirmed | `disabled={!ready && !enabled}`, a Notice per blocker with its link; removing `disabled` → the component test fails |
| 3 | The server refuses to turn it on for each blocker | no | confirmed | `SignUpUnavailableError`; db test loops mail, contact, password; mutation → fails; *Root only* read as sign-in reads it, tested with and without a provider |
| 4 | Component tests cover each field | no | partly | every default and the domain mode checked; no test ties the field names to the save: renaming `approval`/`challenge` → all green |
| 5 | **Ask everyone to accept again** only when the version changes | no | confirmed | component test types a new version and back; mutation → fails; server moves `termsRequiredVersion` only with `askAgain` |
| 6 | Code lifetime 5–60 | no | confirmed | 4, 61, 7.5 refused; mutation → fails |
| 7 | A bad domain is refused, exact matching | no | confirmed | `*.acme.com`, `acme`, empty, 101 refused; IDNA and trailing-dot probes |
| 8 | A non-HTTPS link is refused | no | confirmed | `http://`, `user:pw@`, `javascript:` refused; mutation → fails |
| 9 | Saving and the audit row with before and after | no | confirmed | one `settings.sign_up_changed` row with `from`/`to`; a same save records nothing; removing `recordAudit` → fails |
| 10 | The db test passes on every database | no | confirmed | SQLite, PostgreSQL, MySQL, MariaDB: 8/8 each |
| 11 | The audit action registered, a sentence in every language | no | confirmed | `audit-event.ts`, `summary.ts`, fixture; sentences, errors, untranslated tests pass |
| 12 | Every screen word a message; tokens only | no | confirmed | `t(...)` throughout; pt/fr no-English test; `src/i18n` 418 passed |
| 13 | Arrow functions; typecheck and lint clean | no | confirmed | `tsc` exit 0; `biome check` no errors |

**Overall:** not met (row 4). Remarks: a closed sign-up blocked every other save; `1.2.3.4`, `https:acme.com/t` and bidi overrides in the version were accepted; the hidden throwaway input lost an untick.

Fixes after the blind pass: the save reads the form only through `signUpInputFrom` (`sign-up-input.ts`), tested from the mounted form's `FormData`; the blockers stop only turning sign-up on; the three inputs are refused; the throwaway box keeps its state.

### Re-check 1 (blind)

Witnessed: 2026-11-21 19:58 EST, by a fresh agent (blind). Commit: 6a988a23 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | Only off → on is blocked; on and closed, the rest saves | no | confirmed | `services/sign-up.ts:118-119`; db test saves `codeMinutes` with email gone; mutation → fails |
| 4 | Each field as the save reads it | no | partly | renaming `approval`, `codeMinutes`, `domains` or the reader's `askAgain` now fails; renaming `challenge` or the throwaway checkbox still passes |
| 7 | IP-like domains refused | no | confirmed | `1.2.3.4` refused; removing the check → fails |
| 8 | Misleading links and versions refused | no | confirmed | `https:acme.com/terms` and U+202E refused; mutations → fail |
| 10 | Every database | no | confirmed | 8/8 on each |
| 13 | Typecheck and lint | no | confirmed | `tsc` exit 0; `biome check` clean |
| R4 | The throwaway untick kept with the list | no | confirmed | new test; mutation → fails |

**Overall:** not met (row 4: `challenge` and the throwaway checkbox).

Fix after re-check 1: a test with every box ticked under *Any domain*, read through `signUpInputFrom`, then the throwaway box unticked.

### Re-check 2 (blind)

Witnessed: 2026-11-21 19:58 EST, by a fresh agent (blind). Commit: 6a988a23 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | Each field as the save reads it | no | confirmed | renaming `challenge` → 1 failed of 10; renaming the throwaway checkbox → 1 failed of 10; earlier mutations still caught |
| 2–3, 5–13, R4 | The rest still holds | no | confirmed | 18 tests passed; `tsc` exit 0; `biome check` clean; no source changed since re-check 1 |

**Overall:** met.

Fix after re-check 2, test only: the pre-commit run failed four tests in `admin-settings.test.tsx`, which mocks the tab's data sources and lacked the new panel's. The test now mocks `settings/actions/sign-up` (`adminSignUpSettings`); `vitest run src/features/admin-settings` → 239 passed (rerun by the implementer). No code the witness checked changed.
