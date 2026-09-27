# 003 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [x] **1. Better Auth config in `identity`.** Server config with the Kysely adapter, snake_case
  field mapping and ULID ids (from 002's spike notes), argon2id through custom hash and verify
  functions, and the `role` and `disabled_at` additional fields. No routes or cookies yet.
  *Done when:* a test creates a user through it on SQLite and reads back an argon2id hash in `account`.

- [x] **2. `createRootUser` and `resetRootPassword`.** Actions and services in `identity`, with
  repository interfaces, and domain exceptions (`RootAlreadyExistsError`, `InvalidPasswordError`).
  The create step runs in one transaction.
  *Done when:* service tests cover creating root, refusing a second root, the password rules, and a reset that removes sessions and revokes tokens.

- [ ] **3. `.env` handling.** Read, merge and write `.env` with mode `0600`, keeping unknown lines
  and an existing `AUTH_SECRET`. Add `.env.example`.
  *Done when:* unit tests cover a new file, a merge, a kept secret and the file mode.

- [ ] **4. Interactive flow.** The prompts and the validate-and-retry loop, calling 002's checks and runner and the task 2 actions.
  *Done when:* a manual run on a fresh clone with SQLite matches acceptance criterion 1, recorded in Notes.

- [ ] **5. Non-interactive mode.** Flags, env vars, TTY detection, plain output and exit codes.
  *Done when:* a test runs the command as a child process with env vars only and gets a migrated database with a root; another test gets exit code 2 for a missing value.

- [ ] **6. `reset-root-password` command.** Interactive and `--yes` modes.
  *Done when:* a child-process test resets the password, and the old password no longer verifies.

- [ ] **7. Docs.** Update the README's getting-started section, and change `pnpm setup` to `pnpm run setup` anywhere it still appears.
  *Done when:* the README steps work as written on a fresh clone.

## Notes
- **Task 1 (2026-09-27): Better Auth setup.** `createAuth()` in `domains/identity/repositories/better-auth.ts`.
  - It uses `authSchema` from 002 for the field mapping, `newId()` for ids, and `telemetry: { enabled: false }`.
  - Password length is 12–128.
  - **`disableSignUp: true`:** only root creates users. A test proves `signUpEmail` is refused and writes nothing.
  - **argon2id** via `@node-rs/argon2`, behind a `PasswordHasher` interface in `models/`. Its parameters are OWASP's minimum (m=19456, t=2, p=1), passed explicitly. The algorithm is the library's default, argon2id: its `Algorithm` is a `const enum`, which `isolatedModules` can't use, so a test checks the `$argon2id$` prefix instead.
  - **Better Auth 1.7.5 API:** `internalAdapter.createUser` needs a provisioning source (`{ method: "admin" }`).
  - **Dependencies:** `better-auth` moved from dev to runtime dependencies. Added `@node-rs/argon2` 2.2.1 (native binaries as optional platform packages, no install script) and `@clack/prompts` 1.8.1 for task 4. All MIT.
  - Login rate limiting (MVP §9.5) belongs to the web login in 006.
- **Task 2 (2026-09-27): root account.** The identity domain now follows the MVP §9.2 layout:
  - `models/`: email and name normalization, password rules, the `PasswordHasher` interface;
  - `exceptions/errors.ts`: `InvalidEmailError`, `InvalidNameError`, `InvalidPasswordError`, `RootAlreadyExistsError`, `RootNotFoundError`;
  - `repositories/`: the `IdentityRepository` interface and its Kysely implementation;
  - `services/root-account.ts`: depends only on the interface and the hasher;
  - `actions/root-account.ts`: thin wiring.
  - **Root is written directly** (a `user` row plus a `credential` `account` row, with `account_id` equal to the user id, as Better Auth does) in one transaction. That's because Better Auth's sign-up is disabled and its `role` field is `input: false`. The tests prove Better Auth signs in as that root, and after a reset only the new password works.
  - **The reset** sets the password, deletes root's sessions, revokes its access tokens (`revoked_at`) and clears `disabled_at`, in one transaction.
  - **Validation happens before any write:** email trimmed and lowercased, name 1–255 characters, password 12–128 *characters* (so emoji count as one).
  - **Found while testing:** `better-sqlite3` can't bind JavaScript booleans. `toDbBoolean()` was added to `db/dates.ts`, next to `toDbDate()`, for `email_verified`.
  - **Known limit:** two setups running at the same moment could both pass the "no root yet" check. It's acceptable for a one-operator installer. A portable database guard (a partial unique index) isn't possible on MySQL.
  - Checked on SQLite and in Docker on PostgreSQL 18 and 15, MySQL 8.4 and MariaDB 10.11 (103/103 each).

