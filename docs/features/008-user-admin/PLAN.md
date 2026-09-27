# 008 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [ ] **1. Permission map.** `models/permissions.ts` with M1's permissions and `can(user, permission)`,
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
