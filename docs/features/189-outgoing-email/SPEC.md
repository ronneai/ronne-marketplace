# 189 — Outgoing email

> Milestone: M32 · Depends on: 122, 136, 102, 105, 106, 103, 104, 129 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("Web sign-in", and a new "Email" row) · Contracts: none changed

## Goal

Ronne sends no email today: MVP §15 says "there's no email in the MVP", and "Forgot?" points to a
root. Self-registration (190), forgot password (194) and verified email changes (197) need to
reach a person's inbox, and NIST SP 800-63B-4 §4 asks for a notice to the person whenever a way to
sign in to their account changes. This feature lets root set up how email leaves the server (an
SMTP server, or the web API of Amazon SES, Mailgun, Postmark or Resend), test it, and see whether
it works. It sends the security notices for events that already exist. It sends nothing else.

The owner's rule for M32 applies to every line: keep the person safe, collect and keep as little as
possible, and follow the standards (owner, 2026-11-20).

## Scope

**In:**

- **A `mail` domain** (`apps/web/src/server/domains/mail/`) with a `MailTransport` port: one
  `send(message)` that returns `sent`, `retry` (with an optional wait) or `failed` (permanent), and
  a reason category. Five transports implement it:

  | Transport | How | Credentials (sealed) |
  |---|---|---|
  | `smtp` | nodemailer's SMTP client | user name and password |
  | `ses` | Amazon SES v2 `POST https://email.<region>.amazonaws.com/v2/email/outbound-emails`, `Content.Raw` (the MIME message, base64), signed with AWS Signature Version 4 from `node:crypto` | access key ID and secret access key |
  | `mailgun` | `POST https://api.mailgun.net/v3/<domain>/messages.mime` (or `api.eu.mailgun.net` for an EU domain), HTTP basic auth `api:<key>` | API key |
  | `postmark` | `POST https://api.postmarkapp.com/email`, header `X-Postmark-Server-Token`, message stream `outbound` | server token |
  | `resend` | `POST https://api.resend.com/emails`, `Authorization: Bearer`, `Idempotency-Key` set to the outbox row's ID | API key |

  The web APIs are called with `fetch`, with no vendor SDKs. Their hosts are fixed in code, so root
  can't point them anywhere else. Endpoints were checked against each vendor's documentation on
  2026-11-20; vendors change them, so the task that builds each one checks again.
  nodemailer's composer builds the one MIME message every transport sends. Postmark and Resend take
  JSON fields instead, filled from the same parts.
- **SMTP presets**, filling the host, port and TLS mode: Amazon SES (`email-smtp.<region>.amazonaws.com`),
  Mailgun (`smtp.mailgun.org`, or `smtp.eu.mailgun.org`), Postmark (`smtp.postmarkapp.com`), Resend
  (`smtp.resend.com`, user `resend`) and SendGrid (`smtp.sendgrid.net`, user `apikey`), plus
  **Other SMTP server**. Like 106's presets, they're data with the short setup steps beside the
  form.
- **TLS, always:**
  - **TLS** (implicit, port 465 by default) or **STARTTLS required** (port 587 by default). With
    STARTTLS, a server that doesn't offer it fails; Ronne never falls back to plain text.
  - Certificates are always verified. There's no "ignore certificate errors" switch. An internal CA
    is the operator's `NODE_EXTRA_CA_CERTS`, as the docs say.
  - **No TLS** only for a host the operator lists in `RONNE_MAIL_HOSTS` (a relay on the same
    network), and never with a user name and password.
- **The SMTP host is checked as 136 checks an endpoint** (`scans/models/endpoint.ts`): every address
  it resolves to must be public. A host in `RONNE_MAIL_HOSTS` skips the check, so a company's
  internal relay works when the operator allows it. The check runs on save and again before each
  connection, as DNS can change, and Ronne connects to the addresses it checked.
- **Settings in `instance_settings`.** `mail_transport`, `mail_from_address`, `mail_from_name` and
  each transport's fields. The secrets are `_enc` keys (`mail_smtp_password_enc`,
  `mail_api_key_enc`, `mail_ses_secret_access_key_enc`), sealed by
  `settings/models/instance-secrets.ts` as 136 seals the scan key, so `rotate-secret` re-seals
  them. They are write-only: the tab shows *Saved* and a **Replace** button, never the value.
