# 105 — Witness

Passes by the [state witness](../../knowledge/state-witness.md), newest last.

## Task 1 — The plugin and its tables

Witnessed: 2026-10-16 11:16 EDT, by a fresh agent (blind). Commit: 1df115ca plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `twoFactor({ issuer })` in `createAuth`, before `nextCookies()`, no `otpOptions` | no | confirmed | `better-auth.ts` plugins `[twoFactor({ issuer: TWO_FACTOR_ISSUER, schema: twoFactorSchema }), nextCookies()]`; sign-in answers `twoFactorMethods: ["totp"]` |
| 2 | Migration 0025 adds `user.two_factor_enabled` (not null, false) and `two_factor`, registered | no | confirmed | `0025_two_factor.ts`; `migrations/index.ts`; matches the plugin's `schema.mjs` |
| 3 | `twoFactorSchema` maps the names, and the test catches a wrong mapping | no | confirmed | probe with `locked_until` → `getMigrations` reports it to add |
| 4 | `db/schema.ts` types the table and column | no | confirmed | `TwoFactorTable`; typecheck exit 0 |
| 5 | Migration and schema tests pass on SQLite | no | confirmed | 0025 → 6/6; web suite 2836 passed |
| 6 | `test:db:core` passes on PostgreSQL, MySQL and MariaDB | no | confirmed | 47/47 files on each, exit 0 |
| 7 | Secret and backup codes encrypted with a key from AUTH_SECRET | no | confirmed | plugin `index.mjs:135` `symmetricEncrypt`; `storeBackupCodes: "encrypted"`; probe decrypts both with AUTH_SECRET, another key throws |
| 8 | The HTTP allowlist doesn't grow | no | confirmed | `HTTP_ENDPOINTS` unchanged; every `/two-factor/*` → 404 |
| 9 | No email/SMS codes, no trusted devices configured | no | confirmed | no `otpOptions`, no trust caller |
| 10 | `testAppAuth` needs no change; the knowledge note holds | no | confirmed | built through `createAuth`; `validateSchema: false` |
| 11 | The Notes answer the encryption question | no | confirmed | PLAN Notes, "Encryption" |
| 12 | The Notes' other facts match Better Auth 1.7.7 | no | confirmed | `beginAttempt(5)`, lockout 10 / 900 s, rate limit 3 per 10 s, the sign-in hook, 10 × `XXXXX-XXXXX`, 6 digits, 30 s, window 1 |
| 13 | `lockedUntil` is `lock_expires_at` for restore; the knowledge note says so | no | confirmed | `restore.ts:69`; `docs/knowledge/timestamp-names.md` |
| 14 | Lint and typecheck pass | no | confirmed | exit 0 both (warnings only) |

**Overall:** met. Weaknesses: the secret's encryption check couldn't fail (it looked for the base32 form); an unused import in the test.

Witnessed: 2026-10-16 11:17 EDT, by a fresh agent (adversarial). Commit: 1df115ca plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Plugin placed before `nextCookies()`, TOTP only | no | confirmed | `better-auth.ts:119-126`; probe `twoFactorMethods: ["totp"]` |
| 2 | Existing rows get two-factor off | yes | confirmed | test passes on 4 kinds; mutation `defaultTo(true)` fails it |
| 3 | FK cascades on every dialect | no | confirmed | passes on 4; mutation without cascade fails |
| 4 | snake_case names match the plugin | yes | confirmed | `getMigrations` empty on 4; dropping a mapping fails 6 tests |
| 5 | Tests pass on SQLite | no | confirmed | 6/6 |
| 6 | `test:db:core` on the three servers | no | confirmed | 260/263/263 passed, exit 0 |
| 7 | Web suite on SQLite | no | confirmed | 2836 passed |
| 8 | Encrypted with AUTH_SECRET | yes | confirmed | `crypto/index.mjs` XChaCha20-Poly1305, key SHA-256; mutation `"plain"` fails the test |
| 9 | Neither secret nor codes reach logs, console or audit | no | confirmed | probe on 4 kinds: none (and no lines at all) |
| 10 | No new HTTP route | yes | confirmed | every plugin path and variant → 404; but adding a route to the allowlist left its test green |
| 11 | Sign-in unchanged without two-factor | no | confirmed | after-hook returns early; one 401 for wrong, unknown, disabled |
| 12 | A disabled user gets no session through the second step | yes | confirmed | probe on 4 kinds, TOTP and backup code |
| 13 | Remember me survives the second step | yes | confirmed | Max-Age absent / 2592000 |
| 14 | Limits 5 per challenge, 10 → 15 min lock, reset on success | yes | confirmed | `verify-two-factor.mjs`; test on 4 |
| 15 | Backup and restore round-trip a two-factor row | yes | confirmed | probe copies of restore tests across all kinds |
| 16 | One `two_factor` row per user | no | partly | 5 concurrent enrolments → 4 rows (SQLite), 5 (MySQL): the index isn't unique |
| 17 | Lint and types | no | confirmed | an unused import in the test |
| 18 | Notes: the plugin indexes `secret`, we don't | yes | confirmed | `schema.mjs`; only `two_factor_user_id_idx` |
| 19 | Notes: `locked_until` would fail restore's naming test | yes | confirmed | mutation fails on PostgreSQL |
| 20 | Notes: the sign-in challenge | yes | confirmed | after-hook, 600 s cookie, verification row |
| 21 | Notes: codes, window, versioned secrets | yes | confirmed | `backup-codes`, `totp`, `otp.mjs`, `$ba$` |
| 22 | Notes: the plugin's rate limit covers only its routes | yes | confirmed | `index.mjs` rateLimit |

