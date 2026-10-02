# 008 — User admin

> Milestone: M1 · Depends on: 006, 007, 032 · Design: [MVP §2](../../MVP/MVP.md#2-personas--roles), [§9.5](../../MVP/MVP.md#95-auth)

## Goal

Root manages who can use the instance: create users, give them a role, disable and re-enable them,
and reset a forgotten password. Users are only ever created here (MVP §2); nobody registers
themselves, and the CLI never creates users.

## Scope

**In:**
- **A single role and permission map** in the `identity` domain (MVP §9.5: "authorization is enforced
  in the actions layer from a single role-permission map"). It holds M1's permissions, and later
  features add theirs.
- `/admin/users`: list, search and filter by role or status.
- **Create a user:** email, name, role (`user` or `moderator`), and an initial password, typed or
  generated and **shown once**.
- **Change a role** between `user` and `moderator`.
- **Disable and enable.** Disabling ends the user's sessions and revokes their access tokens.
- **Reset a user's password:** a new one, shown once. It also ends their sessions and revokes their tokens.
- An audit event for every change (007).
- The admin area's layout and navigation (root only), which 007's audit page also uses.

**Out:**
- Creating more roots, or changing or disabling root from the UI (below).
- Deleting users: the MVP disables, and keeps history (items, reviews and audit events point to users).
- Inviting by email, and forcing a password change at next sign-in. There's no email, and no such
  column in the MVP; root tells the user to change the password (006).
- Scopes (010), and per-token admin views (tokens are covered only through disable and reset here).

## Behaviour

**Permissions** (`domains/identity/models/permissions.ts`): one map from role to permissions, and a
`can(user, permission)` check used by every action.

| Permission | user | moderator | root |
|---|:-:|:-:|:-:|
| `account.manage_own` (own password, own tokens) | ✅ | ✅ | ✅ |
| `users.view` | — | — | ✅ |
| `users.manage` (create, role, disable, reset) | — | — | ✅ |
| `audit.view` | — | — | ✅ |

Later features add theirs (such as `submissions.review` for moderator and root) to the same map, which follows MVP §2's table.

> **Superseded by [059](../059-multiple-roots/SPEC.md)** (owner, 2026-10-02): there can be several
> roots, root can give any role, and roots manage each other but not themselves. The rules below
> describe 008 as built.

**Root stays single** (decided here; MVP §2 describes one root "created at install time"):
- Roles set in the UI are only `user` and `moderator`. No UI path makes someone root.
- Root's own row can't be disabled, demoted or reset from the admin UI. Root changes its own password
  in `/account/password` (006), and recovers with `pnpm run reset-root-password` (003).
- A root that loses access and has no terminal access to the server can't be recovered from the web.
  That's deliberate: the server operator is the last resort.

**`/admin/users`** (root only; anyone else gets **404**, so the page doesn't reveal it exists):
- **Table columns:** email (mono), name, role badge, status (`active` or `disabled`), created, and a row actions menu.
- **Search:** email or name, with the portable case-insensitive search from 002. Filters for role and
  status. Cursor paging, 50 per page.
- **Create user** (a dialog):
  - email and name, validated with 003's rules; emails are unique, trimmed and lowercased;
  - role (`user` or `moderator`);
  - password: **Generate** (the default: 20 characters from an unambiguous alphabet, about 110 bits) or **Type one** (12–128 characters).

  After creating, a one-time panel shows the email and the password in a CopyableCommand: "Give
  this to the user through a trusted channel. It won't be shown again." The user is written in one
  transaction: `user`, the `credential` account with an argon2id hash (003's repository), and `user.created`.
- **Change role:** a confirm dialog, then `user.role_changed { from, to }`.
- **Disable:** a confirm dialog that says what happens ("signs them out everywhere and revokes N
  access tokens"). In one transaction it sets `disabled_at`, deletes the user's sessions, revokes
  their tokens and records `user.disabled`. They lose access on their next request (006 checks `disabled_at` on every request).
- **Enable:** clears `disabled_at` and records `user.enabled`. Revoked tokens stay revoked, so the user makes new ones.
- **Reset password:** generates (or lets root type) a new password, shown once. In one transaction it
  ends the user's sessions, revokes their tokens and records `user.password_reset { via: "web" }`.

**Server actions** are thin adapters over `identity` actions (MVP §9.2). Each action loads the
current user, checks the permission with `can()` and validates its input. It throws
`ForbiddenError`, `UserNotFoundError`, `EmailTakenError`, or `CannotModifyRootError`, which the UI
maps to `ERR:` notices.

## Edge cases

- **Root tries to change itself** through a crafted request: `CannotModifyRootError`, even though the UI doesn't offer it.
- **Duplicate email** (for example `Alex@Example.com` when `alex@example.com` exists): `EmailTakenError`. Emails are normalized before the check.
- **Two roots editing at once:** can't happen, since root is single. Two browser tabs: the last write
  wins, and each change is its own audited event.
- **Disabling a user who is signed in right now:** their next request goes to sign-in (006), and their tokens fail on the next API call (009).
- **The one-time password panel:** the password is only in the server action's response, never stored in plain text or logged, and it's not in the audit metadata.
- **Page size and search input:** capped (search at 100 characters) and escaped by `containsInsensitive`.

## Acceptance criteria

- [x] The permission map exists once, and every M1 action checks it. A test enumerates roles × permissions against MVP §2.
- [x] `/admin/users` and its actions return 404 or `ForbiddenError` for `user` and `moderator`.
- [x] Root can create a user with a generated or typed password. The password is shown once, the user can sign in with it (Playwright), and `user.created` is recorded.
- [x] Duplicate emails are refused regardless of case.
- [x] Role changes between `user` and `moderator` work and are audited; no path sets or changes `root`.
- [x] Disabling ends sessions and revokes tokens in one transaction, and access stops on the next request (web and API). (The API side is 009's bearer guard, which rejects revoked tokens.)
- [x] Enabling restores sign-in, while revoked tokens stay revoked.
- [x] Resetting a password shows a new one once, ends sessions and revokes tokens, and the old password stops working.
- [x] Root's own row can't be modified through any admin action.
- [x] Every change writes its 007 event in the same transaction (a rollback test for disable).

## Open questions

- None. **Closed (2026-09-27, owner):** root stays single, as this spec and MVP §2 say. A
  "transfer ownership" flow can come later if it's needed.
