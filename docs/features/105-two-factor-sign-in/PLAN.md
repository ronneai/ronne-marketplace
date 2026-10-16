# 105 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. The plugin and its tables.** [risky] Read the installed `better-auth` `twoFactor`
  plugin (and its docs) and write down in Notes: the table and column names, whether the secret and
  the backup codes are encrypted with `AUTH_SECRET`, the lockout settings and what the sign-in
  endpoint returns. Add `twoFactor({ issuer })` to `createAuth`; add the migration (`two_factor`,
  `user.two_factor_enabled`) for all three dialects and map the names in `authSchema`. Update the
  test auth (`testAppAuth`) and `docs/knowledge/better-auth-in-tests.md` if needed.
  *Done when:* the migration and schema tests pass on SQLite, and `pnpm test:db:core` on
  PostgreSQL, MySQL and MariaDB; the Notes answer the encryption question.

- [ ] **2. QR code.** Pick the library through `docs/policies/dependencies.md` (licence, latest
  stable, audit, release age); a `qrSvg(uri)` helper in the identity domain that returns an SVG
  string.
  *Done when:* `pnpm licenses:check` and `pnpm audit --audit-level high` pass and a test decodes
  the SVG's matrix back to the URI (or compares a golden file).

- [ ] **3. Enrol, regenerate, turn off.** [risky] Identity actions and services (`enableTwoFactor`,
  `confirmTwoFactor`, `regenerateBackupCodes`, `disableTwoFactor`) over `auth.api`, with the
  password rule, the audit events and `TwoFactorError`s; no secret reaches a log or an audit row.
  *Done when:* db tests cover the happy path, a wrong password, a wrong first code, a second
  enrolment, backup-code regeneration and the audit rows, and a test greps the log output and the
  audit metadata for the secret.

- [ ] **4. `/account/security`.** The page and its client parts (password step, QR and secret,
  first code, backup codes once with Copy and Download, status, Regenerate, Turn off), linked from
  the Account menu; the phone layout.
  *Done when:* component tests pass for each step, including "shown once".

- [ ] **5. The second step at sign-in.** [risky] The sign-in action handles the challenge and
  redirects to `/sign-in/two-factor`; the page and its action verify a code or a backup code,
  create the session (Remember me and `next` kept), show the lockout message, and send an expired
  challenge back. Audit `auth.two_factor_failed`; `auth.sign_in_failed` gains no new reason.
  *Done when:* db tests cover a right code, a wrong code, a backup code twice, a disabled user, an
  expired challenge, lockout and `next` surviving; an off-site `next` is still refused.

- [ ] **6. The policy and enforcement.** [risky] `twoFactorPolicy` in the instance settings; the
  Two-factor sign-in panel on the Authentication tab with the counts and audit; "who is covered"
  as one function in the identity domain; the route guard and server actions hold a covered,
  unenrolled person on `/account/security`.
  *Done when:* tests cover the three policies for a user, a moderator, an admin, a personal-workspace
  admin and root; a held person on a page and on a server action; and a stale tab.

- [ ] **7. Reset, the CLI scripts and the API.** [risky] Reset two-factor on Admin › Users (not on
  your own row); `reset-root-password` resets it; `rotate-secret` clears secrets and reports the
  count; `POST /api/v1/auth/token` answers `two_factor_required` after a right password only.
  *Done when:* db and script tests pass for each; the API test shows the same 401 `invalid_credentials`
  for a wrong password with and without two-factor (no leak).

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