**Overall:** not met: row 16. Also found: the spec's restore edge case is wrong (restore writes a new `AUTH_SECRET` by default); `BETTER_AUTH_SECRETS` would replace AUTH_SECRET; no test pins the allowlist; the unused import; Better Auth accepts a TOTP code again within its window.

### Re-check — after the fixes

Witnessed: 2026-10-16 11:27 EDT, by a fresh agent (blind). Commit: 1df115ca plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The test decrypts the stored secret with AUTH_SECRET; another key throws | yes | confirmed | `0025_two_factor.db.test.ts:205-212`; passes on 4 kinds |
| 2 | The unused import is gone | yes | confirmed | `pnpm lint` exit 0, no 0025 diagnostic |
| 3 | `two_factor_user_id_idx` is unique | yes | confirmed | `.unique()` in 0025 |
| 4 | A second row for a user is refused on every database | yes | confirmed | passes on 4; non-unique probe accepted a second row on SQLite and PostgreSQL |
| 5 | Five concurrent enrolments leave one row matching a handed-out URI | yes | confirmed | passes on 4; without unique: 3 rows (SQLite), 5 (PostgreSQL) |
| 6 | The test pins the allowlist and checks `/two-factor/*` | yes | confirmed | `better-auth-http.db.test.ts`; passes on 4 |
| 7 | Lint and typecheck | no | confirmed | exit 0 both |
| 8 | SQLite suite | no | confirmed | 2838 passed |
| 9 | `test:db:core` on the three servers | no | confirmed | 47/47 each, exit 0 |

**Overall:** met.

### Re-check — after the fixes (adversarial)

Witnessed: 2026-10-16 11:27 EDT, by a fresh agent (adversarial). Commit: 1df115ca plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 16 | One `two_factor` row per user | yes | confirmed | 3 rounds × 8 concurrent enrolments → 1 row each on 4 kinds; dropping `.unique()` fails both tests |
| 23 | The kept row matches a URI one request returned | yes | confirmed | exactly one match per round on 4 kinds |
| 24 | The encryption test decrypts with AUTH_SECRET | yes | confirmed | `:205-212`; passes on 4 |
| 25 | The allowlist is pinned | yes | confirmed | the earlier mutation now fails the test |
| 26 | The unused import is gone | yes | confirmed | `biome check` → no diagnostics |
| 27 | Suites pass | no | confirmed | web 2838 passed; servers green (one MariaDB `dropStaleTestDbs` failure while another witness shared the server, passing on rerun 10/10, file untouched) |
| 28 | SPEC's restore edge case is accurate about `run-restore.ts` | yes | confirmed | `:358-376`, `:380-398` |
| 29 | SPEC: double enrolment → the loser is told "started in another tab" | yes | partly | on PostgreSQL 8/8 succeed and 7 URIs don't match: a later request rewrites the unverified row, so there's no error to map |
| 30 | `BETTER_AUTH_SECRETS` would replace AUTH_SECRET | yes | confirmed | `create-context.mjs:70-77` |
| 31 | Better Auth accepts a TOTP code twice | yes | confirmed | `otp.mjs:42-50`, no record of used steps |

