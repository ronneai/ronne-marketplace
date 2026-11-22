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

## Task 5 — Sign-up and code pages [risky]

### Blind pass

Witnessed: 2026-11-21 21:05 EST, by a fresh agent (blind). Commit: 6b1aa881 + working-tree diff. Machine: macOS (Darwin 27.2), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass on SQLite | no | confirmed | `vitest run sign-up.db.test.ts sign-up.test.tsx templates.test.ts` → 62 passed |
| 2 | The db tests pass on the three servers | no | confirmed | `test-db.mjs postgres\|mysql\|mariadb` → 15 passed on each |
| 3 | New address: code by email; nothing in `user` before it; then a `user` in `global` with a personal workspace, verified, its locale, never root; pending row gone; audited; nobody signed in | no | confirmed | db test checks each; `createUserWithPassword` with `role: "user"`; redirect to `/sign-in?email=…&signedUp=ready` |
| 4 | Existing address: same answer, "already have an account" email, no code that works | no | confirmed | db test; `passwordHash: null`, even the issued code is wrong |
| 5 | A disallowed domain is refused at once | no | confirmed | db test, allow list and throwaway |
| 6 | Closed while pending: refused, pending row deleted | no | confirmed | db test; mutation → fails |
| 7 | Two sign-ups racing: one account, the other "exists" | no | confirmed | removing the catch fails 3/3 on PostgreSQL and MySQL; SQLite can't race |
| 8 | An account made meanwhile → "exists" | no | confirmed | db test |
| 9 | A lookalike address never stands beside a real one | no | confirmed | db test refuses five shapes; MySQL probe: same answer, no email, no account |
| 10 | Existing and new paths take the same time | no | confirmed | timing test; hashing only for new → fails |
| 11 | Emails through 189's outbox, in the sign-up's language, no sign-in link | no | confirmed | `queueMail` in the transaction, `mailQueued` after; `locale: "pt"` |
| 12 | The three audit events | no | confirmed | `audit-event.ts`, `summary.ts`; db tests check outcomes |
| 13 | `/sign-up` 404 while off; the link only while open | no | confirmed | `notFound()`; e2e |
| 14 | Cookie-bound code page with CodeInput, resend, Use another email | no | confirmed | HttpOnly, Lax, path `/sign-up`, signed; component and db tests |
| 15 | e2e signs up and signs in, the code from the test transport | no | confirmed | rebuilt; Playwright Chromium → 2 passed |
| 16 | A bot sees the success page, nothing sent | no | partly | nothing sent, but the code page said "This sign-up has ended." |
| 17 | Arrow functions, messages in en/pt/fr, typecheck, lint | no | confirmed | `tsc` exit 0; no-English test passes |

**Overall:** not met (row 16). Remark: the "ask your administrator" wording differs from SPEC until 194.

### Adversarial pass

Witnessed: 2026-11-21 21:10 EST, by a fresh agent (adversarial). Commit: 6b1aa881 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1–12, 14–18 | Enumeration (answers, codes, resend for existing vs new identical, P1), limits, cookie forging, the race, re-checks at creation, challenge replay (1 of 5 racing), ≤5 racing guesses, timing (P7, four databases), the one transaction | no | confirmed | probes P1–P7 on all four databases; mutations M1–M4 each fail a test |
| 13 | A bot sees the success page | no | partly | "This sign-up has ended." |
| 19 | Audit | no | partly | bot rows written before any limit: 50 forged posts → 50 rows; a failed challenge not audited |
| 20 | Every input a clean answer | no | partly | a NUL in the name → PostgreSQL 500 |
| 21 | e2e | no | can't check here | left to the blind witness |

**Overall:** not met. Also: a resend could email a code that never works (an existing account erased meanwhile); `used` read as "wrong"; a refused form solved a challenge with the challenge off.

