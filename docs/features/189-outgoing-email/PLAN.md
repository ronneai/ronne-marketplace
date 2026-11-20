# 189 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §15's "Web sign-in" row no longer says "no email". A new "Email" row says what this spec
    decides: SMTP and four web APIs, the environment wins, a sealed outbox, TLS always, notices
    that can't be turned off.
  - `docs/features/README.md` lists 189 in M32.
  - *Done when:* both say what this spec says, and `pnpm witness:check` and `pnpm docs:check` pass.

- [ ] **2. The dependency.**
  - Only after the owner's yes to Decision 2: MIT-0 is added to the dependency policy §1 and to
    `license-policy.json` (one change, both files).
  - nodemailer is added at its latest stable version, and the pull request answers the §3
    checklist: need, licence of the tree, health, advisories, install scripts, weight.
  - *Done when:* `pnpm install --frozen-lockfile`, `pnpm licenses:check` and
    `pnpm audit --audit-level high` pass, and the checklist answers are in Notes.

- [ ] **3. The transports.** [risky]
  - The `mail` domain: the `MailTransport` port and the message type, composed once with
    nodemailer's composer.
  - `smtp`: the TLS modes, required STARTTLS, verified certificates, the timeouts, and the host
    check reusing `scans/models/endpoint.ts`'s address rules with `RONNE_MAIL_HOSTS`.
  - `ses` (with a SigV4 signer on `node:crypto`), `mailgun` (US and EU), `postmark` and `resend`,
    each mapping its answers to `sent`, `retry` or `failed`.
  - Before writing each API, check its endpoint and fields against the vendor's current
    documentation; note the date in Notes.
  - *Done when:*
    - unit tests run each transport against a local fake (an in-process SMTP fake with and
      without STARTTLS, a bad certificate, `535` and a slow greeting; recorded HTTP answers for
      `200`, `4xx`, `429` with `Retry-After` and `5xx`);
    - the SigV4 signer passes AWS's published test vectors;
    - no test output, log or error text carries a credential.

- [ ] **4. Settings and secrets.** [risky]
  - The `mail_*` keys, the `_enc` secrets through `instance-secrets.ts`, `rotate-secret` re-sealing
    them, and `mail_last_status`.
  - The `RONNE_MAIL_*` variables in `server/config.ts`, all or nothing.
  - Header-injection checks on the From name and address.
  - `settings.mail` and `mail.test_sent` in the audit actions, secrets as *replaced*.
  - *Done when:* db tests cover saving each transport, a secret never read back, an unreadable
    secret, `rotate-secret`, the environment taking over, and a CR/LF refused; `audit-event.test.ts`
    knows the two actions.

- [ ] **5. The outbox.** [risky]
  - Migration `mail_outbox` (all three dialects).
  - Queuing inside a caller's transaction; the sealed body and `recipient_hmac`.
  - The claim; sending at once after the response; the `mail_outbox` job in the scheduler (every 30
    seconds, under the lease); the retry schedule; `expires_at`; the cap of 10 an hour per address.
  - The body deleted on `sent`, `failed` or `dropped`; `rotate-secret` re-sealing queued bodies.
  - Retention, erase (103) and *your data* (104) covering the rows.
  - The `mail.*` log events.
  - *Done when:*
    - db tests cover a rolled-back transaction queuing nothing, each status, the schedule, a
      permanent error, `429`, an expired code's email dropped, the cap, a body never left after
      sending, two connections claiming one row (as `lease.db.test.ts` does), purge, erase and the
      export;
    - they pass on SQLite, PostgreSQL and MySQL (`pnpm test:db:postgres -- <files>`, `:mysql`).

- [ ] **6. Templates.**
  - `mail.json` in English, Brazilian Portuguese and Canadian French: the test email and the six
    notices.
  - Text and HTML rendering: inline styles, no remote content, the instance's host,
    `Auto-Submitted`, "If this wasn't you…".
  - The locale rule.
  - *Done when:* the i18n key and placeholder tests pass for `mail`; snapshot tests show each
    template in each language as text and HTML; a test shows no template holds a sign-in link.

- [ ] **7. The Email tab.**
  - `email` in `SETTINGS_TABS`; the status, sender, transport with presets and steps, the write-only
    secrets and *Set on the server*.
  - **Send test email** (to root only, 5 in 10 minutes) and **Stop sending**.
  - Screen text through messages in three languages.
  - *Done when:* component tests cover each status, each transport's fields, a secret saved and
    replaced, the environment's read-only view, the test's success, failure and limit, and Stop
    sending; the phone sweep passes on the tab.

- [ ] **8. Security notices.** [risky]
  - `sendSecurityNotice` and its kinds, queued in the transaction of `changePassword`, the two
    password resets (`user-admin.ts`, `root-account.ts`), `confirmTwoFactor`, `turnOffTwoFactor`,
    `regenerateBackupCodes`, the two-factor resets and `sso-sign-in.ts`'s link.
  - Nothing is queued when email isn't set up.
  - *Done when:* db tests show each event queues one notice for the account's own address in its
    language, a failed change queues none, and no notice is queued with email off.

- [ ] **9. The threat model.**
  - `docs/security/threat-model.md`:
    - a new boundary, Ronne → the email provider (a stolen credential sends as the From domain:
      sealed, least-privilege keys, DMARC);
    - §4.4 for the sealed credentials and bodies;
    - §4.2 for the SMTP host check;
    - §5 for what's out (bounces, DKIM by Ronne).
  - *Done when:* the threat model says what the feature does, and `pnpm docs:check` passes.

- [ ] **10. Documentation and helpers.**
  - ronne-web, in a branch that goes live with the release: the new `email` topic in three
    languages, with `privacy`, `security#encryption` and `account`.
  - `topics.ts` in both repositories; the helpers on the Email tab and the Account page.
  - `docs/runbooks/install.md`'s variables.
  - *Done when:* the docs render tests and `pnpm docs:links` pass, and each helper opens its
    section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
