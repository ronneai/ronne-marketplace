# 194 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Decision.**
  - MVP.md §15's "Web sign-in" row says a forgotten password can be reset by email (a code, then
    two-factor, then a new password; never a sign-in; never for root), and §8's Auth row no longer
    says "there's no email in the MVP" for passwords. `docs/features/README.md` lists 194 in M32.
  - *Done when:* both say what this spec says, and `pnpm witness:check` passes.

- [x] **2. The table and the setting.** [risky]
  - Migration: `password_reset_flows` (spec's Data), on all three dialects.
  - The setting *People can reset a forgotten password by email* in the settings domain, off by
    default, refused while email isn't set up, its last test failed, or 189's Instance contact is
    empty; clearing the contact turns it off; audited.
  - *Done when:* the migration's db test passes on SQLite, PostgreSQL and MySQL, and a settings db
    test covers on, off, the refusals without working email or a contact, and the setting turned off
    when the contact is cleared.

- [x] **3. The request.** [risky]
  - The identity service `requestPasswordReset`: normalise the address; decide the email from the
    spec's table; write the flow row on every path; create the code (190) only for a password
    account; queue the email (189); the limits; the honeypot and the challenge (190's helpers);
    audit only for a real account. The per-IP limits use 109's database limiter.
  - *Done when:* db tests cover every row of the table (the email queued, or none), the same
    screen state returned on each, the per-IP and per-address limits, and a test that runs the
    found and not-found paths and checks that both do the same repository calls (lookup, HMAC, flow
    write, outbox or none).

- [x] **4. The code and two-factor steps.** [risky]
  - `checkResetCode`: the flow's cookie, 190's code rules, the cookie replaced on success, the
    20-per-day pause.
  - `checkResetTwoFactor`: the two-factor store's code check (as `turnOffTwoFactor` uses it), with
    TOTP replay refused and backup codes spent; failures counted with the sign-in's.
  - The step decided from the account as it is now: two-factor turned on mid-flow, a disabled,
    erased or root account, or *Root only*.
  - *Done when:* db tests cover a right and a wrong code, five wrong ones, an expired and a
    replaced code, a cookie from an earlier step, a missing cookie, both two-factor methods, a used
    TOTP code, and each mid-flow change in the spec's edge cases.

- [x] **5. The reset.** [risky]
  - `completePasswordReset`: the 10-minute single-use grant; the password rules; one transaction
    that sets the password, clears 128's hold, deletes sessions, ends other codes, flows and device
    grants, revokes tokens unless the box was unchecked, and records `user.password_reset_by_email`;
    then 189's "password changed or reset" notice, with `via: email`.
  - *Done when:* db tests show each effect, the grant refused after 10 minutes and on a second use,
    no session created, tokens kept only when unchecked, and the notice queued after the commit.

- [ ] **6. The pages.**
  - `/sign-in/forgot`, `/sign-in/forgot/code`, `/sign-in/forgot/two-factor`,
    `/sign-in/forgot/new-password`, in the auth shell (157), with `CodeInput` and the two-factor
    step's component. They work without JavaScript. A signed-in person is sent to Account.
  - "Forgot?" opens the request page when the setting is on and email works, else today's note.
  - The cookie: HttpOnly, SameSite=Strict, Path `/sign-in/forgot`, `__Host-` and Secure under https.
  - Messages in `auth.json` in all three languages; the emails' texts in `mail.json` (189).
  - *Done when:* component tests cover each page's states; the translation tests pass; an end-to-end
    test resets a password with a code read from the test mail transport (189), then with
    two-factor, then signs in with the new password, and checks that the old session ended.

- [ ] **7. Data protection.**
  - Retention (102) purges flows and codes a day after they expire. Erasure (103) deletes the
    account's flows. Your data (104) lists open flows.
  - *Done when:* the retention, erasure and Your data db tests cover the new table.

- [ ] **8. Documentation.**
  - ronne-web: `account#forgot` (new section, in `topics.ts` here and there), `authentication#overview`,
    `privacy#retention`, in all three languages.
  - Helpers: the *Forgot?* note's link and the setting's helper.
  - *Done when:* the docs render tests and `pnpm docs:links` pass, and the ronne-web branch is named
    in the index's status.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- Task 2 built the setting's server side (`settings/services/password-reset.ts`, the action
  `adminSetPasswordResetPolicy`); its switch on the Authentication tab lands with the pages (task 6).
- The switch's readiness is a function the service reads inside its own transaction
  (`readinessIn`, holding the contact's row through `lockedMailReadiness`). Pass it, never a
  readiness read before the save: the witnesses showed a contact cleared in between leaves it on.
- "Its last test passed" is decided by `setupFingerprint`: every result records the setup it went
  through (`sender.setup`, read before the send). Anything new that records a mail status must do
  the same, or a late result of an old setup counts for the new one.
- `compareAndSet`'s first insert is `ON CONFLICT DO NOTHING` on PostgreSQL and SQLite: a failed
  statement aborts PostgreSQL's whole transaction, so a caught unique violation isn't enough there.
- Task 3: every answer to a reset request waits until `RESET_ANSWER_MS` (400 ms) after it began,
  since a real account's request writes more. Tests pass `minimumMs: 0`; the time floor has its
  own tests. The code's resend limit is keyed on the address (`address:<HMAC>`), not the flow.
- The reset emails' texts landed with task 3 (`messages/*/mail.json` "reset"), since the request
  queues them; task 6 adds only the pages' words.
- Run several test files in zsh by writing the paths out: an unquoted `$F` holding two paths is
  one argument, and vitest then finds no files.
- Task 4 changed task 3's request: every flow gets a code (emailed only when the table says so),
  and codes are replaced per address (`endCodesFor`, by the codes' `email_hmac`), so the code page
  answers alike for every address. The code page answers at the same 400 ms floor.
- The reset's two-factor step checks codes with no session: `TwoFactorStore.checkCodeOf`, in one
  transaction holding the account's `two_factor` row (`writeTransaction`), Better Auth's lockout
  columns, backup codes decrypted and re-encrypted as Better Auth stores them (encrypted by
  default), and a right TOTP recorded as used in that transaction. TOTP itself is `models/totp.ts`.
- Never read through the app's own store or `db` inside a `repo.transaction`: on SQLite's one
  connection it waits forever (two-factor's state is read before the transaction for that).
- The 20-a-day pause counts the account's `auth.password_reset_code_failed` audit rows with reason
  `wrong` (`wrongCodeTimes`, `resetPaused`), with the account's row held first.
- 0048 gained `two_factor_at` in place: it was unreleased and not yet on the dev database.
- Task 5: the notice is queued in the reset's transaction and handed to the scheduler after the
  commit (189's way), so it exists if and only if the reset does.
- Task 5's known limit (owner, 2026-11-23): a sign-in or Change password already checking the old
  password at the instant of a reset can keep a session (Better Auth checks, then creates the
  session). The row lock and a cleanup 100 ms after the commit catch the common case; feature 200
  closes it for the whole app.
- For 200: a sign-in whose session the reset's cleanup deletes between Better Auth's insert and
  its own lookup throws "Better Auth signed in but its session can't be found" rather than
  refusing (seen on SQLite, nothing left open).