Fixes after the first passes: a decoy cookie for bots; the per-IP limit first; bot and challenge audits capped at 100 an hour; control, line-break and bidi names refused; resend for an erased account ends the sign-up; `used` reads as `spent`; a new challenge only when on; SPEC wording until 194.

### Re-check 1 (blind)

Witnessed: 2026-11-21 21:15 EST, by a fresh agent (blind). Commit: 6b1aa881 + working-tree diff. Machine: macOS (Darwin 27.2), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 16, 18–21, 23–25, 15, 17 | The decoy page, the fixes above, the e2e, typecheck | no | confirmed | 1326 tests passed; 18 on each server; e2e 3 passed; forged decoys refused |
| 22 | On the decoy page, resend acts as usual | no | partly | the decoy's `issuedAt` never moves: back-to-back resends both answer "resent" |

**Overall:** not met (row 22). Remark: the decoy shows the address as typed, and its code tries aren't counted per IP.

### Re-check 1 (adversarial)

Witnessed: 2026-11-21 21:12 EST, by a fresh agent (adversarial). Commit: 6b1aa881 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 19, 20, 22, 10, 11, 23 | The cap, names, resend, racing tries, replay, the challenge | no | confirmed | P2–P9 on all four databases; mutations M6–M8 fail tests |
| 13 | A bot can't tell it was caught | no | partly | the decoy cookie's shape, its order before the field checks, codes never spent, resend with no wait, a 404 when closed |

**Overall:** not met (row 13).

Fix after re-check 1: the decoy is gone. A bot takes the existing address's path: the same checks and limits, a real pending row with no hash, a real cookie, the normal code page, no email. Resend for a row with no hash and no account sends nothing and answers ok.

### Re-check 2 (blind)

Witnessed: 2026-11-21 21:19 EST, by a fresh agent (blind). Commit: 6b1aa881 + working-tree diff. Machine: macOS (Darwin 27.2), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 16 | A bot goes the existing address's way, no email, no account | no | confirmed | db test; a bot keeping its hash → fails; a bot getting the email → fails; e2e passes |
| 22 | Codes, resend and limits the same for a bot | no | confirmed | probe: person and bot both `wait,ok,wait,ok,limited,req-limited` |
| 26, 21, 27, 15, 25 | Same fields asked; erased account resend sends nothing; decoy code gone; e2e; SPEC | no | confirmed | db tests; `tsc` exit 0; e2e 3 passed |

**Overall:** met.

### Re-check 2 (adversarial)

Witnessed: 2026-11-21 21:18 EST, by a fresh agent (adversarial). Commit: 6b1aa881 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | A bot can't be told apart | no | partly | responses, cookie and limits identical (P10, four databases); but a bot's sign-up ~12 ms faster (P11: it skipped the email) |
| 19 | The audit cap | no | not met | P12, no IP: 150 forged posts → 147 `limited` rows, uncapped |
| 22, 20, 10, 11, 3–9, 12, 14–18, 23 | Unchanged rows | no | confirmed | 19 tests on each database |

**Overall:** not met. Also: a bot's post uses up the address's 3 codes an hour with nothing in the inbox; a bot's resend for an existing address emails its owner.