- **The environment wins, all or nothing.** When the operator sets `RONNE_MAIL_TRANSPORT`, the whole
  setup comes from `RONNE_MAIL_*` variables: `RONNE_MAIL_FROM`, `RONNE_MAIL_FROM_NAME`,
  `RONNE_MAIL_SMTP_HOST`, `_PORT`, `_TLS`, `_USER` and `_PASSWORD`, `RONNE_MAIL_API_KEY`,
  `RONNE_MAIL_REGION`, `RONNE_MAIL_DOMAIN` (Mailgun), `RONNE_MAIL_CONTACT`, `RONNE_MAIL_SES_ACCESS_KEY_ID` and
  `RONNE_MAIL_SES_SECRET_ACCESS_KEY`. The tab then shows every field as *Set on the server*,
  read-only, as 136 does. This is for operators who keep secrets out of the database. They're read
  by `server/config.ts` with the others, the environment's over the settings file's.
- **The Email tab** in Admin › Settings (`SETTINGS_TABS`, after Authentication; root only,
  `settings.manage`). It holds:
  - **Status:**
    - *Not set up*;
    - *Working*: the last test or delivery succeeded, and when;
    - *Failing*: the last delivery failed for good, with its reason category and time (never the
      address).
  - **Instance contact:** an email address or an `https://` URL that tells people whom to contact
    about their account, such as `it-help@acme.com` or the company's help page. It's printed in
    every security notice, so someone who didn't make a change knows whom to tell (NIST SP
    800-63B-4 §4.6). It's required before self-registration (190) or reset by email (194) can be
    turned on, and those switches say so while it's empty. Validated on save: an address as the
    From address is validated, or an absolute `https://` URL with no user name or password in it.
  - **Sender:** the From address and name. The domain's SPF, DKIM and DMARC are the provider's and
    the DNS's job; the tab links the Documentation's guide.
  - **Reply-To:** required, an email address validated as the From address is. Replies go there,
    so a From address such as `no-reply@…` never swallows a person's answer to a notice. It starts
    filled with the instance contact when that is an email address. Every message carries it.
  - **Transport:** a choice, then the transport's fields, with the preset's steps beside them.
  - **Send test email:** it goes to the signed-in root's own address, never one typed in, so the tab
    can't be used to send mail to strangers. It's sent at once rather than queued. The result
    shows the server's or API's answer, cleaned of credentials. Each root may send 5 in 10 minutes,
    counted from the outbox's rows.
  - **Stop sending:** clears the transport. The queued messages are dropped (their bodies deleted),
    and features that need email say it's off.
- **The outbox** (`mail_outbox`). Every message is queued in the same transaction as the change that
  causes it (a transactional outbox), so a notice exists if and only if its change does. Then:
  - **A row holds:** the template, the locale, a `recipient_hmac`, the `user_id` when there is one,
    the status (`queued`, `sending`, `sent`, `failed` or `dropped`), the attempts, `next_attempt_at`,
    the reason category of the last error, and the times. Retention purges the row.
  - **`recipient_hmac`** is an HMAC-SHA256 of the lowercased address, under a key derived from
    `AUTH_SECRET`. It lets the outbox count per address without keeping the address.
  - **`body_enc`** is sealed by `crypto/sealed.ts`: purpose `ronne:mail-outbox:v1`, bound to the
    row's ID. It holds the address, subject and both bodies, and it's deleted as soon as the
    message is sent, fails for good or is dropped. A code (190, 194, 197) is therefore never stored
    in clear, and never kept after it's sent.
  - **Sending at once:** after the response is sent, the server tries the message straight away, so a
    person waiting for a code gets it in seconds. A run claims rows with a conditional update
    (`queued` → `sending`, with a two-minute claim), so two replicas never send one row at once.
  - **The `mail_outbox` job** runs every 30 seconds under the jobs lease (102), 50 rows at a time. It
    picks up what wasn't sent, the claims that ran out, and the retries.
  - **Retries:** after 1, 5, 15 and 60 minutes, then every 3 hours, for at most 8 attempts. SMTP
    `5xx` and HTTP `4xx` other than `429` fail at once; `429` waits as long as `Retry-After` says.
  - **A message can carry `expires_at`:** a code's email is dropped when its code has expired, never
    sent late.
  - **Queuing makes the answer take the same time** whether or not an email goes out, which 190 and
    194 rely on.
