# 194 — Forgot password by email

> Milestone: M32 · Depends on: 109, 189, 190, 162, 105, 128 · Design: [MVP §15](../../../MVP/MVP.md#15-decision-log) ("Web sign-in"), [MVP §14.3](../../../MVP/MVP.md#143-sso--planned-as-m16) · Standards: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b/) §3.2.2 and §4

## Goal

Today "Forgot?" on the sign-in page opens a note (`features/sign-in/ForgotPassword.tsx`,
`auth.signIn.forgotNote`): a root resets your password in Users, and the only root runs
`reset-root-password`. Since the instance can now send email (189), a person can reset a forgotten
password themselves, with a 6-digit code sent to their address.

The owner's goal is the person's safety (owner, 2026-11-20). An emailed code proves only that
someone reads the inbox. It never signs anyone in: it opens one page that does one thing, set a new
password, after the account's two-factor step when it has one. Then every session ends and the
person signs in again with the new password. The flow follows the OWASP Forgot Password Cheat
Sheet: the same answer and the same time whether or not the account exists, no automatic sign-in,
sessions and other codes ended, and a notice sent afterwards.

## Scope

**In:**
- **A setting** on the Authentication tab (122): *People can reset a forgotten password by email*.
  Off by default. It can be turned on only while email is set up, its last test passed, and 189's
  **Instance contact** is set. Every security notice prints that contact, so a person who didn't ask
  for a reset knows whom to tell (NIST SP 800-63B-4 §4.6). Clearing the contact turns the setting
  off, and the audit row says why.
  - "Its last test passed" is about the setup as it is: a change to how email is sent (the
    transport, the sender's address, the server, the region or domain, a credential, even one
    typed again) clears the last test's result, so the Email tab says untested until a new test.
    The contact, the sender's name and the reply-to address keep it. A success names the setup it
    went through, so a test or send of the old setup that ends after the change doesn't count for
    the new one.
  - Turning it on reads email's readiness in its own transaction and holds the contact's row, so
    a contact cleared at the same moment leaves it off.
  When it's off, or email stops working, "Forgot?" shows today's note unchanged.
- **The request page**, `/sign-in/forgot`: one field, the email address. The reply is always the
  same page and words: "If an account can reset its password with this address, we've sent it a
  code. It works for {minutes} minutes." The request also sets the flow's cookie (below) and moves
  to the code page.
- **What is sent**, decided on the server and never shown on the screen:

  | The address belongs to | Email sent |
  |---|---|
  | An active account that may use a password | The code |
  | A root account | No code. "Root accounts don't reset by email: ask another root, or run `{command}` where Ronne is installed" (`reset-root-password` as the instance types it, #147) |
  | An account with no password (made by an identity provider or SCIM), or one that *Root only* (106) keeps off passwords | No code. "You sign in with {providers}." |
  | A disabled account, or one waiting for root's approval (190) | Nothing |
  | No account (an erased one included: its email is a pseudonym, 103) | Nothing |

- **The code**: one of 190's one-time email codes, purpose `password_reset`, tied to the request's
  flow (its subject is the flow), so it never works alone. Every flow gets one, emailed only when
  the table says so, so the code page answers alike for every address (its tries, its end, its
  replacement); a newer request for the address ends the earlier codes, found by the address's
  HMAC the codes keep. The code page answers at the request's 400 ms floor too.
  Its rules are 190's:
  - 6 digits from a cryptographic random source, stored only as an HMAC;
  - it lasts for the *Code lifetime* setting (15 minutes by default);
  - 5 wrong tries end it, and a new one ends the one before;
  - it works once;
  - it can be resent after 60 seconds, and at most 3 are emailed per address per hour.
- **The code page**, `/sign-in/forgot/code`: the six boxes of `components/ui/CodeInput.tsx`, *Send
  a new code*, and *Use another address*.
- **The two-factor step**, `/sign-in/forgot/two-factor`, only when the account has two-factor on
  (105): a code from the app or a backup code, as at sign-in (`TwoFactorStep.tsx`).
  - A backup code used here is spent.
  - A TOTP code already accepted is refused, as at sign-in.
  - Wrong codes count with the sign-in's own, so the reset gives no extra guesses: Better Auth's
    account lockout (ten in a row lock it for 15 minutes), checked here without a session, as
    the reset has none. Checks for one account run one at a time (its two-factor row is held), so
    guesses sent at once get no more; a used or empty code counts as a failure.
  - Two-factor turned off (or reset by root) before this step: the step is passed.
  - Someone who lost the authenticator and its backup codes can't go on. The page says a root
    resets two-factor, as today.
- **The new-password page**, `/sign-in/forgot/new-password`:
  - the new password twice, with the password rules (`identity/models/password.ts`; 196 adds the
    breached-password check);
  - the box *Also revoke my access tokens*, checked by default. This is 162's box on Change
    password: a forgotten password may be a stolen one.
- **What a reset does**, in one transaction:
  - sets the password and clears a pending *must change your password* (128), since the person
    just chose it;
  - ends every session of the account;
  - ends the account's other `password_reset` codes and reset flows, and its pending device
    grants (107);
  - revokes the access tokens if the box was checked;
  - records `user.password_reset_by_email` in the audit log.

  The account's row is held while the transaction runs, so a change made at that moment (made
  root, disabled, erased) is waited for and seen. Once the reset has committed, it also ends the
  account's sessions created up to the commit (100 ms later), which catches a sign-in with the old
  password whose session write waited for the reset.

  **A known limit, shared with Change password and root's Reset password** (owner, 2026-11-23): a
  sign-in, or another session's Change password, that is already checking the old password at
  the instant of the reset can still end with a session. Better Auth checks the password and then
  creates the session, so a check that spans the commit gets a session stamped after it, and its
  Change password gives the changer a new session after writing its own password. The person is
  emailed of each change. Closing it needs a check when every session is created, against the
  moment the account's password last changed: feature 200, for the whole app.

  After the transaction, 189's "password changed or reset" security notice is emailed
  (`queueSecurityNotice`), saying the reset was by email. Then the person
  lands on the sign-in page with "Your password is changed. Sign in with it." They aren't signed in.
- **The reset flow's state**: a `password_reset_flows` row and a cookie.
  - The cookie holds 32 random bytes and the row only their SHA-256, so a database read can't
    continue a flow.
  - The cookie is HttpOnly, SameSite=Strict, Path `/sign-in/forgot`. It has the `__Host-` prefix
    and Secure when the public URL is https, as the session cookie's prefix follows it
    (`identity/models/session-cookie.ts`).
  - The value is replaced at every step (code checked, two-factor passed), so a cookie copied
    early can't skip a step.
  - The row has: the hash; the user, or null for an address that gets no code; the step; the
    expiry; the creation time. It holds no email address.
  - The flow lasts as long as its code. The new-password step's grant lasts 10 minutes from the
    moment the code (or two-factor) was accepted, and is used once.
- **Rate limits**, through 109's limiter, counted in the database so every replica shares them:
  - per client IP (with `TRUST_PROXY=true`): 10 requests per hour, and 30 code tries per hour;
  - per address: 190's 3 emails per hour, counted from the `email_codes` rows.
  - After 20 wrong reset codes in 24 hours, reset by email pauses for that account for 24 hours
    after the 20th (counted from the account's own audit record of wrong reset codes, so flows
    that ended, and a change of address, still count; tries at once for one account are counted
    one after another).
    That's well under NIST's 100 failures, and it never locks the account's sign-in (OWASP: no
    lockout from forgotten-password attacks).
