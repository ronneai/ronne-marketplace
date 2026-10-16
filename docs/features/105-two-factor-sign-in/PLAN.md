# 105 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. The plugin and its tables.** [risky] Read the installed `better-auth` `twoFactor`
  plugin (and its docs) and write down in Notes: the table and column names, whether the secret and
  the backup codes are encrypted with `AUTH_SECRET`, the lockout settings and what the sign-in
  endpoint returns. Add `twoFactor({ issuer })` to `createAuth`; add the migration (`two_factor`,
  `user.two_factor_enabled`) for all three dialects and map the names in `authSchema`. Update the
  test auth (`testAppAuth`) and `docs/knowledge/better-auth-in-tests.md` if needed.
  *Done when:* the migration and schema tests pass on SQLite, and `pnpm test:db:core` on
  PostgreSQL, MySQL and MariaDB; the Notes answer the encryption question.

- [x] **2. QR code.** Pick the library through `docs/policies/dependencies.md` (licence, latest
  stable, audit, release age); a `qrSvg(uri)` helper in the identity domain that returns an SVG
  string.
  *Done when:* `pnpm licenses:check` and `pnpm audit --audit-level high` pass and a test decodes
  the SVG's matrix back to the URI (or compares a golden file).

- [x] **3. Enrol, regenerate, turn off.** [risky] Identity actions and services (`startTwoFactor`,
  `confirmTwoFactor`, `regenerateBackupCodes`, `turnOffTwoFactor`, `twoFactorStatus`) over
  `auth.api`, refusing with result codes as 006's actions do (`wrong_password`, `wrong_code`,
  `replaced`, `rate_limited`, …), not thrown errors; the password rule; the audit events; no secret
  reaches a log or an audit row. Starting again in the same session before confirming shows the
  same setup; another session, or `startOver`, makes a new one (owner, 2026-10-16). A person's changes run one at a time (in this process; 111
  makes it shared); the limit is checked before every password or code check and counts only
  wrong ones; a new setup that lost (another server's, or the unique index) gets the "started in
  another tab" answer, never the database's message (it names the user id on MySQL and MariaDB);
  confirming takes the URI the page showed, and one replaced since is refused as such; a second
  set of backup codes within 30 seconds is refused.
  *Done when:* db tests cover the happy path, a wrong password, a wrong first code, starting again
  (the same setup), start over (the old page told replaced), several at once (the same setup; and
  several start-overs: one page confirms, none is told "wrong code"), double clicks on confirm,
  regenerate and turn off (each done and audited once), a start racing a confirm (in one browser
  and in two), a sign-out racing a start, the limit refusing a right guess once reached at every
  step, an ordinary setup within the real limit, backup-code regeneration and the audit rows, and a
  test greps the log output and the audit metadata for the secret; and another browser never sees
  the pending setup.

- [ ] **4. `/account/security`.** The page and its client parts (password step, QR and secret,
  first code, backup codes once with Copy and Download, status, Regenerate, Turn off), linked from
  the Account menu; the phone layout.
  *Done when:* component tests pass for each step, including "shown once".

- [ ] **5. The second step at sign-in.** [risky] The sign-in action handles the challenge and
  redirects to `/sign-in/two-factor`; the page and its action verify a code or a backup code,
  create the session (Remember me and `next` kept), show the lockout message, and send an expired
  challenge back. Audit `auth.two_factor_failed`; `auth.sign_in_failed` gains no new reason. A
  TOTP code already accepted for that person is refused (the last accepted step, kept in
  `verification`), at sign-in and in task 3's turn-off (which accepts the enrolment's code today); a secret that won't decrypt gives the "can't be read" message, not a 500.
  *Done when:* db tests cover a right code, a wrong code, the same code twice (enrolment then
  sign-in, and two sign-ins), a backup code twice, a disabled user, an expired challenge, lockout,
  an undecryptable secret and `next` surviving; an off-site `next` is still refused.

- [ ] **6. The policy and enforcement.** [risky] `twoFactorPolicy` in the instance settings; the
  Two-factor sign-in panel on the Authentication tab with the counts and audit; "who is covered"
  as one function in the identity domain; the route guard and server actions hold a covered,
  unenrolled person on `/account/security`.
  *Done when:* tests cover the three policies for a user, a moderator, an admin, a personal-workspace
  admin and root; a held person on a page and on a server action; and a stale tab.