- **A cap per address:** at most 10 messages to one `recipient_hmac` in an hour, all templates
  together. Messages over it are dropped and logged. Each feature's own limits (190's three a
  purpose an hour) sit below it, counted by 109's limiter in the database. The cap counts the
  outbox's own rows instead, which every replica sees: it limits messages, whatever queued them.
- **Templates** in `apps/web/messages/<locale>/mail.json`, in the three languages (129, the i18n
  tests checking keys and placeholders). Each message is:
  - plain text plus simple HTML: inline styles, no remote images, no tracking, no unsubscribe link;
  - the From name and the public address's host (`PUBLIC_URL`) say which instance sent it;
  - free of any link that signs anyone in, ending with "If this wasn't you…", what to do, and the
    instance contact;
  - sent with `Auto-Submitted: auto-generated`.

  The locale is the person's (`user.locale`), else the instance's default language, else English.
- **Security notices:** `sendSecurityNotice(user, kind)` queues one in the transaction of the change.
  189 sends them for the events that exist today:

  | Event (audit action) | Notice |
  |---|---|
  | `user.password_changed` | Your password was changed |
  | `user.password_reset` (root, or `reset-root-password`) | A root set a new password for you |
  | `auth.two_factor_enabled` / `auth.two_factor_disabled` | Two-factor sign-in was turned on / off |
  | `auth.backup_codes_regenerated` | New backup codes were made; the old ones no longer work |
  | `user.two_factor_reset` | A root turned off your two-factor sign-in |
  | `user.sso_linked` | A company sign-in was linked to your account |

  A notice can't be turned off by the person, as NIST asks. With email not set up, nothing is
  queued. Later features add their own kinds (190, 192, 194, 197).
- **Audit:**
  - `settings.mail` records what changed, a secret only as *replaced*;
  - `mail.test_sent` records the result;
  - notices aren't audited one by one: the event they follow already is.
- **Logs and metrics:** `mail.sent`, `mail.retry`, `mail.failed` and `mail.dropped` log events, with
  the outbox ID, template, transport and reason category, never an address or a body. 101's
  metrics count them.
- **Personal data:**
  - **Retention** (102) purges outbox rows after the IP-address days (90 by default).
  - **Erase** (103) deletes the person's rows.
  - **Your data** (104) lists the emails sent to the person (template, time, status). Their bodies
    are already gone.

**Out** (and where it goes instead):

- **Bounces, complaints and suppression lists:** the provider's own. Ronne doesn't read webhooks.
- **Email for in-app notifications (139), digests and anything else that isn't about an account's
  safety or sign-in:** not planned (owner, 2026-11-20). 139 stays in the app.
- **DKIM signing by Ronne, and OAuth sign-in to SMTP** (Microsoft 365's and Google's XOAUTH2):
  later, if asked. DKIM is the provider's.
- **SendGrid's web API:** SendGrid comes as an SMTP preset only.
- **Several transports with failover, attachments, an instance name setting:** not needed. The From
  name names the instance.

## Behaviour

**Root sets up Amazon SES.** On Admin › Settings › Email, root:

1. picks *Amazon SES (web API)*, the region `eu-west-1`, and pastes an access key ID and secret
   from an IAM user that may only `ses:SendEmail` from the instance's From identity (the steps say
   so);
2. types `marketplace@acme.com` and *Acme Marketplace* as the sender;
3. saves and presses **Send test email**.

The test arrives in root's inbox, and the status says *Working, tested 2 minutes ago*. The audit
log shows `settings.mail` (secret: replaced) and `mail.test_sent`.

**An operator keeps secrets out of the database.** The Docker host's `.env` sets
`RONNE_MAIL_TRANSPORT=smtp`, the host, `RONNE_MAIL_SMTP_TLS=starttls`, the user and password. The
tab shows every field *Set on the server*, and **Send test email** still works.