- **Bots**: 190's honeypot field, minimum fill time and the optional proof-of-work challenge, on the
  request page.
- **Same time**: each request does the same work whether or not an email goes out: it looks up the
  address, computes an HMAC and writes a flow row. The email is queued in the outbox (189), so
  sending is never on the request's path. A real account's request still writes more (its code,
  its email, its audit row), so every answer, a refusal included, waits until 400 ms after the
  request began (OWASP: responses in a consistent amount of time). It is a floor, not a fixed
  time: the extra writes take tens of milliseconds, and only a database stalled for longer than
  the floor on that one request would show.
  - The per-address limit is taken before the transaction, as 190's is: a request whose
    transaction then fails still counts, which errs towards fewer emails.
  - The 60-second wait between emails is the address's, whichever flow asks.
  - Requests at once for one account hold its row in turn, so only the newest code works.
- **Signed in already**: `/sign-in/forgot` sends a signed-in person to Account › Change password.
- **Screen text and emails** in English, Brazilian Portuguese and Canadian French (129). The email
  is in the language of the page it was asked from.

**Out** (and where it goes instead):
- **A link in the email instead of a code**: a code is what the owner asked for. A link that opens
  the new-password page would be one more thing that can leak (logs, referrers, mail scanners
  opening it).
- **Resetting two-factor by email**: still a root's action (`user-admin.ts` `resetTwoFactor`,
  `reset-root-password`). An email that removes the second factor would make it worthless.