- [ ] **7. Reset, the CLI scripts and the API.** [risky] Reset two-factor on Admin › Users (not on
  your own row); `reset-root-password` resets it; `rotate-secret` clears secrets and reports the
  count, and so does `restore` when it ends with another `AUTH_SECRET` than the archive's (or,
  with no secret in the archive, when a stored two-factor secret won't decrypt); the
  server refuses to start with `BETTER_AUTH_SECRETS` set; `POST /api/v1/auth/token` answers
  `two_factor_required` after a right password only.
  *Done when:* db and script tests pass for each, a restore with and without `--with-settings`
  and from an archive with no `AUTH_SECRET` included; the API test shows the same 401 `invalid_credentials` for a wrong password with and
  without two-factor (no leak).

- [ ] **8. End-to-end.** Playwright: enrol with a TOTP generated in the test, sign out, sign in
  with a code, with a backup code, then root requires it for reviewers and a moderator is held
  until enrolled; root resets someone. Mind the sign-in limit
  (`docs/knowledge/e2e-sign-in-limit.md`).
  *Done when:* `pnpm test:e2e` passes the new spec on desktop and phone.

- [ ] **9. Documentation.** The topics, sections and helpers in the spec, and the MVP §9.5 / §14.3
  notes.
  *Done when:* the docs render tests pass in ronne-web, and the helper link test passes here.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
- **Task 1: the plugin, as installed** (Claude, Better Auth 1.7.7, `dist/plugins/two-factor`).
  - **Tables:** `twoFactor` (`secret`, `backupCodes`, `userId`, `verified`, `failedVerificationCount`,
    `lockedUntil`) and `user.twoFactorEnabled`; ours are `two_factor` and `two_factor_enabled`
    (migration `0025_two_factor`), named through the plugin's `schema` option (`twoFactorSchema`).
    The plugin indexes `secret`; we don't (a `text` column, never looked up). `lockedUntil` is
    `lock_expires_at`: restore needs every timestamp, and only they, to end in `_at`; the servers'
    restore test caught `locked_until` (`docs/knowledge/timestamp-names.md`, new).
  - **Encryption:** the secret always, the backup codes by default (`storeBackupCodes: "encrypted"`),
    with `symmetricEncrypt` (XChaCha20-Poly1305, key SHA-256 of `AUTH_SECRET`). Better Auth also
    supports versioned secrets (`secrets`, `$ba$<n>$` envelopes): a way task 7's `rotate-secret`
    could keep old secrets readable instead of clearing them.
  - **Limits:** 5 codes per sign-in challenge (then it's voided, 400); 10 consecutive failures lock
    for 15 minutes (429, `accountLockout`); the plugin's HTTP rate limit (3 per 10 s on
    `/two-factor/*`) only covers its routes, which we don't serve.
  - **Sign-in:** with two-factor on, `signInEmail` makes the session, deletes it again, and answers
    `{ twoFactorRedirect: true, twoFactorMethods: ["totp"] }` with a signed `ronne.two_factor`
    cookie (10 minutes) that points at a `verification` row. Our `session.create.before` hook (the
    disabled-user check) runs on both sessions. Remember me travels in Better Auth's
    `dont_remember` cookie to the second step.
  - **Codes:** 10 backup codes `XXXXX-XXXXX` (letters and digits), 6-digit TOTP every 30 s, one
    period of drift each way.
  - **Tests:** `testing/totp.ts` computes a code from an `otpauth://` URI (RFC 6238, checked against
    its vectors), so tests don't import Better Auth's own helpers.
