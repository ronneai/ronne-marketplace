# 008 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [x] **1. Permission map.** `models/permissions.ts` with M1's permissions and `can(user, permission)`,
  plus the domain errors `ForbiddenError`, `UserNotFoundError`, `EmailTakenError` and `CannotModifyRootError`.
  *Done when:* a table test covers roles × permissions against MVP §2.

- [x] **2. User repository and services.**
  - List users with search, filters and a cursor.
  - Create a user with a password (reusing 003's write).
  - Change a role (`user` ↔ `moderator` only).
  - Disable and enable (sessions ended, tokens revoked).
  - Reset a password.

  Each runs in one transaction with its 007 event. Root is always refused.
  *Done when:* database tests cover each operation, the root refusals and duplicate emails, and a rollback leaving no event.

- [x] **3. Password generator.** 20 characters from an unambiguous alphabet, using `crypto.randomInt`.
  *Done when:* tests cover length, alphabet and uniqueness over many draws.

- [x] **4. Admin area and `/admin/users`.** A root-only layout (404 otherwise), and the admin
  navigation shared with `/admin/audit`. The table, search, filters and paging, using 032's parts.
  *Done when:* render and permission tests pass.

- [x] **5. Dialogs and actions.** Create (with the one-time password panel), change role, disable,
  enable and reset, as server actions over the identity actions.
  *Done when:* action tests pass. Playwright: root creates a user, the user signs in with the shown
  password, root disables them, and they lose access.

## Notes
- **Task 1 (2026-09-27): permission map** (`domains/identity/models/permissions.ts`).
  - **`PERMISSIONS`** maps each permission to the roles that hold it: `account.manage_own` for
    everyone, and `users.view`, `users.manage` and `audit.view` for root.
  - **`can(user, permission)`** and **`requirePermission()`**, which throws `ForbiddenError`.
    Nobody signed in, and a role outside the three, get nothing.
  - **The domain errors:** `ForbiddenError`, `UserNotFoundError`, `EmailTakenError` and
    `CannotModifyRootError`.
  - **No more role comparisons:** the audit page checks `can(user, "audit.view")`, and the nav's
    Admin link uses `permission: "users.view"` in place of a list of roles. `/styleguide` stays
    root-only in production: it's a development page, not an action.
  - **Test:** every role against every permission, following MVP §2's matrix.
  - **The spec's open question is closed:** root stays single, as the spec says (owner, 2026-09-27).
- **Task 3 (2026-09-27): password generator** (`models/generated-password.ts`), done before task 2
  because the services use it.
  - 20 characters from 56 letters and digits, with the look-alikes left out (`0`, `O`, `o`, `1`,
    `l`, `I`). That's about 116 bits, above the spec's "about 110".
  - Each character comes from `crypto.randomInt`, so there's no modulo bias.
  - **Tests:** the alphabet has no look-alikes; a password has 20 characters and passes 003's rules;
    2,000 draws never repeat and use every character.
- **Task 2 (2026-09-27): repository and services** (`services/user-admin.ts`, and the wiring in
  `actions/user-admin.ts`).
  - **`IdentityRepository` gains** `findUser`, `listUsers` (search, role, status, cursor),
    `emailTaken`, `setRole`, `disableUser` and `countActiveAccessTokens`.
  - **The services:** `listUsers`, `createUser`, `changeRole`, `disableUser`, `enableUser`,
    `resetPassword` and `disableImpact`, which gives the disable dialog its session and token counts.
    - Each checks `users.view` or `users.manage` first.
    - Each loads its target in the transaction and throws `CannotModifyRootError` for root.
    - Each writes the change and its 007 event together.
  - **Roles:** only `user` and `moderator` can be given (`ASSIGNABLE_ROLES`). Anything else, root
    included, is `InvalidRoleError`.
  - **No-ops record nothing:** changing to the same role, disabling a disabled user and enabling an
    active one.
  - **The actions** take the request headers, find the actor with `getCurrentUser`, and pass the
    client IP for the event.
  - **Tests** (all four databases):
    - every operation refused to a user, a moderator and a signed-out visitor;
    - a generated and a typed password work, and neither is in the log;
    - duplicate emails in any case are refused, and so are `root` and unknown roles;
    - disable ends sessions and revokes tokens, and enable leaves tokens revoked;
    - a failing audit write rolls the whole disable back;
    - reset makes the old password stop working;
    - root is refused by every operation;
    - search ignores case and matches `%` literally, the role and status filters work, and it pages
      at 50.
- **Task 4 (2026-09-27): the admin area and `/admin/users`.**
  - **`app/(app)/admin/layout.tsx`** checks `users.view` (404 otherwise) and renders `AdminNav`
    (Users, Audit log). Each page still checks its own permission. `/admin` redirects to
    `/admin/users`.
  - **The header's "Admin" link** opens `/admin/users`, and stays current on every `/admin/*` page
    (the new `section` field on nav items).
  - **`/admin/users`** (`features/admin-users/`): email, name, role badge (accent for root), status
    and created date, newest first, 50 a page.
    - The search (email or name, 100 characters at most) and the role and status filters are a GET
      form.
    - Malformed query values are ignored.
    - The page takes `toolbar` and `actions` slots, which task 5 fills with the dialogs.
  - **Tests:** query parsing, the table, the admin navigation, and the layout and page returning 404
    for anyone but root without reading the list. The audit end-to-end test now goes Admin → Users
    → Audit log.
  - **New convention (owner, 2026-09-27):** functions and components are arrow functions. This
    task's new files use them already. The rest of the codebase is refactored in a `[chore]` after
    008.
- **Task 5 (2026-09-27): dialogs and actions** (`features/admin-users/`).
  - **Server actions** (`actions.ts`): create, change role, disable, enable and reset, plus
    `disableImpactFor` for the dialog's counts. They're thin adapters over the identity actions.
    Identity errors, including `ForbiddenError` and `CannotModifyRootError`, become the dialog's
    `ERR:` line; anything else is thrown. A change revalidates `/admin/users`.
  - **Create user:** a dialog with email, name, role and a password choice (generate, the default,
    or type one). On success, the one-time panel shows the email and password with copy buttons and
    "Give this to the user through a trusted channel. It won't be shown again." The form remounts
    each time the dialog opens, so a shown password never lingers.
  - **Row actions:** "Make user" or "Make moderator", "Reset password", and "Disable" or "Enable".
    Each opens a confirm dialog; the disable one says how many sessions end and tokens are revoked.
    Root's row has none.
  - **Changed from the spec: buttons, not a menu.** The row actions were first a dropdown, but the
    table's sideways scrolling clipped it (seen in the screenshots). They're now small inline
    buttons, in a `<fieldset>` named "Actions for <email>".
  - **Found on the way:** dialogs opened from the right-aligned actions cell inherited its alignment,
    so the shared `Dialog` now sets `text-left`.
  - **The own-password change** now checks `account.manage_own` too, so every M1 action goes through
    the permission map.
  - **Tests:**
    - the actions: generated and typed passwords, error mapping, rethrowing unexpected errors, and
      revalidation;
    - rendering: the one-time panel, and root's row having no actions;
    - Playwright: root creates a user with a generated password, the user signs in with it, root
      disables them (the dialog shows "1 session"), and the user's next request goes to sign-in.
    All 8 end-to-end tests pass.
  - **Checked by hand** in light and dark, at 1440px and 390px (Playwright screenshots): the users
    table, the one-time password panel and the disable dialog. On a phone, the table scrolls sideways
    inside its frame.
- **Done (2026-09-27).** The API half of "access stops on the next request" is enforced by 009's
  bearer guard: disabling already revokes every token, and 009 rejects revoked tokens.