**A notice.** Ana turns off two-factor on her Account page. In the same transaction, the outbox
gets a row. A second later it's sent: "Two-factor sign-in was turned off for your account on
marketplace.acme.com at 14:02 UTC. If this wasn't you, sign in and turn it back on, change your
password, and tell your administrator: it-help@acme.com." (the instance contact). The row's body is deleted, and its status is `sent`.

**The provider is down.** The SMTP server refuses connections. The row goes back to `queued` with
`next_attempt_at` a minute later, then 5, 15 and 60. The tab shows *Failing* only after the last
attempt, or at once on a permanent error such as `535 authentication failed`.

## Edge cases

- **No instance contact:** the email setup still works and notices still go out, ending with "tell
  your administrator" without a contact. Turning on 190 or 194 is refused until it's set.
- **The instance contact is an `http://` URL or holds a user name:** refused on save.
- **Email isn't set up:** no notices are queued, and nothing fails. 190, 194 and 197 show their
  switches as unavailable, with the reason and a link to the tab.
- **Root changes the transport while messages are queued:** each message is sent through the
  transport set at the time it's sent.
- **`rotate-secret`:** it re-seals the settings, as for 136, and the queued `body_enc` values.
  Rows it can't open are dropped and logged.
- **A secret can't be opened** (the settings file was replaced): the status says *Failing:
  credentials can't be read, replace them*. Nothing is sent.
- **Two replicas:** the conditional claim stops a row from being sent twice in the normal case. A
  replica that dies after the provider accepted the message but before it marked the row sent can
  make it go out twice: delivery is at least once. Resend's idempotency key prevents that for
  Resend.
- **The person's address changes between queue and send:** the message goes to the address it was
  queued for. A notice about an email change is meant for the old address (197).
- **The person is erased while a message is queued:** erasure deletes the row, and nothing is sent.
- **Header injection:** From names, subjects and addresses with CR or LF are refused when saved and
  when rendered. nodemailer encodes headers.
- **Non-ASCII addresses:** refused, as 106 refuses them. Ronne doesn't depend on SMTPUTF8.
- **The From domain isn't verified at the provider:** the test shows the provider's error, cleaned,
  such as SES's "Email address is not verified".
- **Port 25 is blocked by the cloud host:** the presets use 587 or 465, and the docs say why.
- **A slow SMTP server:** connection, greeting and socket timeouts of 10, 10 and 30 seconds. A
  timeout is retried.
- **The test email is sent too often:** the sixth in 10 minutes is refused with the wait.

## Data

- **Migration:** `mail_outbox` with columns
  - `id` (ULID), `template`, `locale`, `recipient_hmac`, `user_id` (nullable, no foreign key, so
    the row outlives a deleted user until it's purged);
  - `body_enc` (nullable text), `status`, `attempts`, `next_attempt_at`, `claimed_until`,
    `expires_at`, `last_error`;
  - `created_at` and `sent_at`.

  It's indexed on `(status, next_attempt_at)` and `(recipient_hmac, created_at)`. One migration for
  all three databases.
- **`instance_settings` keys:** `mail_transport`, `mail_from_address`, `mail_from_name`,
  `mail_smtp_host`, `mail_smtp_port`, `mail_smtp_tls`, `mail_smtp_user`, `mail_smtp_password_enc`,
  `mail_api_key_enc`, `mail_region`, `mail_domain`, `mail_ses_access_key_id`,
  `mail_ses_secret_access_key_enc`, `mail_contact` (the instance contact; also
  `RONNE_MAIL_CONTACT` when the environment sets the email setup), `mail_reply_to` (also
  `RONNE_MAIL_REPLY_TO`), and `mail_last_status` (JSON: status, time, reason category).
- **`jobs` row:** `mail_outbox`.

## Documentation

- **New topic `email`** (Admin › Settings › Email), in ronne-web and in both `topics.ts`:
  - `setup`: the tab, the transports, the test;
  - `providers`: a guide per preset and API, with the least-privilege credentials;
  - `domain`: SPF, DKIM and DMARC for the From domain, with each provider's own pages;
  - `environment`: the `RONNE_MAIL_*` variables and `RONNE_MAIL_HOSTS`;
  - `notices`: which security notices go out, and why they can't be turned off;
  - `troubleshooting`: blocked ports, unverified senders, TLS errors.
- **`privacy`:** the outbox, what it keeps and for how long; the email provider as a processor
  (root needs an agreement with it, and SES and Mailgun offer EU regions).
- **`security#encryption`:** the email credentials and the queued bodies are sealed.
- **`account`:** a sentence on security notices.
- **`docs/runbooks/install.md`:** the variables.
- **Helpers:** the Email tab's help links (`email#setup`, `email#domain`), and the Account page's
  security section (`email#notices`).

## Acceptance criteria

- [ ] Root sets up each of the five transports. **Send test email** reaches root's own address (the
  SMTP and HTTP fakes in tests, and the real SES sandbox once by hand), and the status follows.
