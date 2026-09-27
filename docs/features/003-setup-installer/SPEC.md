# 003 — `pnpm run setup` installer and root account

> Milestone: M0 · Depends on: 002 · Design: [MVP §5](../../MVP/MVP.md#5-installation--bootstrap), [§9.5](../../MVP/MVP.md#95-auth)

## Goal

Someone who has just cloned the repo gets from nothing to a configured instance with a root
account, in one interactive command. Nothing is installed on their machine besides our code, and
every wrong answer is caught with a clear message before anything is written.

## Scope

**In:**
- The interactive `pnpm run setup` command, following MVP §5 steps 1–7.
- A non-interactive mode with flags and env vars, for Docker (005) and CI (004).
- The `identity` domain's first pieces: the Better Auth server config (Kysely adapter, snake_case
  field mapping, ULID ids, argon2id hashing, `role` and `disabled_at` fields) and a
  `createRootUser` service that goes through it.
- `pnpm run reset-root-password`.

**Out:**
- Web login, sessions and cookies → 006.
- Recording root creation in the audit log → 007 adds the table; setup writes nothing to it.
- `pnpm dlx @ronneai/marketplace init` (download and then run setup) → when packages are published, before M4.

## Behaviour

> `pnpm setup` is a pnpm built-in command that configures pnpm itself, so it never runs our
> script. The command is always written as `pnpm run setup`.

**Interactive flow** (prompts with `@clack/prompts`):

1. **Existing config.** If `.env` has a `DATABASE_URL`, offer to reuse it (the default) or start over.
2. **Database:** SQLite (default), MySQL/MariaDB or PostgreSQL.
3. **Details.**
   - SQLite asks only for the file path (default `./data/ronne.db`).
   - The others ask for host, port (with the usual default), database name, user and password (hidden).
4. **Validate.**
   - `checkConnection`, then `checkPermissions` (002).
   - MySQL/MariaDB only: check that the database's character set is `utf8mb4`.
   - On failure, show the error kind in plain words and the driver message, then return to step 3 with the answers kept.
   - Credentials that contain URL-special characters are encoded when the URL is built.
5. **Public URL.** Ask for `PUBLIC_URL` (default `http://localhost:3000`).
6. **Write `.env`** with mode `0600`:
   - `DATABASE_URL`;
   - `AUTH_SECRET`: 32 random bytes, base64. An existing secret is kept, because a new one would end every session;
   - `STORAGE_PATH`: default `./data/storage`, created if missing;
   - `PUBLIC_URL`.

   Other lines already in `.env` are kept. `.env.example` documents every key.
7. **Migrate** with the runner from 002, showing each migration applied.
8. **Root account.**
   - If a root already exists, say so (showing its email) and skip this step. Setup never creates a second root.
   - Otherwise ask for email, display name and password twice. The account is created through `createRootUser`.
9. **Finish.** Print the URL and the next commands (`pnpm build && pnpm start`, or `pnpm dev`).

Pressing Ctrl+C at any prompt exits without writing anything that hasn't been written already.
Steps are safe to repeat, so running setup again after a failure picks up where it stopped.

**Password rules:** 12 to 128 characters. No composition rules, following NIST SP 800-63B. Both
entries must match. Emails are trimmed and lowercased.

**Non-interactive mode** (`pnpm run setup --yes`, or when `CI=true` and there is no TTY):

| Input | Flag | Env var |
|---|---|---|
| Database URL | `--database-url` | `DATABASE_URL` |
| Public URL | `--public-url` | `PUBLIC_URL` |
| Storage path | `--storage-path` | `STORAGE_PATH` |
| Root email | `--root-email` | `RONNE_ROOT_EMAIL` |
| Root name | `--root-name` | `RONNE_ROOT_NAME` |
| Root password | — (never a flag, to keep it out of shell history) | `RONNE_ROOT_PASSWORD` |

A missing required value fails with exit code 2 and names it. If a root already exists, the root
inputs aren't needed. Output is plain lines with no colours or spinners. Exit codes: `0` success,
`1` a check or step failed, `2` invalid input.

**`pnpm run reset-root-password`**: asks for a new password twice (or reads
`RONNE_ROOT_PASSWORD` with `--yes`), updates the root's password, and ends all of root's sessions.
Root's access tokens are revoked too, since a reset usually means the old credentials can't be trusted.

**Better Auth's public sign-up endpoint is disabled** (`emailAndPassword.disableSignUp`). Users are created only by root: here by setup, and later from the admin UI (008). Nobody can register through `/api/auth/sign-up`.

**Where the code lives:** the command in `apps/web/scripts/`. It calls `db/` for checks and
migrations, and the `identity` domain's actions for the root account. It doesn't write SQL itself.

## Edge cases

- **Existing `.env` with a different database.** When the user starts over, setup warns that the old database is left untouched and isn't migrated.
- **Database already migrated by a newer version** (unknown migrations present): stop with a message, and don't create a root.
- **Root exists but is disabled.** Say so and point to `reset-root-password`. That command also clears `disabled_at` for root.
- **SQLite path inside a folder that doesn't exist:** create it. **Not writable:** report the path.
- **Weak `AUTH_SECRET`** already in `.env` (shorter than 32 bytes): warn but keep it.
- **No TTY and no `--yes`:** fail with exit code 2 and a hint to use `--yes`, instead of hanging on a prompt.

## Acceptance criteria

- [x] On a fresh clone with SQLite defaults, `pnpm run setup` completes and prints the URL. `.env` has mode `0600`, and the database has one root user.
- [x] The same works with MySQL, MariaDB and PostgreSQL URLs (checked in CI by 004).
- [x] A wrong password, wrong host and missing database each give their own message, then ask again with the other answers kept.
- [x] Running setup a second time creates no second root and keeps `AUTH_SECRET`.
- [x] Non-interactive mode completes with only env vars, and exits with `2` naming the missing value when one is absent.
- [x] The root's password is stored as an argon2id hash in `account`, and the `user` row has `role = root`.
- [x] `reset-root-password` changes the password, removes root's sessions and revokes root's tokens.
- [x] Ctrl+C at the root-account prompt leaves the database migrated with no partial user.

## Open questions

- None.