**Overall:** not met: row 29 (the spec's wording; code and migration need nothing more). Also: an archive with no `AUTH_SECRET` isn't covered by the restore plan; the MySQL duplicate-key message names the user id.

### Re-check — row 29 and the restore edge case (adversarial)

Witnessed: 2026-10-16 11:28 EDT, by a fresh agent (adversarial). Commit: 1df115ca plus the uncommitted working tree (since the last pass only SPEC.md and PLAN.md changed). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 29 | SPEC's double-enrolment edge case describes the race: one row, several successes each with its own QR code (a later one rewrites the unverified row), some refused by the index | yes | confirmed | matches 3 rounds × 8 concurrent enrolments on 4 kinds (one matching URI each); `index.mjs` `existingTwoFactor` → `adapter.update`; the database's message names the user id on MariaDB too (since reworded) |
| 29b | PLAN task 3 carries it: serialised, read back and compared, the "another tab" error, a test that every QR code shown verifies | yes | confirmed | `PLAN.md:29-34` |
| B | SPEC's restore edge case is accurate and covers an archive with no `AUTH_SECRET` | yes | confirmed | `run-restore.ts:358-376`, `:396-398`; "invalid tag" with no status under another key |
| Bb | PLAN task 7 carries it | yes | confirmed | `PLAN.md:62-63` (its Done when now names the archive with no secret) |

**Overall:** met.

## Task 2 — QR code

Witnessed: 2026-10-16 11:31 EDT, by a fresh agent (blind). Commit: 3978cf61 plus the uncommitted diff (`apps/web/package.json`, `pnpm-lock.yaml`, `identity/models/qr.ts`, `qr.test.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm licenses:check` passes | no | confirmed | 322 packages, all allowed; `MIT uqr ['0.1.3']` |
| 2 | `pnpm audit --audit-level high` passes | no | confirmed | "No known vulnerabilities found", exit 0 |
| 3 | §1: the whole install tree is allowed | yes | confirmed | `uqr@0.1.3` has no dependencies; the lock adds only it |
| 4 | §2: latest stable, pinned exactly | yes | confirmed | latest = 0.1.3; `"uqr": "0.1.3"` |
| 5 | Older than `minimumReleaseAge` | yes | confirmed | 4320 min; released 2026-04-03 |
| 6 | No install scripts | yes | confirmed | `npm view uqr@0.1.3 scripts` → none of pre/post/install |
| 7 | Lockfile consistent; trust policy holds | no | confirmed | `pnpm install --frozen-lockfile --offline` passes; no version has attestations |
| 8 | §3 health, advisories, weight | yes | confirmed | osv.dev empty; unjs, two maintainers; 6,085,278 downloads last week; 79,278 B |
| 9 | `qrSvg(uri)` in the identity domain returns an SVG string | no | confirmed | `qr.ts:14-15` |
| 10 | Drawn on the server, never sent to a third party | no | confirmed | uqr has no network code (only the SVG namespace URL); no caller yet (task 4) |
| 11 | The SVG is a valid QR code that decodes back to the URI | no | confirmed | a decoder without uqr round-trips 7 URIs (up to v15, Unicode, mixed blocks); Reed-Solomon valid; ECC M |
| 12 | Done when: a test decodes the matrix back to the URI, or compares a golden file | yes | partly | the test compares with uqr's own `encode()` only: both on `uri.slice(0, -1)` still passes |
| 13 | Test, typecheck, lint | no | confirmed | 4 passed; clean |
| 14 | ECC M, 4-module quiet zone | yes | confirmed | decoder: `ecc M`, `border 4` |
| 15 | Black on white, sized by `viewBox` | yes | confirmed | no width or height on `<svg>` |
| 16 | The notes describe the test | yes | confirmed | accurate, but short of the Done when (row 12) |

**Overall:** not met: row 12.

### Re-check — row 12

Witnessed: 2026-10-16 11:35 EDT, by a fresh agent (blind). Commit: 3978cf61 plus the uncommitted diff (now with `__golden__/qr-golden.txt`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 12 | A test checks the drawing against a golden file that really is a QR code of the URI | yes | confirmed | `qr.test.ts:28-31`; an SVG built from the file alone decodes (no uqr) to exactly `GOLDEN_URI`: v7, ECC M, mask 2, border 4, Reed-Solomon valid |
| 12a | It catches a library encoding the wrong text | yes | confirmed | both calls on `uri.slice(0, -1)` → the golden test fails |
| 12b | It catches the wrong error correction | yes | confirmed | `ecc: "L"` → fails; `border: 2` → the golden and quiet-zone tests fail |
| 12c | The unchanged code passes; lint and typecheck clean | no | confirmed | 5 passed; no diagnostics; no type errors |

**Overall:** met.

## Task 3 — Enrol, regenerate, turn off

Witnessed: 2026-10-16 11:43 EDT, by a fresh agent (blind). Commit: d0a5928f plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Services and actions for enrol, confirm, regenerate and turn off over `auth.api` | no | confirmed | `services/two-factor.ts`; the store calls `enableTwoFactor`/`verifyTOTP`/`generateBackupCodes`/`disableTwoFactor` (names differ from the plan's) |
| 2 | Starting needs the password; a wrong one changes nothing | no | confirmed | test; a 1,000,000-character password → `wrong_password`, no hashing |
| 3 | A wrong or junk first code changes nothing, unaudited | no | confirmed | test; full-width digits → `wrong_code` |
| 4 | Start gives URI, SVG and 10 codes; confirm turns it on, replaces the session, audited | no | confirmed | tests |
| 5 | Backup codes aren't returned again; status gives a count | no | confirmed | only start and regenerate return codes (the start returns them before the first code) |
| 6 | Regenerate: password, 10 new, old void, audited | no | partly | a double click → two sets returned, only the second valid, 2 audit rows |
| 7 | Turn off: password and a code, record deleted, audited; a wrong password keeps the backup code | no | confirmed | tests |
| 8 | Wrong passwords and codes are limited | no | not met | max 2: after `rate_limited`, the right password and the right TOTP still succeed (`limited()` only labels failures) |
| 9 | Refusals are `TwoFactorError`s | no | partly | none exists; refusals are result codes |
| 10 | No secret in logs or audit, tested | no | confirmed | test; mutation adding `uri` to a log event fails it |
| 11 | Enrolment serialised per person | no | confirmed | `oneAtATime`; untested (removing it keeps 18/18 green) |
| 12 | The read-back before answering | no | confirmed | `holds()`; untested |
| 13 | A lost unique-index race → `another_tab` | no | confirmed | 8 raced `begin` → `ok`/`another_tab`, 1 row, 4 kinds |
| 14 | A start racing a confirm is answered | no | not met | `Unauthorized` thrown 38–40 of 40 on 4 kinds |
| 15 | Confirm takes the shown URI; replaced → `replaced` | no | confirmed | tests; 100 races per kind, 0 `wrong_code` |
| 16 | Several at once: one confirms, others told replaced | no | partly | only one `on` asserted; others got `not_signed_in` |
| 17 | The Done when's db tests | no | confirmed | 18 tests |
| 18 | Each change audited once | no | partly | double confirm, turn-off and regenerate audit twice |
| 19 | SSO-only can't enrol | no | confirmed | test |
| 20 | Turning off allowed under a policy | no | confirmed | no policy check (task 6 holds people) |
| 21 | Audit actions registered with summaries | no | confirmed | `audit-event.ts`, `summary.ts` |
| 22 | Tests on 4 kinds | no | confirmed | 31 / 26 passed |
| 23 | Lint, typecheck, web suite | no | confirmed | 2868 passed |

**Overall:** not met: rows 6, 8, 9, 14, 16, 18.

Witnessed: 2026-10-16 11:54 EDT, by a fresh agent (adversarial). Commit: d0a5928f plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Start with the right password: URI, SVG, 10 codes, nothing active | no | confirmed | 18 passed on 4 kinds |
| 2 | Wrong password or junk code changes nothing | no | confirmed | same |
| 3 | Confirm: on, audited, session replaced | yes | confirmed | old session `null`, new works (P4) |
| 4 | Turn off: password and code, record deleted, audited, session replaced | yes | confirmed | P4 |
| 5 | A wrong password never uses a backup code | yes | confirmed | `services/two-factor.ts:222` |
| 6 | Regenerate | no | confirmed | tests |
| 7 | The limit stops guessing | yes | not met | P1, P2: right password and right TOTP succeed after `rate_limited` |
| 8 | Signed out, disabled, another user can't act | no | confirmed | P3 |
| 9 | Starts serialised; one row | yes | confirmed | untested (M2) |
| 10 | Read-back → `another_tab` | yes | confirmed | untested (M1) |
| 11 | Unique-index race → `another_tab` | yes | confirmed | P7 |
| 12 | `isUniqueViolation` | yes | confirmed | tests on 4 kinds |
| 13 | Replaced → `replaced`, never `wrong_code` | yes | partly | P5: 2 of 80 races answered `wrong_code` |
| 14 | Several at once: others told replaced | yes | partly | others `not_signed_in` |
| 15 | A confirm racing a start in another browser leaves a consistent state | no | not met | P5, P12: "on" with the other secret stored; locked out on PG and MySQL |
| 16 | Better Auth's refusals don't escape | no | not met | 25 of 25 `APIError: Unauthorized` |
| 17 | A double confirm turns it on once | no | partly | 3 on, 3 audit rows, extra sessions |
| 18 | No secret in logs or audit | no | confirmed | test; P11 |
| 19 | Audit actions and log events | yes | confirmed | typecheck |
| 20 | Web suite | no | confirmed | 2868 passed |

**Overall:** not met: rows 7, 13, 15, 16, 17. Also: a TOTP code used to confirm also turns it off (for task 5); the Done when was weakened (for the owner).

### Re-check — after the fixes

Witnessed: 2026-10-16 12:03 EDT, by a fresh agent (blind). Commit: d0a5928f plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The limit is consumed before every check; a right guess refused once reached | yes | confirmed | `limited()` before each check; tests for start and turn-off; probes for confirm and regenerate (untested) |
| 2 | All four changes share the queue and re-read the session | yes | confirmed | `asSignedIn`; removing the queue fails 4 tests |
| 3 | Double confirm once | yes | confirmed | 1 audit, 1 session |
| 4 | Double regenerate: one set; `just_made` | yes | confirmed | test |
| 5 | Double turn-off once | yes | confirmed | test |
| 6 | Start racing confirm answers, one and two browsers | yes | confirmed | tests; 100 probes per kind, 0 thrown |
| 7 | 401 → `signed_out` | yes | confirmed | untested |
| 8 | Several at once: every answer asserted | yes | confirmed | test |
| 9 | Read-back tested | yes | confirmed | mutation fails it |
| 10 | Plan text | yes | confirmed | PLAN task 3 |
| 11 | Done when | yes | confirmed | 24 tests |
| 12 | Earlier behaviour holds | no | confirmed | same tests |
| 13 | 4 kinds | yes | confirmed | 37 / 32 passed |
| 14 | Lint, typecheck, suite | yes | confirmed | 2874 passed |

**Overall:** met.

### Re-check — after the fixes (adversarial)

Witnessed: 2026-10-16 12:10 EDT, by a fresh agent (adversarial). Commit: d0a5928f plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Right password refused once the limit is reached | yes | confirmed | P1 on 4 kinds |
| 2 | Right TOTP or backup code refused at turn-off; no code used | yes | confirmed | P2 |
| 3 | The normal flow fits the limit | yes | partly | P15: a reload and a typo fill 5 a minute; regenerate, turn off and sign-in then `rate_limited` |
| 4 | Confirm racing a start in another browser stays consistent | yes | confirmed | P5, P12 |
| 5 | Same browser: answers, never throws | yes | confirmed | P5 |
| 6 | Shared queue, session re-read | yes | confirmed | queue removed → 4–5 tests fail |
| 7 | Double confirm once | yes | confirmed | P6 |
| 8 | Double turn-off once | yes | confirmed | test |
| 9 | 401 → `not_signed_in` | yes | confirmed | P17; untested |
| 10 | `just_made` | yes | confirmed | test |
| 11 | Several at once | yes | confirmed | P13 |
| 12 | Read-back | yes | confirmed | P14 |
| 13 | Unique-index race | no | confirmed | P7 |
| 14 | Happy paths, disabled users, sessions | no | confirmed | 32/32 on 4 kinds |
| 15 | No secrets | no | confirmed | P11 |
| 16 | Suite, typecheck, lint | no | confirmed | 2874 passed |

**Overall:** not met: row 3.

### Re-check — the limit, and the owner's "same setup" (blind)

Witnessed: 2026-10-16 12:17 EDT, by a fresh agent (blind). Commit: d0a5928f plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Starting again shows the same setup | yes | confirmed | test; mutation fails it |
| 2 | `startOver` makes a new one; old page `replaced` | yes | confirmed | tests; 60 pages per kind, 0 `wrong_code` |
| 3 | The limit checked before every check; a right one refused once full | yes | confirmed | tests for all four steps |
| 4 | Only failures count; ordinary setup within the real limit | yes | confirmed | test; `check`→`consume` mutation fails 5 |
| 5 | `check`/`record`; `consume` unchanged | yes | confirmed | `sign-in-models.test.ts` |
| 6 | `appName` makes the URIs agree | yes | confirmed | probe |
| 7 | One at a time; double clicks once; `just_made` | yes | confirmed | queue removed → 5 fail |
| 8 | Races answer, never throw | yes | confirmed | tests and probes |
| 9 | Lost setup → `another_tab` | yes | confirmed | test |
| 10 | Confirm takes the shown URI | yes | confirmed | test |
| 11 | Done when | yes | confirmed | 31 tests |
| 12 | Earlier behaviour | no | confirmed | same tests |
| 13 | 4 kinds | yes | confirmed | 53 / 39 passed |
| 14 | Lint, typecheck, suite | yes | confirmed | 2883 passed |

**Overall:** met.

### Re-check — the limit, and the owner's "same setup" (adversarial)

Witnessed: 2026-10-16 12:28 EDT, by a fresh agent (adversarial). Commit: d0a5928f plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The re-shown setup is the stored one, same URI and codes | yes | confirmed | P20 on 4 kinds |
| 2 | It needs the right password; never someone else's | yes | confirmed | P20, P21, P23 |
| 3 | Start over: new setup, old page `replaced` | yes | confirmed | P20 |
| 4 | Start over racing confirm stays consistent | yes | confirmed | P5, P12 |
| 5 | A right guess refused once full | yes | confirmed | P1, P2 |
| 6 | Parallel failures can't hide | no | confirmed | P23: 20 at once → 5 counted, 15 refused |
| 7 | A right attempt doesn't reset the count | yes | confirmed | P24 |
| 8 | Ordinary use fits | yes | confirmed | P15 |
| 9 | Sign-out racing start → `not_signed_in` | yes | confirmed | P17 |
| 10 | Earlier claims | no | confirmed | P6, P14, P7, P3, P4, P11 |
| 11 | Tests on 4 kinds; suite | no | confirmed | 49/49; 2883 passed |

**Overall:** met. For the owner: any session with the password could read a pending setup (P21) — the owner then chose "same browser only".

### Re-check — same browser only (blind)

Witnessed: 2026-10-16 13:01 EDT, by a fresh agent (blind). Commit: d0a5928f plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Same session: the same setup again | yes | confirmed | tests; `if (false)` fails 3 |
| 2 | Another session never sees it; gets its own; first page `replaced` | yes | confirmed | test; mutation fails it; probe `Bsaw-A-uri=0` on 4 kinds |
| 3 | The starter kept in `verification` for a day, its id not its token | yes | confirmed | probe; expiry works (then untested) |
| 4 | `startOver` | yes | confirmed | tests |
| 5 | Backup codes re-shown only before the first code, same browser | yes | confirmed | SPEC step 3; `pending()` |
| 6 | The limit | yes | confirmed | mutation fails 5 |
| 7 | Queue, double clicks, races, `another_tab` | yes | confirmed | mutations and probes |
| 8 | No secrets | yes | confirmed | test, probe |
| 9 | Done when | yes | confirmed | 32 tests |
| 10 | Plan text, Done when, Notes | yes | confirmed | PLAN task 3 |
| 11 | 4 kinds | yes | confirmed | 54 / 40 passed |
| 12 | Lint, typecheck, suite | yes | confirmed | 2884 passed |

**Overall:** met.

### Re-check — same browser only (adversarial)

Witnessed: 2026-10-16 13:09 EDT, by a fresh agent (adversarial). Commit: d0a5928f plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Another session with the password never gets the pending secret or codes | yes | confirmed | P21, P30 on 4 kinds |
| 2 | Neither browser re-shows the other's afterwards | yes | confirmed | P30 |
| 3 | Two tabs in one session: same setup; start over new | yes | confirmed | P30, P20 |
| 4 | Sign-out/sign-in or a session rotation makes a new starter | yes | confirmed | P30 |
| 5 | An expired record isn't honoured | yes | confirmed | P30 |
| 6 | A forged value doesn't re-show; the id comes from the server | yes | confirmed | P30; `services/two-factor.ts:55-60` |
| 7 | Races between browsers never leak or corrupt | yes | confirmed | P31, P5, P12 |
| 8 | Tests catch the session condition removed | yes | confirmed | 1–2 fail |
| 9 | Earlier claims | no | confirmed | P1, P2, P23, P24, P15, P6, P17, P13 |
| 10 | Tests on 4 kinds, suite, typecheck, lint | no | confirmed | 50/50; 2884 passed |

**Overall:** met. After this pass, only a test was added: a setup record past its day isn't honoured (it fails when the expiry check is removed; 33/33 on SQLite, PostgreSQL, MySQL and MariaDB).

## Task 4 — `/account/security`

Witnessed: 2026-10-16 13:43 EDT, by a fresh agent (blind). Commit: 5a1487bb plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Component tests pass | no | confirmed | `vitest run src/features/account-security` → 13 passed; web suite 2899 passed |
| 2 | Lint and typecheck clean | no | confirmed | exit 0 both |
| 3 | Password step | no | confirmed | browser probe (Chromium, Pixel 7, iPhone 15): wrong → "The password is wrong"; right → QR and key |
| 4 | The QR code is a server-drawn SVG, never sent to a third party | yes | confirmed | `data:image/svg+xml` from `qrSvg`; decodes 150×150 |
| 5 | The key in groups of four | no | confirmed | a TOTP from the shown key accepted |
| 6 | The URI's settings named | no | confirmed | "Time-based, 6 digits, every 30 seconds." |
| 7 | Same browser, same setup; Start over offered | no | confirmed | same key after reload in 3 engines |
| 8 | A wrong first code refused with the clock hint | no | confirmed | probe |
| 9 | After the first code, the 10 codes with Copy all, Download, "I've saved them" | yes | not met | after a right code the page jumped to "On · 10 backup codes left": the codes were never shown (3 engines) |
| 10 | "Shown once" | yes | partly | gone after reload, but never shown (row 9) |
| 11 | Status, codes left, Regenerate, Turn off | no | confirmed | probe; component tests |
| 12 | Regenerate: "I've saved them" closes the step | yes | partly | the codes stayed after "I've saved them" (`router.refresh` keeps client state) |
| 13 | Turn off needs password and code | no | confirmed | its "is off" notice never appeared (cosmetic) |
| 14 | SSO-only: nothing to set up | no | confirmed | component test |
| 15 | Linked from the Account menu | yes | partly | reached through the new tabs; SPEC not updated |
| 16 | Phone layout, in the sweep | yes | confirmed | `mobile-sweep` → 15 passed; no overflow at 360 and 320 |
| 17 | `security` a telemetry segment | yes | confirmed | `sanitize.ts:112` |

**Overall:** not met: rows 9, 12 (the steps after confirm and after new codes); no test drives them.

### Re-check — after the fixes

Witnessed: 2026-10-16 14:00 EDT, by a fresh agent (blind). Commit: 5a1487bb plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Component and unit tests pass | yes | confirmed | 15 passed; web suite 2901 passed |
| 2 | Lint and typecheck clean | no | not met | `pnpm lint` → a format error in `e2e/two-factor.e2e.ts` |
| 3 | The codes after the first code, with Copy all, Download, "I've saved them" | yes | confirmed | 3 engines: 10 codes; the download has all |
| 4 | Gone after "I've saved them" and a reload | yes | confirmed | probe |
| 5 | Regenerate: "I've saved them" brings the form back | yes | confirmed | probe |
| 6 | Turn off: notice, Done, then Off | yes | confirmed | probe; e2e |
| 7 | The status shown stays true during the steps | no | partly | badge "Off" while the codes show; "On" with "0 codes left" after turning off |
| 8 | An e2e test covers the steps and catches the regression | yes | confirmed | mutation `const on = status.enabled` fails it |
| 9 | Same setup, codes, QR, key | no | confirmed | probe |
| 10 | Reached through the Account tabs; SPEC says so | yes | confirmed | SPEC Scope; e2e |
| 11 | Phone layout | no | confirmed | sweep; no overflow |
| 12 | `pnpm dev` no longer crashes after a hot reload | yes | confirmed | reproduced with `next dev`: HEAD → 4× `deps.limiter.check is not a function`; fixed → 0, QR shown |

**Overall:** not met: rows 2, 7.

### Re-check — lint and the badge

Witnessed: 2026-10-16 14:09 EDT, by a fresh agent (blind). Commit: 5a1487bb plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Lint and typecheck clean | yes | confirmed | `pnpm lint` exit 0; typecheck exit 0 |
| 2 | Component and unit tests pass | yes | confirmed | 15 passed; 2901 passed |
| 3 | While the codes show: badge On, no "will also ask" intro | yes | confirmed | probe; screenshot |
| 4 | After Turn off, before Done: Off, no codes-left, no New backup codes | yes | confirmed | probe; screenshot |
| 5 | All steps still work end to end | no | confirmed | Chromium, phone, phone-webkit |
| 6 | The e2e test checks both | yes | confirmed | `two-factor.e2e.ts:57,61,88-89`; passed |
| 7 | Phone layout | no | confirmed | sweep, no overflow |

**Overall:** met.

## Task 5 — The second step at sign-in

Witnessed: 2026-10-16 14:40 EDT, by a fresh agent (adversarial). Commit: 1b82b36d plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A right password with two-factor gives a challenge, no session, nothing audited as signed in | yes | confirmed | db test on 4 kinds; P13 |
| 2 | Redirect to `/sign-in/two-factor` keeps `next`; an off-site `next` refused at both steps | yes | confirmed | `safeNextPath` probes; mutation fails the unit test |
| 3 | A right TOTP or backup code signs in, audited; a backup code once | yes | confirmed | db tests on 4 kinds |
| 4 | Remember me kept | no | confirmed | db test (Max-Age) |
| 5 | The audit's `remember` matches the session | no | not met | P10: the form's `remember=1` audited true for a browser-only session |
| 6 | A wrong code stays, audited; the challenge still takes the right one | yes | confirmed | db test; P9 odd digits |
| 7 | A used TOTP code refused: enrolment then sign-in, two sign-ins, in parallel | yes | confirmed | P4b on 4 kinds; mutation fails 4 tests |
| 8 | Turn-off refuses a used code | yes | confirmed | P6 |
| 9 | A reused code doesn't spend the challenge | yes | partly | with a decoy cookie (row 10) it does |
| 10 | `challengeUser` (cookie read unsigned) affects only which used codes and who's audited | yes | partly | a decoy `__Secure-` cookie made the audit name another account and slipped the queue |
| 11 | 5 per challenge, 10 in a row lock, in parallel | yes | confirmed | P3, P3b |
| 12 | Messages and `?reason=` redirects | no | confirmed | unit test |
| 13 | A disabled account → "Email or password is wrong", no session | yes | confirmed | db test; mutation fails it |
| 14 | Expired, none, or reset meanwhile → expired | yes | confirmed | P5 (not audited) |
| 15 | Undecryptable → `unreadable`, not a 500 | yes | confirmed | db test; P8 |
| 16 | `auth.sign_in_failed` gains no reason | no | confirmed | `git diff services/session.ts` |
| 17 | No secret, code or cookie in logs or audit; only a hash stored | yes | confirmed | P12 (the plain sha256 id was reversible by brute force) |
| 18 | Two sign-ins with one backup code: one wins | no | partly | outside the queue the loser got Better Auth's 409 as a 500 |
| 19 | Spec: "the last accepted step" | no | partly | the code records each accepted code |
| 20 | The Done when's db tests | yes | confirmed | each case present |
| 21 | Web suite | no | confirmed | 2925 passed |

**Overall:** not met: rows 5, 9, 10, 18, 19.

Witnessed: 2026-10-16 14:50 EDT, by a fresh agent (blind). Commit: 1b82b36d plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Challenge, redirect keeping `next` | no | confirmed | db and unit tests; browser |
| 2 | Nothing audited as signed in until the second step | no | confirmed | db test |
| 3 | One input, one-time-code hints, Verify, backup link without JavaScript | no | confirmed | Playwright, JavaScript off |
| 4 | A right code signs in, audited with `twoFactor` | no | confirmed | db tests; browser |
| 5 | A wrong code: message, audited | no | confirmed | db test; browser |
| 6 | Remember me kept | no | confirmed | db test; browser cookies |
| 7 | `next` survives; off-site refused | no | confirmed | unit tests; browser |
| 8 | Expired → back with the message | no | confirmed | db test; browser |
| 9 | Five wrong → `too_many` | no | confirmed | db test; browser |
| 10 | Ten in a row → locked | no | confirmed | db test; browser |
| 11 | A used code refused | no | confirmed | db tests; mutation |
| 12 | Two sign-ins, one code: one session | no | confirmed | 4 kinds |
| 13 | A used code doesn't spend the challenge | no | confirmed | 8 × the enrolment code, then a right one → ok |
| 14 | Turn-off refuses a used code | no | confirmed | probe on 4 kinds |
| 15 | "The last accepted step" | no | partly | the code records each accepted code |
| 16 | Backup code once; two at once | no | confirmed | one process only |
| 17 | Disabled account | no | confirmed | db test |
| 18 | Undecryptable secret | no | confirmed | db test; mutation |
| 19 | Audit catalogue, summary, log event | no | confirmed | files |
| 20 | Clock drift | no | confirmed | step ±1 |
| 21 | Db tests on 4 kinds | no | confirmed | 153 / 154 |
| 22 | Lint, typecheck, suite | no | confirmed | 2925 passed |

**Overall:** not met: row 15. Also: the 409 race outside the queue; no test for the TOTP race guard; junk codes audited without limit.

### Re-check — after the fixes (blind)

Witnessed: 2026-10-16 14:57 EDT, by a fresh agent (blind). Commit: 1b82b36d plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The Done when on 4 kinds | yes | confirmed | 159 / 160 passed |
| 2 | `next` | yes | confirmed | browser |
| 3 | No `remember` on step 2 | yes | confirmed | code; browser URL |
| 4 | The spec agrees | yes | partly | SPEC still said `remember=1` |
| 5 | Remember me audited from the session | yes | confirmed | probe on 4 kinds; mutation |
| 6 | "Each accepted code", 2 minutes | yes | confirmed | SPEC, PLAN, code |
| 7 | Backup race: one ok, never a 500 | yes | confirmed | probe without the queue |
| 8 | …and a test covers it | yes | partly | the test went through the queue |
| 9 | Six `spendCode` at once: one wins | yes | confirmed | test |
| 10 | A losing `spendCode` gives the session back | yes | confirmed | mutation fails it |
| 11 | Two sign-ins, one code | yes | confirmed | 4 kinds |
| 12 | Junk logged, not audited | yes | confirmed | test |
| 13 | Signature checked, Better Auth's name | yes | confirmed | tests; mutation |
| 14 | `expired` audited | yes | confirmed | test |
| 15 | Lockout messages in a browser | yes | confirmed | Playwright |
| 16 | Lint, typecheck, suite | yes | confirmed | 2931 passed |

**Overall:** not met: rows 4, 8 (and anyone could write `expired` rows with no cookie).

### Re-check — after the fixes (adversarial)

Witnessed: 2026-10-16 14:58 EDT, by a fresh agent (adversarial). Commit: 1b82b36d plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Forged signatures → expired, no session | yes | confirmed | P1, 6 variants, 4 kinds, http and https |
| 2 | Decoys can't change who's checked or named | yes | not met | P15: `ronne.two_factor =A; ronne.two_factor=B` — Better Auth (trimming) read A, ours read B |
| 3 | The real challenge still works | yes | confirmed | P2 |
| 4 | Remember me from the session | yes | confirmed | P10 |
| 5 | Backup race without the queue | yes | partly | behaviour holds; the test didn't need the mapping |
| 6 | "Each accepted code" | yes | confirmed | SPEC, PLAN |
| 7 | HMAC ids | yes | confirmed | P12 (untested) |
| 8 | `expired` audited | yes | confirmed | P1 |
| 9 | Unauthenticated calls can't fill the audit | no | not met | P14: 200 calls → 200 rows |
| 10 | Junk not audited | yes | confirmed | P9 |
| 11 | Races guarded | yes | confirmed | P4b |
| 12 | Earlier claims | no | confirmed | P3, P13, P5, P8, P6 |
| 13 | Db tests on 4 kinds | no | partly | one boundary flake on PostgreSQL (`step: -1`) |
| 14 | Web suite | no | confirmed | 2931 passed |

**Overall:** not met: rows 2, 9 (and tests for the decoy rule, the 409 mapping, the HMAC; the step flake).

### Re-check — second (blind)

Witnessed: 2026-10-16 15:06 EDT, by a fresh agent (blind). Commit: 1b82b36d plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The Done when on 4 kinds | yes | confirmed | 163 / 164 passed |
| 2 | `next` | yes | confirmed | suite; earlier browser run |
| 3 | SPEC without `remember=1`, says what's audited | yes | confirmed | SPEC "Signing in." |
| 4 | Backup race without a queue, tested | yes | confirmed | mutation fails it on SQLite and MySQL |
| 5 | No valid challenge: logged, not audited | yes | confirmed | test; mutation |
| 6 | A real expired challenge audited under its person | yes | confirmed | test; mutation |
| 7 | Cookie parsed as better-call does | yes | confirmed | test; two mutations |
| 8 | HMAC id, tested | yes | confirmed | mutation fails it |
| 9 | `fresh` instead of step −1 | yes | confirmed | `grep -c "step: -1"` → 0 |
| 10 | Earlier fixes hold | yes | confirmed | 4 tests on 4 kinds |
| 11 | Lint, typecheck, suite | yes | confirmed | 2935 passed |

**Overall:** met.

### Re-check — second (adversarial)

Witnessed: 2026-10-16 15:09 EDT, by a fresh agent (adversarial). Commit: 1b82b36d plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Parsed as better-call does: can't read different challenges | yes | confirmed | P15 spaced, tab, quoted, on 4 kinds and both schemes: `expired`, counts 0 and 0 |
| 2 | Decoys never name the other account | yes | confirmed | P2 |
| 3 | No valid challenge: not audited | yes | confirmed | P14: 250 calls → 0 rows |
| 4 | A real expired challenge audited once under its person | yes | confirmed | P17 |
| 5 | Backup race without the queue | yes | confirmed | P4; mutation fails the test |
| 6 | HMAC id, tested | yes | confirmed | P12; mutation |
| 7 | No test depends on a 30-second boundary | yes | partly | "refuses the code used to turn it on" sent `totpCode(uri)` as the enrolment's code |
| 8 | SPEC | yes | confirmed | "Signing in." |
| 9 | Earlier claims | no | confirmed | 17 probes × 8 runs |
| 10 | Tests on 4 kinds, suite | no | confirmed | 57/57; 2935 passed |

**Overall:** not met: row 7. Optional: a resent used code is audited on every try within one valid challenge (needs the person's own password).

### Re-check — third, row 7 (adversarial)

Witnessed: 2026-10-16 15:51 EDT, by a fresh agent (adversarial). Commit: 1b82b36d plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7a | "refuses the code used to turn it on" no longer depends on a step boundary | yes | confirmed | `clock-probe2` jumps the whole clock past a boundary at the Nth read: the old line failed at N = 60–87; the current test passes for N = 1–160 |
| 7b | No test in the two files depends on a boundary not passing | yes | partly | forced at every read, N = 1–360: "refuses a code a second sign-in already used" fails at N = 121–126 and "keeps Remember me" at N = 116–121 (`fresh` hands out step −1, which can expire before it's checked) |
| 7c | Both files pass on 4 kinds | yes | confirmed | 57/57 each on the real clock |
| 7d | The resent-used-code audit note recorded and left | yes | confirmed | PLAN Notes |

**Overall:** not met: row 7b.

### Re-check — fourth, row 7 (adversarial, scoped)

Witnessed: 2026-10-16 15:58 EDT, by a fresh agent (adversarial). Commit: 1b82b36d plus the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7b | No test in the two files depends on a boundary not passing | yes | confirmed | the two tests call `freezeMidPeriod()` (`:46-49`, `:154`, `:256`); they read the harness's clock only 47 times before the freeze, so a sweep past N = 47 can't fire (the implementer's 100–130 sweep was vacuous); sweeping N = 1–47 lands the boundary before the freeze → 2/2 at every N; a probe shows Better Auth reads the frozen clock (the real time's code refused, the fake time's accepted); the other tests' N = 1–360 sweep still applies |
| 7c | Both files pass on SQLite and a server | yes | confirmed | sqlite 57/57, mysql 57/57 |

**Overall:** met.
