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
