# 059 — More than one root

> Milestone: M1 · Depends on: 003, 006, 007, 008 · Design: [MVP §2](../../MVP/MVP.md#2-personas--roles), [§15 "Roots"](../../MVP/MVP.md#15-decision-log) · Contracts: none new

## Goal

Today an instance has exactly one root ([008](../008-user-admin/SPEC.md), MVP §15 "Single root").
If that person is away, nobody else can manage users, scopes or settings. If they lose their
password, only someone with terminal access to the server can help. The owner decided (2026-10-02)
that **a root can make other accounts root, and can change any account's role**, including another
root's. Roots are peers: what one root can do to a moderator, it can do to another root. The one
exception is its own account.

## Scope

**In:**
- **Any role can be assigned from the admin area**: `user`, `moderator` or `root`, both when
  creating a user and when changing a role. That includes promoting a user or moderator to root,
  and demoting a root to moderator or user.
- **Other roots' rows are managed like any other row**: change role, disable, enable and reset
  password.
- **Your own row is read-only in the admin area.** A root can't change their own role, disable
  themselves, or reset their own password there. Their own password is changed in
  `/account/password` (006), and another root handles the rest.
- **At least one active root always remains.** No admin action can leave the instance without an
  enabled root, even when two roots act at the same moment (below).
- **A stronger confirmation for root changes.** Promoting to root, demoting a root, and disabling
  or resetting another root each say what that means before it happens.
- **`pnpm run reset-root-password` picks which root** when there are several (`--email`, or a
  choice when it runs interactively).
- **Audit:** the existing events (`user.created`, `user.role_changed`, `user.disabled`,
  `user.enabled`, `user.password_reset`) cover roots too. There are no new event names (below).
- **The Documentation, inline helpers and the sign-in page's "Forgot?" text** say there can be
  several roots.

**Out** (and where it goes instead):
- **Setup creating more than one root.** Setup still creates only the first root, and it still
  never creates a root when one exists (003, 036). More roots come from the admin area.
- **A role between moderator and root** (for example "user admin without settings"), or
  permissions set per person. The three roles and the one map (008) stay.
- **Requiring a second root to approve a promotion** (four-eyes for admin changes). Every change is
  audited, and the audit log is enough for now. This could come later if the owner wants it.
- **Deleting users.** Users are still disabled, never deleted (008).
- **SSO group mapping to root** (MVP §14). It's a later decision, made with SSO.

## Behaviour

### Permissions

The permission map (`domains/identity/models/permissions.ts`) doesn't change: `users.manage` is
still root only. What changes is **which targets** `users.manage` may act on, and **which roles**
it may give:

| Target row | change role | disable / enable | reset password |
|---|:-:|:-:|:-:|
| a user or moderator | ✅ | ✅ | ✅ |
| another root | ✅ | ✅ | ✅ |
| yourself | — | — | — (use Account) |

- Any of the three roles can be given (checked with `isRole`). `ASSIGNABLE_ROLES` and the 008 rule
  "root itself is never given" go away.
- `CannotModifyRootError` is replaced by **`CannotModifySelfError`**: "You can't change your own
  role or account here. Change your password in Account; another root can change the rest."
- New **`LastRootError`**: "This would leave the instance without an active root. Make someone
  else root first."

### The "at least one active root" rule

An **active root** is an account with `role = 'root'` and `disabled_at` null. Every admin action
that could remove an active root (demoting a root, or disabling one) checks, **inside its
transaction**, that at least one active root remains afterwards. Otherwise it throws
`LastRootError` and changes nothing.

Why it matters beyond admin convenience: with no root at all, the setup state check
(`server/setup/state.ts`) reports the instance as `incomplete`, and the web setup opens again to
the first visitor (036). With roots that are all disabled, nobody can manage the instance from the
web.

Because a root can't act on themselves, a single root acting alone can never break the rule: the
actor is always an active root who stays one. The risk is **two roots acting at the same time**,
such as A demoting B while B demotes A. Each transaction reads "two active roots" and goes ahead.
To prevent this, each action that can remove a root does the following, in its transaction:

1. **Locks the root rows and the actor's row** with the existing helpers in `db/locks.ts`:
   `forUpdate` (`SELECT … FOR UPDATE`; a no-op on SQLite, which runs writers one at a time) inside
   a `readCommittedTransaction`. On MySQL and MariaDB, the re-read after waiting for the lock then
   sees what the other transaction committed.
2. **Re-reads the actor** and refuses with `ForbiddenError` if they're no longer an active root.
   The second of the two concurrent requests then fails, because its actor was just demoted.
3. Checks the target, applies the change, then checks the active-root count. It throws
   `LastRootError` if the count is zero (a defence in depth; steps 1 and 2 should make it
   unreachable).

The same re-read of the actor applies to every `users.manage` action, not only these two. A root
demoted a moment ago can't finish an action they had already started.

### Admin area (`/admin/users`)

- **Create user:** the role select offers `user`, `moderator` and `root`, with `user` as the
  default. Choosing `root` shows a warning line under the select: "Root can do everything: manage
  users (other roots included), scopes, settings and the audit log, and approve their own
  submissions." The rest of the dialog (password shown once, and so on) is unchanged.
- **Row actions** appear on every row except the signed-in root's own. That row shows only a
  helper's icon in place of the menu (the owner, 2026-10-02: no text there). Its question, "Why
  can't I change my own account here?", is the icon's accessible name, and its answer explains
  where to change your own account.
- **Change role** offers all three roles. The confirmation depends on the change:
  - **to root:** "Make Alex root? They'll be able to do everything you can, including changing
    your role or disabling you."
  - **from root:** "Remove root from Alex? They'll lose user admin, scopes, settings and the audit
    log on their next request."
  - otherwise: unchanged (008).
- **Disable another root:** the dialog adds "Alex is a root". The rest is as in 008 (ends sessions
  and revokes tokens, in one transaction).
- **Reset another root's password:** as in 008. The one-time panel is the same.
- **Filters:** the role filter already includes `root`. Root badges keep the accent tone.

### What a role change does to the person

Roles are read from the database on every request (006's `findActiveUser`, 009's bearer guard).
Promoting or demoting therefore takes effect on that person's **next request**, on the web and
through their access tokens. Their sessions and tokens are **not** ended, because their identity
hasn't changed, only what it may do. Pages that were open show 404 or `ERR:` on the next action,
as they do today for a moderator who becomes a user.

### `pnpm run reset-root-password`

It recovers a root, and only a root. It never promotes anyone.

- **One root:** unchanged.
- **Several roots, interactive:** it lists them (email, name, and "disabled" if so) and asks which
  one.
- **Several roots, `--yes`:** it needs `--email <address>` or `RONNE_ROOT_EMAIL`. Without either it
  exits with code 2: "There are N root accounts. Say which with --email."
- `--email` naming an account that isn't root exits with code 2: "<email> isn't a root account."
- It still sets the password, ends that root's sessions, revokes that root's tokens and re-enables
  it (003). The audit event's metadata gains `email`.

Recovery when **every** root has lost access is unchanged: whoever runs the server resets one with
this command.

### Setup

- `findRoot` becomes **`findFirstRoot`**, the oldest root, disabled or not. Setup's "a root account
  already exists" message and the setup state check both use it. The behaviour is unchanged:
  setup still never creates a root when one exists.
- When there are several roots, setup's message says "N root accounts already exist (first:
  <email>)". The "disabled" warning only appears when **every** root is disabled.

