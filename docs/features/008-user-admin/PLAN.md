# 008 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [x] **1. Permission map.** `models/permissions.ts` with M1's permissions and `can(user, permission)`,
  plus the domain errors `ForbiddenError`, `UserNotFoundError`, `EmailTakenError` and `CannotModifyRootError`.
  *Done when:* a table test covers roles × permissions against MVP §2.

- [ ] **2. User repository and services.**
  - List users with search, filters and a cursor.
  - Create a user with a password (reusing 003's write).
  - Change a role (`user` ↔ `moderator` only).
  - Disable and enable (sessions ended, tokens revoked).
  - Reset a password.

  Each runs in one transaction with its 007 event. Root is always refused.
  *Done when:* database tests cover each operation, the root refusals and duplicate emails, and a rollback leaving no event.

- [ ] **3. Password generator.** 20 characters from an unambiguous alphabet, using `crypto.randomInt`.
  *Done when:* tests cover length, alphabet and uniqueness over many draws.

- [ ] **4. Admin area and `/admin/users`.** A root-only layout (404 otherwise), and the admin
  navigation shared with `/admin/audit`. The table, search, filters and paging, using 032's parts.
  *Done when:* render and permission tests pass.

- [ ] **5. Dialogs and actions.** Create (with the one-time password panel), change role, disable,
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

