# 128 — Change the password at first sign-in

> Milestone: M18 · Depends on: 006, 008, 105, 129 · Design: [MVP §3](../../MVP/MVP.md) (identity) · Contracts: none changed (the web app only)

## Goal

Root creates accounts and hands over a password (008), so the person starts with a password
someone else chose and knows. After this feature, root can require that password to be replaced
the first time the person signs in, so only the person knows their password.

## Scope

**In:**
- **A flag on the account,** `user.password_change_required_at`: set when root creates a user or
  resets a password, cleared when the person sets their own.
- **A checkbox for root** on Create user and Reset password: **Ask them to choose a new password
  when they sign in**, checked by default. Unchecking it is allowed (root may be setting up a
  shared test account) and is audited.
- **A hold.** While the flag is set, every page in the app frame redirects to
  `/account/password` (the change-password page, with a short explanation), the same mechanism as
  the two-factor hold (105): `holdPage` checks it first on every page, and the guard test lists
  every page. Allowed while held: that page, sign-out and the language switch (129).
- **Same on the API.** A token belonging to a held account answers `403` with the error code
  `password_change_required` on everything but `GET /api/v1/me` (so `rmk` can tell the person what
  to do); tokens are created only through the web app, which is held, so this covers a token that
  existed when root reset the password (reset also revokes tokens, 008, so the case is rare). A
  held token cannot sign out of `rmk` either (`DELETE /api/v1/auth/token` is refused too); the token
  is useless meanwhile and can be revoked in the web app. `POST /api/v1/auth/token` (email and
  password) still hands out a token, which is held in the same way.
- **Setting the new password** uses the existing form and rules (password policy, length), must
  differ from the temporary one, clears the flag, ends the account's other sessions, and returns to
  the page they asked for. It is audited as `user.password_changed` with `required: true`.

**Out** (and where it goes instead):
- Password expiry or rotation for everyone: not planned.
- Accounts without a password (SSO, SCIM-provisioned): never flagged.
- `rmk-server reset-root-password`: it prints a new password for root, who is at the terminal and
  signs in once; not flagged (stated in the Documentation).
- The setup wizard's root account: not flagged (root just chose that password).

## Behaviour

- **Order of holds.** Password change first, then two-factor enrolment (105): a person who must do
  both changes the password and is then taken to set up two-factor.
- **Device flow** (107): the approval page is held like any other; after the change the person
  returns to the code page (`next` is kept, as the two-factor hold does).
- **Root resets their own password** from the Users list: not flagged (they just chose it), the
  checkbox is hidden for one's own account.
- **What the hold does not cover**, as with the two-factor hold (105): Better Auth's own endpoints
  (`/api/auth/*`, which the app's forms call and where the password is changed) and the
  `/current-workspace` redirect, which only sets a cookie. Neither shows or changes anything of
  anyone else's, and only the app's form clears the flag.
- **The user page** (123) shows "Must change password at next sign-in" with a way for root to
  clear or set the flag without changing the password.
- **Messages** are in the person's language (129), including the page's explanation. The audit log's lines for the new events
  are English like the rest of the log, and the API's `password_change_required` message is English
  as the API is.

## Edge cases

- A person who signs in on two devices: both are held until one changes it; the change ends the
  other sessions, so the second signs in again with the new password.
- Choosing the same password as the temporary one is refused with a message.
- The password is changed first, then the flag is cleared with the audit event in one transaction:
  if the database fails between the two, the person stays held and changes it once more.
- Root disables the account while it is flagged: the flag stays and applies when re-enabled.
- Two-factor "reset" by root (105) doesn't touch the flag.
- Erasing the account (103) removes the account, so the flag goes with it.

## Documentation

- **Admin** (`admin.tsx`, creating users and resetting passwords): the checkbox, what the person
  sees, that SSO accounts aren't affected.
- **Account** (`account.tsx`): the first-sign-in page.
- **Password sign-in** (`password-sign-in.tsx`): one line that a temporary password has to be
  replaced when root asks for it.
- **Helpers:** on the checkbox, "Why ask?" → the Admin section.
- Both `topics.ts` change only if a section is added.

## Acceptance criteria

- [x] Create user and Reset password set the flag by default; unchecking is possible and audited;
      root's own reset doesn't offer it.
- [x] A flagged account is redirected from every app page to the change-password page; a guard test
      fails when a page forgets the hold.
- [x] The API answers `password_change_required` for a flagged account's token, except `GET
      /api/v1/me`.
- [x] Changing the password clears the flag, ends other sessions, refuses the temporary password
      and returns to the page asked for (and keeps `/device`'s code).
- [x] The two-factor hold follows the password hold; neither blocks sign-out.
- [x] SSO, SCIM and the setup's root are never flagged.
- [x] Migration runs on all three database kinds; everything is in messages (129) in three
      languages; the phone sweep passes.
- [x] The Documentation and helpers above say what the feature does now.

## Decisions

- **Checked by default** on Create user and Reset password (owner, 2026-10-20).

## Open questions

- An instance-wide default for the checkbox is possible, but not planned.