### Server actions and the API

The server actions keep their names and inputs (`adminChangeRole`, `adminCreateUser`,
`adminDisableUser`, …). `role` now accepts `root`. The API (`/api/v1`) has no user admin endpoints,
so nothing there changes. `GET /api/v1/me` already returns the role.

### Audit

There are no new event names. `user.role_changed { from, to }` and `user.created { email, role }`
already show promotions and demotions, and 007's audit page already shows them. The admin events'
targets are users, as before. Filtering the audit log by "root changes" is out of scope.

## Edge cases

- **A crafted request to change your own role, disable or reset yourself:** `CannotModifySelfError`,
  even though the UI doesn't offer it.
- **Two roots demote or disable each other at the same moment:** one succeeds, the other gets
  `ForbiddenError` (its actor is no longer root). There's a test on each database (`*.db.test.ts`,
  run against the servers).
- **Demoting the last active root** can only be reached through a race or bad data. It returns
  `LastRootError`, and nothing changes.
- **A root that is disabled** doesn't count as active. Enabling a disabled root is always allowed.
  Promoting a disabled user to root is allowed, but they don't count as active until enabled.
- **A root demoted while signed in on another tab:** their next admin request gets 404 or
  `ForbiddenError`, as for any lost permission.
- **Root's self-approval override (014)** works for every root. The override stays audited, and
  approval still needs someone other than the author, which any other root or moderator can now be.
