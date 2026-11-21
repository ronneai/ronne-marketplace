# 197 — Verified email change

> Milestone: M32 · Depends on: 109, 189, 190, 191, 105, 106, 108, 123 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("Web sign-in") · Standards: [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) (re-authentication before sensitive changes), [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b/events/) §4.6 (notifications)

## Goal

Today nobody can change an account's email in the app. Account has Password, Security, Tokens,
Language and Your data (`app/(app)/account/`), and root's user page (123) has no email field. Only
SCIM changes emails: the identity provider owns them, and a value changed by hand goes back
(`services/scim-users.ts`). An address that changes means asking a root to create a new account.

Once email is how a person proves who they are (190's sign-up, 194's reset), the address must be
one they really read. This feature lets a person change their own email after proving it twice:
their password and two-factor again, then a code sent to the new address. The old address is told,
so a takeover can't move the account quietly. Root can change someone's email too, and both
addresses are told.

## Scope

**In:**
- **Account › Email** (`/account/email`, a new item in Account's navigation): the current
  address, and *Change email*.
- **The person's change**:
  1. They type the new address and their current password, and a two-factor code when two-factor
     is on (105). This is the OWASP re-authentication before a sensitive change. Wrong passwords
     and codes count with the sign-in's limits (109).
  2. The new address is checked:
     - a plain ASCII address (106's rules);
     - not on the instance's block list (191);
     - on the allowed domains of the way in that made the account (`user.created_via`, 191);
       accounts made by root or at setup have only the block list.
  3. A code is sent to the new address: one of 190's one-time email codes, purpose
     `email_change`. It follows 190's rules: 6 digits, the code lifetime, 5 tries, 60 seconds
     before a resend, 3 per hour.
  4. They type it in the six boxes (`CodeInput`).
  5. The email changes. A security notice of a new kind, `email_changed`, goes to the **old**
     address: "The email of your account on {instance} was changed to {masked new address} at
     {time}. If this wasn't you, tell a root now." It is the last email the old address gets. A
     confirmation goes to the new address.
  6. The account's other sessions end; this one stays. Open password-reset flows (194) and other
     open codes end.
  7. The change is recorded in the audit log.
- **An address already taken by another account**: the person sees exactly what they see for a free
  address ("We sent a code to …"). That address gets an email saying someone tried to use it for
  another account and that it already has one. No code that works is sent, so a signed-in person
  can't use this page to find out who has an account.
- **Accounts whose email belongs to an identity provider** are refused with the reason, "Your email
  comes from {provider}. Change it there.":
  - managed by SCIM (108): the provider would put the old address back;
  - linked to a company identity provider (106).

  192 decides what a link to Google, LinkedIn or Apple means for this rule.
- **Root's change** on the user page (123), with `users.manage`:
  - a new address and a reason; no code;
  - the same address checks (the block list, ASCII, not taken; root sees "taken" plainly);
  - the `email_changed` notice to the old address and a confirmation to the new one;
  - recorded in the audit log with the reason.
  - Refused for SCIM-managed accounts, with the same reason.
  - Root changes their own email on Account, like anyone. Their own row on the user page has no
    *Change email*.
- **Without working email** (189 not set up, or its last test failed): the person's *Change email*
  says to ask a root. Root's change works, and the audit row says the notices couldn't be sent.
- **One open change per account**: a new request replaces the open one and ends its code.
- **The change is exact**: under MySQL and MariaDB, which compare accents loosely, an address that
  matches another account's only loosely is refused, as 106 refuses it.
- **Screen text and emails** in all three languages (129).

**Out:**
- **Changing the email from `rmk`, the MCP server or the API**: web only.
- **Several addresses per account** (NIST §4.6 asks a CSP for two notification addresses): a
  later feature; the one address is the notification address.
- **Undoing a change from the old address** ("this wasn't me" link): no links in emails (189's
  rule). The notice says to tell a root, who can change it back and reset the password.

## Behaviour

**Gina moves from `gina@oldco.com` to `gina@newco.com`.** On Account › Email she types the new
address, her password and her app's code. A code arrives at `gina@newco.com`; she types it and the
page shows the new address. `gina@oldco.com` gets "…was changed to g***@newco.com…". Her phone's
session ends; the laptop stays signed in.

**An attacker with Hal's session tries to move his account.** They don't know his password, so the
first step fails, and the failures are audited. If they had the password too, they would also need
Hal's two-factor code. Without two-factor, Hal still gets the notice at his old address the moment
the change happens.

**Root changes Ivan's email** after he lost access to his old mailbox. Root types the new address
and "Ivan left the old domain; ticket 4411". Ivan's old and new addresses both get an email, and the
audit row has the reason.

## Edge cases

- **The new address equals the current one** (after normalising): refused, "That's already your
  email."
- **The address is taken by the time the code is typed**: the change fails in its transaction with
  "That address is now in use. Choose another." By then the person has proven they read that inbox,
  so saying so leaks nothing.
- **The code is typed on another browser**: allowed if the same person is signed in there. The code
  belongs to the open change, not to the browser.
- **Two-factor reset by root, or the password changed, mid-change**: the open change ends; the person
  starts again.
- **The account is disabled or erased mid-change**: the code stops working.
- **The block list gains the new address's domain mid-change**: checked again when the code is
  typed.
- **The email is used to sign in with `rmk login` (email and password)**: the new address works at
  once; tokens are kept.
- **An identity provider links by email later (106, step 4)**: the link uses the new address, as it
  would for any account.

## Data

- **`email_changes`**: `id` (ULID), `user_id` (FK cascade), `new_email`, `created_at`, `expires_at`.
  At most one row per account. The code is in 190's `email_codes`, subject the change's id.
- **Retention (102)** deletes rows a day after they expire. **Erasure (103)** deletes the account's
  rows. **Your data (104)** lists an open change (new address and expiry).
- **Audit events**:
  - `user.email_change_requested`;
  - `user.email_change_failed` (reason);
  - `user.email_changed` (by self or root, old and new addresses, root's reason, which notices
    were sent).
- **Erasure and earlier addresses.** Erasure (103) already turns the account's *current* address
  into the pseudonym wherever an event's metadata holds it as a value
  (`audit/repositories/kysely-audit-rewrite.ts`). The events that carry an email today are:
  - `user.created` (root's Create user, the root account at setup, an SSO or SCIM first sign-in);
  - `user.updated`'s relink (SCIM);
  - `auth.sign_in_failed` (the web, and `rmk login`'s token exchange);
  - SSO's refusals.

  After this feature an account can have had several addresses, so erasure also rewrites every
  earlier one, taken from the account's `user.email_changed` events: both addresses there, and the
  same address in every other event.
  - An earlier address may belong to someone else by now. Its rewrite then stops at the moment it
    left this account (that `user.email_changed` event's time), so the next owner's events keep
    their address.
  - The open `email_changes` row's address is deleted with the row.
  - The rewrite keeps 103's progress on the erasure's row and resumes after a crash, one address
    after another.

## Documentation

- **Your account**: a new section, *Your email* (`account#email`): how to change it, what the old
  address is told, and accounts managed by a provider. New section id, so `topics.ts` changes here
  and in ronne-web.
- **Users** (`admin#users`): root's *Change email*, the reason and the notices.
- **Privacy** (`privacy#your-data`, `privacy#erase`): the open change in Your data, and erasure
  replacing every address the account has had.
- **Helpers**: a helper on Account › Email linking to `account#email`.

## Acceptance criteria

- [ ] A person changes their email only with their password, their two-factor code when it's on,
  and a code sent to the new address; each wrong step is audited and limited.
- [ ] A taken address shows the same screen and gets the "already has an account" email, never a
  working code.
- [ ] After a change: the old address gets the `email_changed` notice with the new address masked,
  the new one a confirmation; other sessions end; reset flows and open codes end; audited.
- [ ] SCIM-managed and company-provider accounts are refused with the reason, on Account and on
  root's page.
- [ ] Root's change asks a reason, notifies both addresses, and is audited; root's own row has no
  *Change email*.
- [ ] The block list and, for sign-up accounts, the allowed domains are applied when asking and
  again when the code is typed.
- [ ] Retention, erasure and Your data cover `email_changes`.
- [ ] Erasing an account that changed its email replaces every address it has had with the
  pseudonym in its audit records' metadata (`user.created`, `user.email_changed`,
  `auth.sign_in_failed` and the rest); an earlier address now owned by another account is rewritten
  only up to the change, so the other account's events keep it; on SQLite, PostgreSQL and MySQL.
- [ ] Screens and emails in all three languages; the Documentation and helpers say what it does.

## Decisions

1. **Password, two-factor and a code to the new address** (owner, 2026-11-20, "keep the safety for
   the user"): the session alone isn't enough to move the account to an inbox an attacker controls.
2. **Tell the old address, every time** (owner, 2026-11-20; NIST §4.6): it is the only warning a
   person gets when someone else moves their account.
3. **A taken address looks like a free one** (Claude): the page must not become a way to find out
   who has an account.
4. **Identity providers own their emails** (Claude): SCIM would undo a change, and a company provider
   created the account for its domain (106).
5. **Root's change needs no code, but a reason** (owner, 2026-11-20): root fixes accounts whose
   owner lost the old inbox. The reason and both notices keep it accountable.
6. **The audit keeps both addresses, and erasure removes them** (owner, 2026-11-20): the account's
   history stays complete while the person is here; once they're erased, every address they had
   becomes the pseudonym, as 103 already does for the current one.

## Open questions

None. Which way in made an account comes from 191's `user.created_via`.