- [ ] STARTTLS is required on 587, and a server that doesn't offer it fails. Certificates are
  verified. No TLS works only for a host in `RONNE_MAIL_HOSTS`, and never with credentials. An SMTP
  host resolving to a private address is refused unless listed.
- [ ] Secrets are sealed, never shown, never in logs or audit rows. `rotate-secret` re-seals them and
  the queued bodies.
- [ ] `RONNE_MAIL_TRANSPORT` makes the whole tab read-only from the environment.
- [ ] A message is queued in its change's transaction; a rolled-back change queues nothing.
- [ ] A sent, failed or dropped row has no body. An expired code's email is dropped, not sent.
- [ ] Retries follow the schedule. Permanent errors don't retry, and `429` waits for `Retry-After`.
- [ ] Two processes against one database never send a row twice in the tests.
- [ ] The cap of 10 an hour per address holds across templates.
- [ ] The instance contact is validated, appears in every security notice, and is required before
  190's or 194's switch can be turned on.
- [ ] The Reply-To is required to save the email setup, validated, and on every message sent.
- [ ] The six security notices go out in the person's language. Nothing is queued when email isn't
  set up.
- [ ] Retention purges rows, erase deletes the person's, and *your data* lists them.
- [ ] The migration and the outbox db tests pass on SQLite, PostgreSQL, MySQL and MariaDB.
- [ ] The Documentation and helpers say what the feature does, in three languages.

## Decisions

1. **SMTP and the providers' web APIs** (owner, 2026-11-20: "both"). The APIs are four `fetch`
   calls with fixed hosts, so there are no vendor SDKs to follow; the AWS SDK alone would weigh
   more than the feature.
2. **nodemailer for SMTP and for composing MIME** (owner, 2026-11-20). SMTP and MIME are where a
   hand-written client goes wrong (dot-stuffing, header encoding, STARTTLS, line lengths). nodemailer
   has no dependencies, is maintained, and is on 10.x (Node.js 20 or later). Its licence is
   **MIT-0**, MIT without the attribution clause, as permissive as 0BSD, which is already allowed.
   Task 2 adds MIT-0 to the dependency policy §1 and to `license-policy.json`.
3. **The environment wins, all or nothing** (Claude). This is 136's rule (the operator's settings
   win). Taking the whole setup from one place avoids a half-environment, half-database transport
   that nobody can reason about.
4. **A transactional outbox with sealed bodies, deleted once sent** (Claude, from the owner's data
   protection rule). A notice can't be lost to a crash, and a code can't be read from the database
   or a backup after it's sent.
5. **TLS always, certificates always verified** (Claude): OWASP's transport rules. Plain SMTP only
   to a relay the operator names, and never with credentials.
6. **The test email goes only to the signed-in root** (Claude). A typed recipient would make the
   tab a way to send mail from the instance's domain to anyone.
7. **Security notices can't be turned off** (Claude, NIST SP 800-63B-4 §4).
8. **At-least-once delivery** (Claude). Exactly once can't be had over SMTP, and a duplicate notice
   does no harm.
9. **An instance contact in every security notice** (owner, 2026-11-20). NIST SP 800-63B-4 §4.6
   asks that a notice give the recipient clear instructions and whom to contact if they didn't make
   the change. It's required before anyone can create an account (190) or reset a password by email
   (194), the two features that let people act without a root.
10. **A Reply-To root must set** (owner, 2026-11-20): someone who answers a code or a notice reaches
    a person, whatever the From address is.
11. **No email for in-app notifications** (owner, 2026-11-20): email is for an account's safety
    and sign-in only.

## Open questions

None.