- **Usage policy and settings (046)** are the instance's, not a person's. Any root changes them,
  and `updated_by` records which one.
- **Reset-root-password with an `--email` in different case or with spaces:** normalised like
  every email (003).
- **Existing instances:** no migration. The one root they have keeps working, and nothing changes
  until a root promotes someone.

## Documentation

- **Install › "The root account"** (`content.tsx`, `install.root`): it's renamed to **"Root
  accounts"** (title in `topics.ts`), with this content: setup creates the first root; any root
  can make other accounts root from Users and change anyone's role but their own; there's always
  at least one active root; `reset-root-password` with `--email` when there are several. Install
  › setup's "never creates a second root" becomes "never creates a root when one exists; more
  roots are added from Users".
- **Roles › "The three roles"**: root is "the instance's owners: the first is created by the
  setup, and any root can make others root". The permissions table gains no row, because
  "Create / disable users, change roles" already covers it.
- **Sign-in › Forgot password** (`ForgotPassword.tsx`): "Ask a root to reset it in Users. If
  you're the only root, run `pnpm run reset-root-password` where Ronne AI is installed."
- **New inline helpers** (`Help.tsx`):
  - `role-root` next to the role select in Create user and Change role: what root can do, that
    every root can change every other root, and a link to Roles.
  - `own-row` as an icon only (`<Help iconOnly>`, a new `HelpTip` option) on the signed-in root's
    row: "You can't change your own role or disable yourself here. Change your password in Account;
    another root can change the rest." It links to Install › Root accounts.
- **Setup wizard's "What can root do?" tip** (`features/setup/fields.tsx`): "This is the first
  root" in place of "There is one root".
- **Users page description** (`UsersPage.tsx`): "Only root creates users" stays true. Nothing to
  change.

## Acceptance criteria

- [x] Root can create a user with the role `root`. That user can sign in and reach `/admin/users`
  (Playwright).
- [x] Root can change any other account's role to any of the three, roots included, and each change
  records `user.role_changed`.
- [x] Root can disable, enable and reset the password of another root, with the same effects and
  events as for other users.
- [x] Every admin action on your own row fails with `CannotModifySelfError`, and the UI shows no
  menu on that row.
- [x] No admin action can leave zero active roots. Concurrent mutual demotion on PostgreSQL, MySQL,
  MariaDB and SQLite leaves exactly one active root, and the other request fails.
- [x] A root demoted while acting can't complete a `users.manage` action begun before the demotion.
- [x] A promotion or demotion takes effect on the person's next web request and next API call,
  without ending their sessions or tokens.
- [x] `reset-root-password` with several roots asks which one (interactive), or requires `--email`
  (non-interactive, exit 2 without it), and refuses a non-root email.
- [x] Setup still never creates a root when any root exists, and the setup state stays `ready` with
  several roots or with every root disabled.
- [x] The permission test (008) still matches MVP §2, and MVP §2, §5 and §15 describe several roots.
- [x] The Documentation and inline helpers listed above say what the feature does now.

## Open questions

- None. **Decided (owner, 2026-10-02):** root can add other roots and change any account's role.
  The following follow from that: roots are peers, so a root can also disable and reset another
  root; you can't change yourself; and at least one active root must remain.