- **Root accounts by email**: never (Decision 3).
- **`rmk`, the MCP server and the API**: they don't reset passwords. A person resets in the web app,
  then signs in to `rmk` again.
- **The breached-password check**: 196.

## Behaviour

**Ana forgot her password.** She clicks *Forgot?*, types `ana@acme.com` and sends. The page
says a code is on its way, and the next page asks for it. The email has `482 913`, the instance's
name and "If you didn't ask for this, ignore this email: your password hasn't changed." She types
the code. Her account has two-factor, so she enters the code from her app. She chooses a new
password, leaves *Also revoke my access tokens* checked, and saves. Her laptop's open session ends
too. She gets "Your Ronne password was reset at 14:02 UTC. If this wasn't you, reset it again and
contact {instance contact}". The sign-in page asks her to sign in.

**Someone types `bob@acme.com`, which has no account.** They see the same pages, and the same code
page, in the same time. Every code they try is wrong, and after five the flow ends: "Ask for a new
code". No email goes anywhere.

**Carla's account came from Entra (106) and has no password.** She asks for a reset and gets "You
sign in with Acme Entra. Use *Continue with Acme Entra* on the sign-in page." Her screen said the
same as Ana's.

**An attacker has Dan's inbox, but Dan has two-factor.** They get the code, pass the first step and
stop at the two-factor step. Dan's audit log shows `auth.password_reset_requested` and the
two-factor failures. Dan gets no "password was reset" notice, because nothing was reset.

## Edge cases

- **Two requests in a row**: the second code ends the first, and the first flow's cookie stops
  working ("This code was replaced. Use the newest email").
- **The flow cookie is missing** (another browser, or cookies blocked): the code page says to start
  again on this browser. The code is tied to its flow, never usable alone.
- **The code expires on the code page**: "This code has expired. Send a new one."
- **Two-factor is turned on or off, or reset by root, between steps**: the flow follows the account
  as it is when each step runs. A flow that skipped two-factor before it was turned on is sent back
  to the two-factor step.
- **The account is disabled, made root, or erased mid-flow**: the next step refuses ("This reset
  can't continue") and the flow ends. A root's account never reaches the new-password page.
- **The password policy becomes *Root only* mid-flow**: the next step refuses, as at sign-in.
- **Email is turned off mid-flow**: a code already sent still works. New requests show the old note.
- **The email address has different letter case or spaces**: normalised as at sign-in
  (`normalizeEmail`).
- **MySQL and MariaDB compare accents loosely** (`kåte@` = `kate@`): only the exact address gets the
  code, as 106 does.
- **The new password equals the current one**: allowed. The person proved who they are, and
  refusing would show that the reset reached a real account. 196's checks still apply.
- **`AUTH_SECRET` rotated (`rotate-secret`)**: open codes and flows stop working (their HMAC key
  comes from it). People ask again.
- **Several replicas**: every limit is counted in the database (109, and the code rows), so a
  request sent to another replica counts the same.
- **Open sign-in sessions on phones and `rmk login --web` grants waiting for approval**: ended and
  cancelled with the rest.

## Data

- **`password_reset_flows`**: `id` (ULID), `token_hash`, `user_id` (nullable, FK, cascade on delete),
  `step` (`code`, `two_factor`, `new_password`), `expires_at`, `two_factor_at` (when the two-factor
  step was passed, so a flow that skipped it is sent back if two-factor is on by the new-password
  step), `created_at`. No email, no IP.
- **Codes**: 190's `email_codes`, purpose `password_reset`.
- **Retention**: the purge job (102) deletes flows and codes a day after they expire.
- **Erasure (103)** deletes the account's flows and codes. **Your data (104)** lists open reset
  flows (step and expiry only, never the code).
- **Audit events** (IPs cleared by retention):
  - `auth.password_reset_requested`: account found, kind of email sent. Recorded only for a real
    account, so an unknown address leaves no trace and nobody can fill the audit log with them;
  - `auth.password_reset_code_failed`;
  - `auth.password_reset_two_factor_failed`;
  - `user.password_reset_by_email`: sessions ended, tokens revoked (or kept), and whether the
    account's two-factor step was passed (the flow keeps when, not which method; a failure is
    audited with its own event).

