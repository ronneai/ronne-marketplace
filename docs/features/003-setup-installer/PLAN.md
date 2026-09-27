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

- [x] **3. `.env` handling.** Read, merge and write `.env` with mode `0600`, keeping unknown lines
  and an existing `AUTH_SECRET`. Add `.env.example`.
  *Done when:* unit tests cover a new file, a merge, a kept secret and the file mode.

- [ ] **4. Interactive flow.** The prompts and the validate-and-retry loop, calling 002's checks and runner and the task 2 actions.
  *Done when:* a manual run on a fresh clone with SQLite matches acceptance criterion 1, recorded in Notes.

- [x] **5. Non-interactive mode.** Flags, env vars, TTY detection, plain output and exit codes.
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
- **Task 3 (2026-09-27): `.env` handling** in `src/server/setup/env-file.ts`. `.env` lives in `apps/web/`, where Next.js and `pnpm db:migrate` read it. `apps/web/.env.example` documents every key.
  - **Merge:** known keys are replaced in place, new ones appended, and other lines (comments, blanks, unknown keys) kept. `AUTH_SECRET` is never replaced once set.
  - **Write:** mode `0600`, through a temp file and a rename. An existing looser file is tightened to `0600`.
  - **Quoting follows Node's own parser** (`util.parseEnv`, the one behind `process.loadEnvFile`). It has no escape for quotes inside quotes, and treats `#` as a comment even with no space before it. So values are left unquoted when safe, otherwise single-quoted, and double-quoted or backticked only when needed. Values with line breaks, or with every kind of quote, are refused. Tests round-trip tricky values (URL-encoded passwords, `#`, apostrophes, both quote kinds, secrets) through that parser.
- **Task 4 (2026-09-27): interactive flow, built but not yet ticked.** Waiting on a manual run by the owner: `pnpm run setup` on a fresh clone with SQLite defaults, recorded here. Everything else is done:
  - `src/server/setup/run-setup.ts` runs steps 1–9 from the spec against a `SetupPrompts` interface (`prompts.ts`). Every question has a stable id. `clack-prompts.ts` adapts `@clack/prompts`, turning Ctrl+C into `SetupCancelledError`. `scripts/setup.ts` is the entry point, as `pnpm run setup` in both `apps/web` and the root.
  - `testing/scripted-prompts.ts` answers by id and applies each question's validator like clack does. So the tests cover the whole flow:
    - a first run;
    - a second run (reuses `.env`, keeps `AUTH_SECRET`, no second root);
    - a failing database followed by a retry;
    - invalid email and short password rejected at the prompt;
    - mismatched confirmation;
    - Ctrl+C at the root prompts (no partial user; the next run finishes);
    - non-interactive mode stopping instead of asking again.
  - **Server test:** it runs setup against an empty MySQL or PostgreSQL database, with a wrong password first. It passed on PostgreSQL 18 and 15, MySQL 8.4 and MariaDB 10.11 (142/142 each).
  - **Added to `db/checks.ts`:** `checkCharset` (MySQL/MariaDB must be `utf8mb4`) and `checkServerVersion` (warns below PostgreSQL 15, MySQL 8.4 or MariaDB 10.11, but continues). The PostgreSQL permission failure shows the `GRANT CREATE ON SCHEMA public` fix.
  - DATABASE_URL credentials and the database name are URL-encoded (`database-url.ts`); IPv6 hosts get brackets.
  - `createTestDb()` now also returns the database's `url`.
- **Task 5 (2026-09-27): non-interactive mode.**
  - `cli.ts` parses the flags, with `parseArgs` in strict mode: unknown flags, including a would-be `--root-password`, exit 2. It picks the mode: `--yes`, or `CI=true` without a terminal, means non-interactive; no terminal without either exits 2 with a `--yes` hint.
  - `non-interactive-prompts.ts` answers from flags and environment variables. It never asks. A missing value is `MissingInputError` (exit 2, naming the variable) and an invalid one is `InvalidInputError` (exit 2). Output is plain lines: progress to stdout, and `!` or `✗` lines to stderr.
  - `runSetup` gained `databaseUrl` and `storagePath` options.
  - **`RONNE_ENV_FILE`** (relative to `apps/web`, or absolute) moves `.env`. It was added now, ahead of 005, so the command tests write to a temp folder rather than the real `apps/web/.env`.
  - `scripts/setup.db.test.ts` runs the real script as a child process, covering:
    - first run and rerun;
    - a missing email (exit 2);
    - a short password (exit 2);
    - an unreachable database (exit 1, no `.env` written);
    - no terminal without `--yes` (exit 2);
    - `CI=true` (runs).

    `CI` is set explicitly in each child, because GitHub Actions sets `CI=true`. Next.js makes `NODE_ENV` a required key of `ProcessEnv`, so the child's environment sets it.
  - The server smoke test (setup `--yes` against an empty MySQL or PostgreSQL database) is what 004's task 4 asks for. It passed on PostgreSQL 18 and 15, MySQL 8.4 and MariaDB 10.11 (157/157 each).
  - `pnpm run setup --yes` from the repo root passes the flag through to `apps/web` and exits 0.