Owner's decision after two re-checks (AskUserQuestion, 2026-11-21): fix the audit cap and the timing; accept the other two, recorded in SPEC.md under "A bot". Fixes: every outcome but `sent` and `existing` is audited under the cap; a bot's email is rendered and dropped through `rehearseMail` (queuing's reads, no insert); the timing test gained a bot leg.

### Re-check 3 (adversarial)

Witnessed: 2026-11-21 21:36 EST, by a fresh agent (adversarial, a third round at the owner's request). Commit: 6b1aa881 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 19 | Every refused outcome under the cap | no | confirmed | P12 on four databases, twice: 100 rows; `sent` recorded outside the cap; no cap → two tests fail |
| 13 | A bot can't be told apart by any response, cookie, limit or timing | no | confirmed | P10 identical; P11 medians bot/existing/new: PostgreSQL 28.7/29.1/28.6, MySQL 27.7/28.4/28.2 |
| 24 | The timing test guards the bot leg | no | partly | removing `rehearseMail` → still passes (a 22% gap on PostgreSQL, under the 35% tolerance) |

**Overall:** not met (row 24, test strength).

Fix after re-check 3, test only: "writes a bot's email and does queuing's reads, then drops it" checks a bot's sign-up calls `rehearseMail` once with the code email and a person's queues.

### Re-check 4 (adversarial)

Witnessed: 2026-11-21 22:18 EST, by a fresh agent (adversarial, a fourth round at the owner's request). Commit: 6b1aa881 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests pass on four databases | no | confirmed | 21 passed on each |
| 24 | A test fails when a bot skips the rehearsal | no | confirmed | M12 → the new test fails |
| 25 | The repository's `rehearseMail` does queuing's reads | no | partly | emptying its body → all 21 still pass |

**Overall:** not met (row 25, test strength).

Owner's decision after re-check 4 (AskUserQuestion, 2026-11-21): add a repository test for `rehearseMail`, then a fifth round scoped to it (`pnpm witness:check` needs the latest adversarial pass met). The test, `kysely-sign-up-repository.db.test.ts`, watches the queries through a Kysely plugin: a select on `instance_settings` and on `mail_outbox`, nothing else.

### Re-check 5 (adversarial)

Witnessed: 2026-11-21 22:23 EST, by a fresh agent (adversarial, a fifth round at the owner's request, scoped to rows 21 and 25). Commit: 6b1aa881 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The repository test passes with the service tests on four databases | no | confirmed | 1 passed on SQLite; 22 passed on PostgreSQL, MySQL and MariaDB |
| 25 | `rehearseMail` does queuing's reads and writes nothing; a test fails when it does less | no | confirmed | code unchanged since re-check 4 (`cmp`); M13 (empty) and M14 (no setup read) → the test fails; M15 and M16 pass but keep the timing equal (P11 on PostgreSQL: bot 30.4 / existing 32.3 / new 31.2 ms) |
| 21 | The e2e signs up and signs in, the code from 189's test transport | no | confirmed | `pnpm build`, then Playwright Chromium → 3 passed (sign up and sign in; a bot sees the same code page and gets no email; 404 while off) |
| 1–24 | Rows confirmed in re-check 4 | no | confirmed | no service or repository code changed; 22/22 on four databases |

**Overall:** met. With re-check 2 (blind) met, both latest passes are met.

Fixes after re-check 5, from the pre-commit run's guard tests: `e2e/pages.ts` lists `/sign-up` and `/sign-up/code`, skipped by the sweep (open only while sign-up is on; `sign-up.e2e.ts` covers them); the honeypot field takes `inputClasses` (the touch rule); the four sign-up actions no longer run while a signed-in person is held (they're for people not signed in, and `server-action.test.ts` lists which actions may). `vitest run` on those three guard tests and `src/features/sign-up` → 60 passed (rerun by the implementer). No service or repository code changed.

## Task 6 — Accepting new terms [risky]

### Blind pass

Witnessed: 2026-11-21 22:38 EST, by a fresh agent (blind). Commit: fad757d6 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Sign-up writes a `terms_acceptances` row | no | confirmed | `kysely-sign-up-repository.ts` `createAccount`; `sign-up.db.test.ts` checks it |
| 2 | Each acceptance one row, audited; concurrent submits one row | no | confirmed | `terms.db.test.ts`; mutations M2, M3 → fail |
| 3 | A ticked change holds; an unticked one doesn't | no | confirmed | db tests; M1 (never held) → 5 of 7 fail |
| 4 | Unticked: only new sign-ups accept it | no | not met | probe: 2026-11 ticked, 2026-12 unticked, a sign-up with 2026-12 → held for 2026-11 |
| 5–6 | A password and a provider sign-in held | no | confirmed | db tests, the fake OIDC round trip |
| 7 | Built like the password-change hold, order password → terms → two-factor, only the listed actions open | no | confirmed | `hold.ts`, `server-action.ts`; M4, M5 → fail; 7 open actions pinned |
| 8 | The page: link, required box, Continue, Sign out | no | confirmed | `terms.test.tsx` |
| 9–10 | Tokens work while held; tokens, the API and the device flow untouched | no | confirmed | `authenticateToken` ok; no diff under `src/app/api`, `access-tokens`, `device` |
| 11 | db tests on the three servers | no | confirmed | 7/7 each |
| 12 | An e2e test accepts the new terms | no | confirmed | Playwright Chromium → 1 passed |
| 13 | Typecheck and lint | no | confirmed | `tsc` exit 0; `biome check` clean |

**Overall:** not met (row 4).

### Adversarial pass

Witnessed: 2026-11-21 22:40 EST, by a fresh agent (adversarial). Commit: fad757d6 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1–3, 6, 8, 10, 11 | Rows, races (20 at once → 1 row; without the lock 3 and 5 rows on PostgreSQL and MySQL), the hold's order, tokens, `next` never off-site, wrong versions refused | no | confirmed | probes P3, P5 on four databases; mutations |
| 4 | Ticked and unticked as SPEC says | no | not met | P1, P2 as the blind pass |
| 5 | The hold itself tested | no | confirmed | db tests call `termsToAccept`; `termsHold` → `return false` passes everything but the e2e |
| 7 | Held everywhere a session reaches | no | partly | `/account/data` and `/admin/users/<id>/data` ignore the terms hold |
| 9 | e2e | no | confirmed | by reading `e2e/terms.e2e.ts`; the blind pass ran it |
| 12 | Root changing the version mid-page | no | partly | the stale form keeps the old version |
| 13 | Cheap on every page | no | partly | 9 settings queries per request |

**Overall:** not met. Also: SPEC said "next web sign-in" where the hold applies at once.

Fixes after the first passes: `InstanceTerms` carries `current`; the data routes refuse a held person (`terms_acceptance_required`); `instanceTerms` reads the required version alone first; a `changed` answer reloads `/account/terms?changed=1`; `terms-hold.test.ts`; SPEC wording.

### Re-check 1 (blind)

Witnessed: 2026-11-21 22:46 EST, by a fresh agent (blind). Commit: fad757d6 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | Nobody asked again after an unticked change | no | partly | the first case fixed; a second unticked change holds again (4b, 4c) |
| 2, 3, 12–17 | Rows, data routes, `termsHold`, the reload, e2e, typecheck | no | confirmed | 23/23 on each database; M6–M8 fail tests; e2e passed |

**Overall:** not met (row 4). Remark: the `?changed=1` redirect has no test.

### Re-check 1 (adversarial)

Witnessed: 2026-11-21 22:46 EST, by a fresh agent (adversarial). Commit: fad757d6 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4, 7, 12, 13, 5, 2, 14 | The version rule, the data routes (P10, a held root's real session → 403), the reload, one query with no version asked, `termsHold` tested, rows, SPEC | no | confirmed | probes on four databases; mutations fail tests |

**Overall:** met. Remarks: the redirect untested; the notice may not show without a remount; SPEC lines 35 and 284.

Fixes after re-check 1: any acceptance since root asked counts (`requiredSince`, the required version's setting time); `setSignUpPolicy` writes only changed settings; `key={terms.version}`; `features/terms/actions.test.ts`; SPEC lines 35, 107 and 284.

### Re-check 2 (blind)

Witnessed: 2026-11-21 22:52 EST, by a fresh agent (blind). Commit: fad757d6 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | No one asked again after one or several unticked changes; a ticked one still asks | no | confirmed | probes 4–4f on four databases; M9 → 3 tests fail |
| 18 | Only changed settings are written | no | confirmed | M10 → a test fails |
| 2, 3, 15, 12, 13 | Rows, ticked and unticked, the reload, e2e, typecheck | no | confirmed | 19/19 on each server; M11 → fails; e2e passed |

**Overall:** met. Remark: an old label re-asked doesn't hold people who accepted it before.

### Re-check 2 (adversarial)

Witnessed: 2026-11-21 22:52 EST, by a fresh agent (adversarial). Commit: fad757d6 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4, 15, 16, 7, 12, 14 | The time rule at its edges (P11–P13, P15), the data routes, the reload, SPEC | no | confirmed | four databases; mutations |
| 17 | Continue always gets a held person out | no | not met | P6: accepted 2026-10, root ticks 2026-11, saves 2026-10 unticked → asked for 2026-10, Continue writes nothing, held for ever |

**Overall:** not met (row 17).

Owner's decision after two re-checks (AskUserQuestion, 2026-11-21): fix, then a short third adversarial round. Fix: one check, `acceptedSinceAsked`, for both the hold and Continue: only an acceptance at or after `requiredSince` counts, of the same label included; Continue writes whenever the person is still held, never with a time before `requiredSince`. Two db tests.

### Re-check 3 (adversarial)

Witnessed: 2026-11-21 23:03 EST, by a fresh agent (adversarial, a third round at the owner's request, scoped to row 17). Commit: fad757d6 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 17 | Continue always gets a held person out | no | confirmed | P6, P18–P20, P22 on four databases (a reused label; root's clock ahead; this server behind; a sign-up from a lagging replica; a link removed and re-added): one Continue lets them through. Mutations (dedupe by version, no clamp, an old row counting) each fail a new test |
| — | The rest still holds | no | confirmed | 100 tests on SQLite; 27/27 on each server |

**Overall:** met. With re-check 2 (blind) met, both latest passes are met. Notes: the no-time fallback could trap someone with `required` ≠ `current`, unreachable with the schema (`updated_at` is `NOT NULL`); sign-up records the policy's version at the request, not the one the form showed (task 5's, a follow-up in PLAN.md).

Fix after re-check 3, from the pre-commit run: the telemetry's list of the app's route segments (`server/telemetry/sanitize.ts`) gains `terms`, the new page's segment (`route-segments.test.ts`). `vitest run src/server/telemetry` → 36 passed (rerun by the implementer). No code the witnesses checked changed.

## Follow-up — The sign-up form's terms version

From task 6's witnesses (PLAN.md Notes): sign-up recorded the version at the request, not the one the form showed. Witnessed adversarially, as part of task 5's risky work.

### Adversarial pass

Witnessed: 2026-11-22 00:09 EST, by a fresh agent (adversarial). Commit: 9130c014 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The form posts the version it showed | no | confirmed | hidden `termsVersion`; component test fails without it; no test of the action's wiring |
| 2 | A different version refused with `terms_changed` and the current terms | no | confirmed | probe B: whitespace, case, arrays, objects, null → refused |
| 3 | Terms a form didn't show refused with `terms_changed` | no | not met | probe A: a form drawn before any terms → `terms`, which that form can't show |
| 4 | The form shows the new terms after the refusal | no | partly | lost on the next refusal of another kind |
| 5–7, 9, 11–13 | Nothing written or sent; reveals nothing about an address; no bot path skips it; messages; component test; four databases; e2e | no | confirmed | probes D, E; 22 on each server; e2e 3 passed |
| 8 | The version recorded is the one shown | no | confirmed | a changed link with the same version is accepted (a question for the owner) |
| 10 | A db test covers the two cases | no | partly | the "before any terms" case posts what the real form can't |

**Overall:** not met (rows 3, 4).

Fixes: the version is checked before the box; the action keeps the new terms through later refusals; `features/sign-up/actions.test.ts`; SPEC.md: the version names the document, so a new link with the same version is the same terms.

### Re-check 1 (adversarial)

Witnessed: 2026-11-22 00:13 EST, by a fresh agent (adversarial). Commit: 9130c014 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The form posts the version, and the action passes it on | no | confirmed | `actions.test.ts`; `termsVersion: ""` in the action → 1 failed |
| 3 | Terms a form didn't show refused with `terms_changed` | no | confirmed | probes A, A2, H; the old order → the db test fails |
| 4 | The new terms shown through later refusals | no | confirmed | probe P; dropping `previous.terms` → fails |
| 8 | The version shown is recorded; a new link with the same version is the same terms | no | confirmed | SPEC.md says so; probes C, G |
| 10 | A db test covers both cases as the real form posts them | no | confirmed | fails with the old order |
| 12 | Four databases | no | confirmed | 33 on SQLite; 22 on each server |
| 13 | The sign-up e2e passes | no | confirmed | on a build newer than the edits → 3 passed |

**Overall:** met.

## Task 7 — Approval [risky]

### Blind pass

Witnessed: 2026-11-22 00:30 EST, by a fresh agent (blind). Commit: d3a879cd + working-tree diff. Machine: macOS (Darwin 27.2), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1–4 | Password sign-in, the token exchange and the device flow refuse a waiting account, only after the right password; a wrong one says nothing | no | confirmed | `approval.db.test.ts` 8/8; mutations in `session.ts`, `token-exchange.ts`, `findActiveUser` → fail; upper-case address probe |
| 5 | Roots notified, nobody else | no | confirmed | probe on four databases: one row, root only; link null after a decline |
| 6–8 | Approve, Decline (all its rows, email with no user), the race under a row lock | no | confirmed | four databases; without `forUpdate` the race test fails on PostgreSQL |
| 9 | The race message in the root's language | no | not met | `ApprovalAnsweredError` not in `errors.json` |
| 10–13 | The 30-day decline; approval off keeps waiting accounts; roots only; the filter's query | no | confirmed | 28-day mutation fails; probes |
| 14 | Component tests cover the filter | no | partly | deleting the option passes every test |
| 15–18 | Approve and Decline with confirms in three languages; the spec's change; emails; typecheck | no | confirmed | `approval-dialogs.test.tsx`, `user-page.test.tsx`; snapshots; `tsc` exit 0 |

**Overall:** not met (rows 9, 14).

### Adversarial pass

Witnessed: 2026-11-22 00:37 EST, by a fresh agent (adversarial). Commit: d3a879cd + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1–3, 5–7, 9, 10, 13, 14 | Refusals (timing P8 equal), notifications, approve, decline (nothing else deleted, P1), the race, the job in batches (230 accounts) and without `AUTH_SECRET`, the page's buttons, the spec's change | no | confirmed | probes P1–P8 on four databases; mutations M1–M6 |
| 4 | No other way in | no | partly | no test of the SSO refusal; the linked SSO path and token auth don't check approval (unreachable) |
| 8 | Only roots answer | no | partly | Decline's permission untested |
| 11 | One bad account doesn't stop the job | no | partly | one failure aborts the run and every later one |
| 12 | The filter, with tests | no | partly | option and query untested |
| 15 | The race message translated | no | not met | — |

**Overall:** not met. Also: a declined person's email outlives the decline (audit, notifications), handed to task 8 in PLAN.md.

Fixes after the first passes: `ApprovalAnsweredError` in errors.json (en, pt, fr) with test cases; tests for the filter's option, status cell and query, Decline's permission, the SSO refusal (email and linked), a token made before the mark; the linked SSO path and token auth refuse a waiting account; *Active* excludes waiting accounts; the job makes one pass of at most 1000, logging and skipping one it can't decline.

### Re-check 1 (blind)

Witnessed: 2026-11-22 00:43 EST, by a fresh agent (blind). Commit: d3a879cd + working-tree diff. Machine: macOS (Darwin 27.2), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9 | The race message in the root's language | no | confirmed | `errors.test.ts`; renaming the pt key → fails |
| 14 | Component tests cover the filter | no | confirmed | deleting the option → the new test fails |
| 19–22 | The filter's query, a token from before the mark, SSO both ways, Decline's permission | no | confirmed | four databases; each mutation fails its test |
| 23 | The job logs and skips an account it can't decline | no | confirmed | probe on three databases; no repository test |
| 24 | Affected tests and typecheck | no | confirmed | 182 passed; 53/53 on each server; `tsc` exit 0 |

**Overall:** met.

### Re-check 1 (adversarial)

Witnessed: 2026-11-22 00:43 EST, by a fresh agent (adversarial). Commit: d3a879cd + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | No other way in | no | confirmed | M4a, M4b, M11 each fail a test |
| 8 | Only roots answer | no | confirmed | M9 → fails; P9 on four databases |
| 11 | One bad account doesn't stop the job | no | confirmed | P9 on four databases: one declined, the bad one kept, the next run declines it |
| 12 | The filter, with tests | no | confirmed | M7, M7b, M8 each fail a test |
| 15 | The race message translated | no | confirmed | M12 → fails |
| — | The email kept after a decline | no | confirmed | handed to task 8 (PLAN.md) |
| all | The task's tests on every database | no | confirmed | 62 passed on each |

**Overall:** met. With re-check 1 (blind) met, both latest passes are met.

Fix after re-check 1, test only, from the blind remark: "skips an account the job can't decline, and still declines the others". Making the job rethrow there → it fails (rerun by the implementer, file restored and matched with `cmp`); 11/11 on four databases.

## Task 8 — Data protection [risky]

### Blind pass

Witnessed: 2026-11-22 00:58 EST, by a fresh agent (blind). Commit: 0d2be8e7 + working-tree diff. Machine: macOS (Darwin 27.2.0), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1–3 | The purge deletes pending sign-ups, codes and used challenges a day past their end, no sooner; a dry run counts the same; the sign-up audit emails are cleared at `ipDays` | no | confirmed | `retention-purge.db.test.ts`; mutations (rule to 0, cutoff `now`, `user.declined` dropped) → fail |
| 4 | Erase deletes the person's terms, codes, pending rows at their address, and leaves others' | no | confirmed | `erase-user.db.test.ts`; mutations → fail |
| 5 | Erase leaves nothing of the address in 190's data | no | not met | probe: a root's `user.awaiting_approval` notice keeps `params.email` after erasing |
| 6 | Your data lists `signed_up_at`, `approval_pending_at` and every terms acceptance, oldest first | no | confirmed | export test; mutations → fail |
| 7–8 | A decline deletes the roots' notices; the task 7 finding handled | no | confirmed | approval test; mutation → fails |
| 9 | The Privacy tab's sentence in three languages | no | confirmed | same ICU arguments in all three; tests at 0, 1, 2 |
| 10 | `rmk-server purge` prints the new counts | no | partly | the 30-day declines not printed |
| 11 | Four databases, typecheck | no | confirmed | 69 on each server; `tsc` clean |

**Overall:** not met (rows 5, 10).

### Adversarial pass

Witnessed: 2026-11-22 00:57 EST, by a fresh agent (adversarial). Commit: 0d2be8e7 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1–5, 8, 9, 11 | Cutoff edges to the millisecond on four databases, nothing still needed deleted, 2,345 rows a table in batches, the emails cleared, a decline's notices, the export, the Privacy sentence, the tests | no | confirmed | probes `PROBE edges`, `PROBE batching`, `PROBE prints` |
| 6 | Erase deletes only the person's rows | no | partly | deleting every person's codes passes the test |
| 7 | Erase leaves no personal data 190 writes | no | not met | the roots' awaiting-approval notices keep the address |
| 10 | The `purge` command prints the new counts | no | partly | no line for the 30-day declines |

**Overall:** not met. Also: the cutoff is tested at ±1 s only, so `<=` passes.

Fixes after the first passes: erase also deletes notifications whose subject is the user; the erase test keeps another person's codes; `purgeLines` prints the 30-day declines when there were some (`runPurge` passes them); the purge test keeps a code ending exactly a day before now.

### Re-check 1 (blind)

Witnessed: 2026-11-22 01:00 EST, by a fresh agent (blind). Commit: 0d2be8e7 + working-tree diff. Machine: macOS (Darwin 27.2.0), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | Erase leaves nothing of the address; others' codes stay | no | confirmed | the probe passes; subject filter aimed elsewhere → fails |
| 10 | `purge` prints the declines only when there were some | no | confirmed | `purge.test.ts`; `> 99` → fails |
| 12 | A code ending exactly a day before now is kept | no | confirmed | `<=` → fails |
| 11 | Four databases, typecheck | no | confirmed | 69 on each server; `tsc` exit 0 |

**Overall:** met.

### Re-check 1 (adversarial)

Witnessed: 2026-11-22 01:01 EST, by a fresh agent (adversarial). Commit: 0d2be8e7 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The exact edge of the cutoff | no | confirmed | `<=` on both cutoffs → fails |
| 6 | Erase deletes only the person's rows | no | confirmed | no `where` → fails; probe on four databases (`böb@` kept on MySQL) |
| 7 | No address left in the roots' notices | no | confirmed | probe on four databases; another account's notice kept |
| 10 | `purge` prints the declines | no | confirmed | `purge.test.ts` |
| 11 | Four databases | no | confirmed | 69 on each server |

**Overall:** met. With re-check 1 (blind) met, both latest passes are met.

Fix after re-check 1, test only, from the pre-commit run: `scripts/purge.db.test.ts` expected the purge's old line "Failed sign-ins' emails cleared"; it now expects "Emails typed at failed sign-ins and sign-ups cleared". `vitest run scripts/purge.db.test.ts` → 3 passed (rerun by the implementer). No code the witnesses checked changed.

## Task 9 — Languages

### Blind pass

Witnessed: 2026-11-22 01:09 EST, by a fresh agent (blind). Commit: 913db81f + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The raw-text lint passes | no | confirmed | `pnpm lint` → exit 0 |
| 2 | The translation tests pass | no | confirmed | 29 files, 493 tests passed |
| 3 | Every message 190 adds or changes exists in pt and fr | no | confirmed | probe against `main`: 160 changed keys, none missing |
| 4 | No pt or fr message left in English | no | confirmed | only fr "Code" and "Version", both French; all 160 read |
| 5 | The tests catch a missing key, a wrong placeholder or English left in | no | confirmed | three planted faults → three tests fail |
| 6 | The raw-text lint covers 190's screens | no | confirmed | raw text in four of its files → four plugin errors |
| 7 | The glossary has the new terms | no | confirmed | seven rows; `pnpm docs:check` clean |
| 8 | One term per concept in pt and fr, matching the glossary | no | confirmed | cadastro / inscription, aprovar / recusar, approuver / refuser, código / code, termos / conditions… |
| 9 | The label change leaves nothing pointing at the old text | no | confirmed | grep finds nothing; tests pass |

**Overall:** met. Wording suggestions, applied afterwards: fr "Il est valide pendant {minutes} minutes" (the code page and its email), fr "Ce code n’est plus valide.", pt and fr `actions.approveBody` agreeing with "a conta" / "le compte", fr email "la fenêtre où vous avez demandé ce code" (not gendered), the glossary's pt "fazer o cadastro". `vitest run` on the i18n, sign-up, admin-users and mail templates tests → 579 passed, two snapshots updated (rerun by the implementer).
