# 189 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Decision.**
  - MVP.md §15's "Web sign-in" row no longer says "no email". A new "Email" row says what this spec
    decides: SMTP and four web APIs, the environment wins, a sealed outbox, TLS always, notices
    that can't be turned off.
  - `docs/features/README.md` lists 189 in M32.
  - *Done when:* both say what this spec says, and `pnpm witness:check` and `pnpm docs:check` pass.

- [x] **2. The dependency.**
  - MIT-0 is added to the dependency policy §1 and to `license-policy.json`, in one change (owner,
    2026-11-20).
  - nodemailer is added at its latest stable version, and the pull request answers the §3
    checklist: need, licence of the tree, health, advisories, install scripts, weight.
  - *Done when:* `pnpm install --frozen-lockfile`, `pnpm licenses:check` and
    `pnpm audit --audit-level high` pass, and the checklist answers are in Notes.

- [x] **3. The transports.** [risky]
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
    secrets and *Set on the server*; the **Instance contact** field (`mail_contact`, or
    `RONNE_MAIL_CONTACT`), validated as an email address or an `https://` URL, and
    `instanceContact()` for 190 and 194 to check before their switches turn on; the required
    **Reply-To** field (`mail_reply_to`, or `RONNE_MAIL_REPLY_TO`), filled from the contact when
    that is an email address, and set on every message.
  - **Send test email** (to root only, 5 in 10 minutes) and **Stop sending**.
  - Screen text through messages in three languages.
  - *Done when:* component tests cover each status, each transport's fields, a secret saved and
    replaced, the environment's read-only view, the instance contact (valid, `http://`, with a user
    name, empty), the test's success, failure and limit, and Stop sending; the phone sweep passes on the tab.

- [ ] **8. Security notices.** [risky]
  - `sendSecurityNotice` and its kinds, queued in the transaction of `changePassword`, the two
    password resets (`user-admin.ts`, `root-account.ts`), `confirmTwoFactor`, `turnOffTwoFactor`,
    `regenerateBackupCodes`, the two-factor resets and `sso-sign-in.ts`'s link.
  - Nothing is queued when email isn't set up. Every notice ends with the instance contact when one
    is set.
  - *Done when:* db tests show each event queues one notice for the account's own address in its
    language, with the instance contact (and without one when it's empty), a failed change queues none, and no notice is queued with email off.

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
  - MVP.md §15's "Web sign-in" and "Email" rows, and §8's Auth row, lose "planned".
  - *Done when:* the docs render tests and `pnpm docs:links` pass, and each helper opens its
    section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Task 2, nodemailer (2026-11-21).** The §3 checklist:
  1. **Need.** Node.js has no SMTP client or MIME composer. SMTP (dot-stuffing, STARTTLS, line
     lengths) and MIME (header encoding, multipart) are where a hand-written client goes wrong
     (Decision 2). The four web APIs use `fetch` and need nothing.
  2. **Licence.** MIT-0, added to §1 and `license-policy.json` in this change (owner, 2026-11-20).
     It has no dependencies, so its tree is itself; `pnpm licenses:check` passes (351 packages).
  3. **Health.** 342 versions since 2011, the latest on 2026-11-20; releases every few days in
     November 2026. One maintainer on npm (andris): the §3 "Health" caveat. Widely used, and published
     with npm provenance (SLSA v1), which `trustPolicy` checks.
  4. **Advisories.** `pnpm audit` lists none for nodemailer; the high-level audit passes.
  5. **Install scripts.** None (no `install`, `postinstall` or `prepare` run for consumers), so
     `allowBuilds` doesn't change.
  6. **Weight.** One package, no dependencies, its own types (`dist/esm/nodemailer.d.ts` beside
     the ESM entry, `dist/cjs/` for CommonJS), so no `@types/nodemailer`.

  **The version is 10.6.0, not 10.6.1.** 10.6.1 came out on 2026-11-20, inside the 3 days
  `minimumReleaseAge` holds back. Its changes are DKIM signing, its `fetch` helper's cookies and one
  new well-known service, none of which Ronne uses; Dependabot will offer it.
- **Task 3, the web APIs (checked against the vendors' documentation on 2026-11-21).**
  - **SES:** `POST /v2/email/outbound-emails` on `email.<region>.amazonaws.com`, `Content.Raw.Data`
    base64, `Destination.ToAddresses`; `{ MessageId }` on 200. `TooManyRequestsException` (429) and
    `ThrottlingException` (400, "the AWS SDKs automatically retry") are retried; `MessageRejected`,
    `MailFromDomainNotVerifiedException` and the other 400s aren't. The pages didn't name the
    SigV4 service: `ses` is the signing name AWS uses for SES v2, and the signer passes AWS's
    published examples; the real sandbox test (an acceptance criterion) confirms it by hand.
  - **Mailgun:** `POST /v3/<domain>/messages.mime`, multipart `to` and `message` (the MIME string
    as a file), basic auth; `{ id, message }` on 200; 400, 401, 429 and 500 documented. The API
    overview gives `https://api.mailgun.net/` for US domains and `https://api.eu.mailgun.net/` for
    EU ones; the authentication page gives HTTP Basic with the user `api` and the key as the
    password, and says a domain sending key may post to `/messages.mime`.
  - **Postmark:** `POST https://api.postmarkapp.com/email`, `X-Postmark-Server-Token`, JSON
    `From` (`"Name <address>"`), `To`, `ReplyTo`, `Subject`, `TextBody`, `HtmlBody`, `Headers`,
    `MessageStream` (`outbound` by default); no raw MIME. Errors are `{ ErrorCode, Message }`: 422
    for the request, 401 for the token, 429 for the rate, 500 and 503 (codes 100 and 101) for
    Postmark's own trouble, which are retried.
  - **Resend:** `POST https://api.resend.com/emails`, `Authorization: Bearer`, a `User-Agent`
    required (403 without), JSON `from`, `to`, `reply_to`, `subject`, `text`, `html`, `headers`;
    `{ id }` on 200. `Idempotency-Key` (up to 256 characters, kept 24 hours); 409
    `concurrent_idempotent_requests` is retried, `invalid_idempotent_request` isn't; 429 comes
    with `retry-after`.
  - **SMTP tests** use an in-process fake (`domains/mail/testing/smtp-fake.ts`) and a self-signed
    certificate `openssl` makes for each run, so `openssl` must be on the test machine (it is on
    macOS and the CI runners).
- **Task 3, what a provider's answer may show.** Root's test email shows the provider's answer
  (`detail`). At SMTP's AUTH stage it shows only the reply's codes (`authentication refused (535
  5.7.8)`): a careless server can echo the client's line back, the password in any encoding or
  split over reply lines, and no list of encodings catches them all. Elsewhere the answer is
  cleaned of every secret in the forms `secretForms` lists (raw, URL- and form-encoded,
  JSON-escaped, base64 with and without padding, base64url, hex in either case). That holds for
  every answer but AUTH's: the web APIs' bodies, SMTP's replies at the other stages, and
  nodemailer's own messages. A secret in another encoding there (quoted-printable, an HTML
  entity, double URL-encoding, upper case) or split across reply lines would get through; no
  provider is known to echo a credential outside AUTH.
- **Task 3, a server that answers STARTTLS with `454`.** It's retried, as every SMTP `4xx` is
  (SPEC), so root's test email names a temporary server problem rather than TLS. A server that
  says yes and then answers the client's handshake with plain text fails at once as TLS. One that
  sends plain text together with its yes, before the client starts TLS, is read as a handshake
  that never comes: retried as a timeout after the greeting timeout (10 seconds). Neither sends anything.