## Documentation

- **Your account** (`account#signing-in`): a new section *Forgot your password* (`account#forgot`):
  the steps, the two-factor step, what a reset ends, the notice, and what root and SSO accounts do
  instead. New section id, so `topics.ts` changes here and in ronne-web.
- **Authentication** (`authentication#overview`): the setting, that it needs email (189), and why
  root accounts are left out.
- **Privacy** (`privacy#retention`): reset flows and codes, and how long they are kept.
- **Helpers**: the *Forgot?* note links to `account#forgot` when the feature is on. A helper beside
  the setting on the Authentication tab.

## Acceptance criteria

- [ ] With the setting off or email not working, *Forgot?* shows today's note; with it on, it opens
  `/sign-in/forgot`.
- [ ] The setting can't be turned on without working email and 189's Instance contact, and clearing
  the contact turns it off (audited).
- [ ] Every row of the "What is sent" table sends what it says and shows the same screens, with
  response times that a test can't tell apart (same work on each path; the email is queued).
- [ ] A right code, then the account's two-factor when it has one, opens the new-password page; no
  step signs anyone in.
- [ ] The grant lasts 10 minutes, is used once, and only from the browser that holds the flow's
  current cookie; a cookie from an earlier step is refused.
- [ ] A reset sets the password, clears 128's hold, ends every session, ends other codes and flows
  and pending device grants, revokes tokens when the box is checked (by default), is audited, and
  sends the notice; the person lands on sign-in, signed out.
- [ ] Root accounts never get a code; their email names the reset command.
- [ ] The limits: 5 tries a code, 3 emails per address per hour, 10 requests per IP per hour, the
  24-hour pause after 20 wrong codes, and sign-in itself never locked.
- [ ] Retention, erasure and Your data cover the new table.
- [ ] Screens and emails in all three languages; the Documentation and helpers say what the feature
  does.

## Decisions

1. **An emailed code never signs anyone in** (owner, 2026-11-20, following OWASP "Don't
   automatically log the user in"). The owner's first idea was to sign in with the code and change
   the password on Account. That would make the inbox enough to enter the account, two-factor
   included. The code opens only the new-password page.
2. **Two-factor is asked during a reset** (owner, 2026-11-20). Without it, an email would undo
   105. NIST 800-63B-4 §4.2 treats replacing a forgotten password while another authenticator still
   works as binding a new authenticator, so the person must pass the one they have.
3. **Root accounts reset only on the server** (owner, 2026-11-20). `reset-root-password` needs a
   shell where Ronne is installed. Root's mailbox is a weaker key than that.
4. **Tokens revoked by default** (owner, 2026-11-20): 162's box, checked, because a forgotten password
   may be a stolen one. The person can uncheck it.
5. **Off until root turns it on, and only with an Instance contact** (owner, 2026-11-20): it sends
   email to anyone who types an address, so root decides when the instance's email is ready for it;
   and every notice must say whom to tell when the reset wasn't theirs (NIST SP 800-63B-4 §4.6).
6. **A flow row per request, even for unknown addresses** (Claude): it is what keeps the code page
   and the timing identical. It holds no address and expires with the code.
7. **The same password is allowed** (owner, 2026-11-20): refusing it would leak that the account
   exists to the one person who already proved they read its email, and adds nothing.

## Open questions

None.
