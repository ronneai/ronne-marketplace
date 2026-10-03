# 074 — Account, Admin, sign-in and setup on phones

> Milestone: M10 · Depends on: 066, 067, 068, 069, 006, 008, 009, 036, 046, 060 · Design: [MVP §8](../../MVP/MVP.md#8-web-application) · Contracts: none new

## Goal

The remaining pages need small work once the primitives (067) and tables (069) are fixed:
- **Sign-in and setup** already stack on a phone. What's left: field zoom, the "Forgot?" target,
  and `dvh`.
- **Access tokens.** A new token and its `rmk login --token …` line scroll sideways in one line.
- **Admin.** The audit log's four filters push the table about 280px down. A user's row actions
  are three small text buttons.
- **The setup wizard** may be run from a tablet or phone on the same network as a new Docker
  instance. It needs to work there end to end.

This feature finishes these pages so every page passes the sweep.

## Scope

**In:**
- **Sign-in** (`SignInPage.tsx`, `SignInForm.tsx`, `ForgotPassword.tsx`, `CliAuthPanel.tsx`):
  - The keyboard order goes email → password → Remember me → Sign in. Today "Forgot?" sits between
    email and password (seen on Android, 065), so a phone keyboard's "next" lands on it.
  - The "Forgot?" summary gets a 44px target.
  - The email field has `autocomplete="username"`, `inputmode="email"`, `autocapitalize="none"`
    and `autocorrect="off"`. The password field has `autocomplete="current-password"`. Check what
    exists and add what's missing, so phone keyboards and password managers behave.
  - The CLI panel stays under the card on phones.
- **Setup wizard** (`features/setup`):
  - The database select shows short option labels, with the long explanation as text under the
    select.
  - Host and port stack below `sm` (already).
  - The step indicator wraps (already).
  - Fields get the right `inputmode` (port: `numeric`) and `autocomplete="off"` for secrets.
  - The wizard runs end to end in the phone project, including its no-JavaScript variant.
- **Change password** (`ChangePasswordForm.tsx`): `autocomplete="current-password"` and
  `"new-password"`; otherwise fine.
- **Access tokens** (`TokensPage.tsx`, `CreatedTokenPanel.tsx`, `RevokeTokenButton.tsx`):
  - Stacked rows (069).
  - The one-time token and the login command wrap (067's `CopyableCommand` below `sm`), so the
    whole token is visible before it's copied.
  - Revoke has a 44px target, and its confirm is full screen (067).
- **Admin nav** (`AdminNav.tsx`): `ScrollStrip` (066).
- **Admin › Users** (`UsersPage.tsx`, `UserRowActions.tsx`):
  - Stacked rows (069), with the row actions wrapping at the bottom of each card.
  - Create user, change role and reset password dialogs are full screen (067).
  - The one-time password uses the wrapping copy row.
- **Admin › Scopes:** stacked rows. Edit and Create are full-screen dialogs.
- **Admin › Audit log** (`AuditLogPage.tsx`):
  - Below `sm` the filters collapse behind a "Filters" button showing the number active ("Filters
    · 2"). It opens them in place, and the applied ones show as 060's chips under it.
  - The event dialog is full screen.
  - The date inputs are 16px (067).
- **Admin › Settings:** the usage policy radios and the minimum field get 44px targets, and the
  form stays one column.
- **The error and not-found pages** (`not-found.tsx`, `error.tsx`, if present): checked by the sweep.

**Out** (and where it goes instead):
- Changing what any of these pages do: unchanged.
- Passkeys or biometric sign-in: SSO and other sign-in methods come after the MVP.

## Behaviour

- **Phone, creating a token:** the dialog fills the screen. After **Create**, the token shows in
  full, wrapped, with **Copy**, and so does the login command.
- **Phone, audit log:** "Filters · 2" above the chips "action: user.created ✕ · from: 1 Oct ✕",
  then the events as cards with time and actor in the meta line.
- **Phone, setting up a new instance:** the wizard's steps, the database choice, the root account
  and the install progress all fit, and nothing zooms.

## Edge cases

- **Password managers on phones** fill the sign-in form. The `autocomplete` values are tested in a
  unit test, not with a real password manager.
- **The audit log opened with filters in the URL:** the "Filters" panel starts closed, and the chips
  show what's applied.
- **The setup wizard's install progress** runs while the phone's screen locks: the page polls
  again when it's visible (check the current behaviour, and fix it if it stops).

## Documentation

None: these pages do the same things. The Installing Ronne topic doesn't need to say the setup
works on a phone. 075 adds the overview of using Ronne on a phone.

## Acceptance criteria

- [ ] Sign-in, change password and setup fields have the `autocomplete` and `inputmode` values
  above (unit tests).
- [ ] The setup wizard completes on the `phone` and `phone-webkit` projects (the wizard projects
  gain phone variants).
- [ ] On a phone, root creates a user, changes a role, resets a password, creates and edits a scope,
  filters the audit log and opens an event (`admin.mobile.e2e.ts`).
- [ ] On a phone, a member creates a token, sees it whole, copies it and revokes it (e2e).
- [ ] The sweep passes on every page with nothing listed for 074.

## Open questions

- None.