- **Task 1: from the witnesses** (adversarial pass). Five enrolments at once left 4 or 5 rows for one
  user (SQLite, MySQL): `two_factor_user_id_idx` is now unique, and a test starts five at once on
  every database. The test now decrypts the stored secret instead of only looking for its base32
  form (which a plain column wouldn't contain either). `better-auth-http.db.test.ts` pins the
  allowlist to `/get-session` and `/ok`: adding a route there used to skip its own 404 check. The
  spec's restore edge case was wrong (restore writes a new `AUTH_SECRET` by default) and is
  rewritten, with `BETTER_AUTH_SECRETS`, code replay and double enrolment, into tasks 3, 5 and 7.
- **Task 2: the QR code library** (Claude, the policy's six questions, for the pull request).
  **`uqr` 0.1.3**, exact in `apps/web`. *Need:* Node has no QR encoder. *License:* MIT, no
  dependencies (one package in the lockfile). *Health:* the unjs organisation, two maintainers,
  about 6 million downloads a week, last release 2026-04-03. *Advisories:* none on osv.dev.
  *Install scripts:* none. *Weight:* 79 KB unpacked, 1 package. Not `qrcode` (it brings `yargs`
  15 and `pngjs`), not `qrcode-generator` (no release in 12 months), not `lean-qr` (one
  maintainer). `qrSvg(uri)` (`identity/models/qr.ts`) draws error correction M with the 4-module
  quiet zone, black on white in both themes (scanners need it), `viewBox` only so CSS sizes it.
  The test reads the drawn modules back out of the SVG and compares them with `encode()`'s, and
  with a golden file (`models/__golden__/qr-golden.txt`): a fixed URI's modules, decoded once by a
  reader that doesn't use uqr (from the witness) to exactly that URI, version 7, ECC M. Comparing
  only with `encode()` passed a uqr that encoded the wrong text.
- **Task 3: enrolling** (Claude). `TwoFactorStore` (port) over Better Auth in
  `better-auth-two-factor-store.ts`; `services/two-factor.ts`; `actions/two-factor.ts`.
  - **Replaced enrolments.** One-at-a-time per person can't make every QR code shown verify: each
    start replaces the unconfirmed one, so an earlier tab's code is stale by design. Confirming
    therefore takes the URI the page showed, and `holds()` (decrypt the stored secret, compare
    base32) answers `replaced` before any code is checked. The concurrency test has every shown
    page confirm: exactly one turns it on, the others are refused. The in-process queue
    (`oneAtATime`) only keeps two starts from interleaving; across replicas (M17) the read-back
    after `begin` covers it.
  - **Better Auth replaces the session** on confirm and on turning off (a new session, the old one
    deleted): the actions return its headers, and `nextCookies` sets them in a server action.
  - **Turning off** checks the password first (`checkPassword`, the credential account's hash),
    then the code (TOTP, then a backup code with `disableSession`), so a wrong password never uses
    up a backup code. Better Auth's own disable needs only the password.
  - **Limits:** wrong passwords and codes use the sign-in limiter (5 a minute per email); in a
    session, Better Auth's TOTP check has no attempt count of its own.
  - **`isUniqueViolation`** (`db/locks.ts`, beside `isDeadlock`): each database's duplicate-key
    error, also as a wrapped `cause`; the 0025 test checks the real error on all four kinds.
  - Audit actions `auth.two_factor_enabled`, `auth.two_factor_disabled` and
    `auth.backup_codes_regenerated` (with summaries); log events `auth.two_factor_started`,
    `_enabled`, `_disabled`.
  - **From the witnesses** (blind and adversarial, not met). The limiter labelled failures but never
    stopped a right guess: it now consumes before every check, as `signIn` does. The queue covered
    only starts: a confirm racing a start in another browser could report "on" with the other
    secret stored (locking the person out), a double confirm audited three times, a start racing a
    confirm threw Better Auth's 401 as a 500. All four changes now share the per-person queue and
    read the session again inside it; the store maps that 401 to `signed_out` (after the
    `INVALID_*` refusals, which are 401s too). Removing the queue now fails 4–5 tests on the
    servers. The Done when no longer promises "every QR code shown verifies" (each start replaces
    the last, by design): it's "one page confirms, none is told wrong code" (owner to confirm).
  - **Re-check, then the owner's choice** (2026-10-16). The adversarial re-check found that counting
    right attempts too made an ordinary setup (a reload and a typo) fill the 5-a-minute limit,
    blocking new codes, turning off and signing in for a minute. The limiter gained `check` and
    `record` (`consume` is both, for sign-in): every check is preceded by `check`, and only failures
    are recorded. The owner chose "re-show the same setup" over "newest wins" and "first wins": a
    start with a pending setup reads it back (`getTOTPURI` with the password, `viewBackupCodes`)
    instead of making a new one, and `startOver` makes a new one. Better Auth's `appName` is now
    "Ronne AI Marketplace": `getTOTPURI` labels the URI with it, not with the plugin's issuer.
  - **Same browser only** (owner, 2026-10-16, after the adversarial re-check: any session with the
    password could read a pending setup and so hold the person's authenticator once they
    confirmed). The session that started it is kept in `verification` (`two-factor-setup:<user
    id>`, a day); only that session gets it back. Across replicas (M17), `pending()` reads the URI
    and the codes in two calls with no read-back, which the per-person queue covers on one server:
    for 111.
  - **After the last passes:** a test that a setup record past its day isn't honoured (the blind
    witness's gap). For 111 too: across servers, `rememberSetupSession` deletes then writes, so
    two servers could leave two rows (the newest wins on read); a stolen session plus the password
    still re-shows a pending setup, by construction (the limit is what protects it).
