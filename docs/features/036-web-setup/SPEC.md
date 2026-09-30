# 036 — Web setup wizard

> Milestone: M6 · Depends on: 003, 005, 006, 032 · Design: [MVP §5](../../MVP/MVP.md#5-installation--bootstrap) (installation), [§9.5](../../MVP/MVP.md#95-auth) (auth), [§15](../../MVP/MVP.md#15-decision-log) (Setup command, Docker, Single root) · Contracts: [003](../003-setup-installer/SPEC.md) (what setup asks and writes)

## Goal

An instance that isn't set up yet is set up from the browser: open it, choose the database, the
public address and the root account, watch the installation (settings written, migrations
applied, root created), and sign in. Nobody needs a terminal for the first run, so `docker
compose up -d` from `compose.yaml` alone ([035](../035-docker-hub-image/SPEC.md)) and `pnpm dev`
from a clone both end in a working instance. `pnpm run setup` stays for scripts and for people
who prefer it, and both run the same code.

## Scope

**In:**
- A setup page, `/setup`, shown instead of every other page until the instance is ready, with
  the same questions, checks, words and results as `pnpm run setup` (003).
- A four-state notion of "set up" (not configured, incomplete, unavailable, ready) that the
  pages, the health endpoint and the API share, replacing "has a database URL and a secret".
- The step logic of `pnpm run setup` extracted into functions both front ends call, and the
  audit row saying whether root was created from the terminal or the web.
- No restart after setup, in Docker or from a clone, and the docs and messages that still say
  "then restart".
- The Documentation topic on installing and running an instance.

**Out** (and where it goes instead):
- A setup code or token to protect the page (owner's decision, 2026-09-29: the first visitor
  sets the instance up; see Edge cases). If a hosted instance needs it, a feature of its own.
- Changing settings after setup (public URL, storage path, database) from the web: an instance
  settings page, post-MVP. Until then, `pnpm run setup` again, or the environment.
- Creating other users: [008](../008-user-admin/SPEC.md), once root is signed in.
- A JSON endpoint for scripted setup: `pnpm run setup --yes` with environment variables already
  covers it (003).

## Behaviour

**The states.** The instance is in one of four states, computed per request from the settings
file and the database (`apps/web/src/server/setup/state.ts`):

| State | Meaning | Pages | `/api/health`, `/api/v1/*` |
|---|---|---|---|
| `not_configured` | No `DATABASE_URL` or `AUTH_SECRET` in the settings (file or environment) | Every page redirects to `/setup` | `503 setup_required` |
| `incomplete` | Settings exist, but the tables or the root account don't: a wizard that was interrupted, or a `pnpm run setup` cancelled after writing the file | Every page redirects to `/setup`, which resumes at Install with the database kept | `503 setup_required` |
| `unavailable` | Settings exist, but the database doesn't answer (wrong password, server down) | A "database isn't answering" panel with the redacted URL and the fix (the environment, or `pnpm run setup`). **Never the wizard**, so nobody can point a live instance at another database | `503 database_unavailable` |
| `ready` | Settings, tables and a root account | The app; `/setup` redirects to `/` when signed in, else to `/sign-in` | As today |

`ready` is remembered per process once seen (keyed by the database URL), since root can't be
deleted or demoted; the other states are checked on each request. The `setup_required` message
now says "Open it in a browser and follow the setup, or run `pnpm run setup`", with no restart
sentence. `prepareStart` (005) is unchanged apart from that wording: before setup the server
starts in setup mode, after setup it applies pending migrations.

**The page.** `/setup` is public (added to the route guard next to `/sign-in`; sign-in never
sends anyone back to it) and shows one form in four steps. Field names are the prompt ids of 003,
and every check and message is the one the terminal shows, since both call the same step
functions.

1. **Database.** SQLite (default), MySQL or MariaDB, or PostgreSQL. SQLite asks for the path
   (default `./data/ronne.db`, relative to `apps/web`; in Docker, inside the `ronne-data`
   volume). The servers ask for host, port (3306 or 5432 by default), database name, user and
   password. **Test connection** runs 003's checks (connection, server version, `utf8mb4` on
   MySQL, permissions through the probe table) and shows the same explanation and driver message
   on failure, or the server version and any "older than the minimum" warning on success. In
   Docker (`RONNE_RUNTIME=docker`), a hint says that `docker compose --profile postgres up -d`
   (or `mysql`) starts a server reachable as host `postgres` (or `mysql`), database and user
   `ronne`, password `RONNE_DB_PASSWORD`. When the state is `incomplete`, a checkbox "Keep the
   database already in the settings", showing the URL without its password, is on by default and
   hides the fields.
2. **Instance.** The public URL, prefilled from the settings or `http://localhost:3000`. When it
   comes from the environment (as `compose.yaml` sets `PUBLIC_URL`), the field is read-only with
   the note that the environment wins over the settings file and where to change it.
3. **Root account.** Email, display name, and the password twice (12 to 128 characters, no
   composition rules, as 003), with an inline note on what root can do.
4. **Install.** A list of steps that fills in as they run: "Settings written to `<file>`",
   "Migrations applied (n)" or "Database up to date", "Root account created", "Ready". Each is a
   server action; the page calls them in order. A failure marks its step, shows the reason, and
   returns to the step that owns the field; **Retry** resumes from the failed step (the settings
   are already written, and migrations are safe to repeat). Warnings appear as notices: an
   existing `AUTH_SECRET` shorter than 32 bytes is kept (003), the database server is older than
   the minimum, or the process still uses values from its environment (see Edge cases). When done,
   the page says the instance is set up and offers **Sign in**, which opens `/sign-in` with the
   root email prefilled.

Without JavaScript the same form shows all three groups at once and one **Install** button runs
the three steps in one request; the page comes back with the list filled in and any field errors,
with the passwords empty (they're never sent back).

Below the form, "Prefer the terminal?" keeps today's commands (`pnpm run setup`, `docker compose
exec web pnpm run setup`, and the note that `pnpm setup` is a pnpm command). At the bottom, a
warning: anyone who can open this page can set the instance up; finish it now, or run setup from
the terminal.

**What it writes**, exactly as 003: the settings file (`RONNE_ENV_FILE`, or `apps/web/.env`)
with `DATABASE_URL`, `AUTH_SECRET` (generated, an existing one kept), `STORAGE_PATH` (the
default, created if missing; the wizard doesn't ask for it) and `PUBLIC_URL`, mode 0600, other
lines kept; the migrations; the root account through the identity domain, which refuses a
second root. The audit event `instance.root_created` records `via: "web"` (the terminal records
`via: "cli"`) and, behind a trusted proxy (`TRUST_PROXY=true`), the client address, as sign-in
does.

**No restart.** The app reads its settings on each request, and its database and auth instances
are cached per settings, so the wizard's writes take effect on the next request. Storage joins
that rule (it was cached once per process). `pnpm run setup` stops telling Docker users to
restart, and so do the README, `compose.yaml` and the setup-mode log line, which now says to open
the instance in a browser.

**Where the code lives.** Setup stays a module above the domains, `apps/web/src/server/setup/`:
the step functions (`steps.ts`: check the database, write the settings, apply migrations, create
root) and the state; `run-setup.ts` keeps the terminal's prompts and loops and calls the steps;
`apps/web/src/features/setup/` holds the page, the form and its server actions, thin over the
steps, as sign-in is over the identity domain.

## Edge cases

- **The first visitor owns the instance** (owner's decision, 2026-09-29). Between `up` and the
  first visit, anyone who can reach the port can set the instance up and become root. On a
  laptop or a private network that's fine; on a public host, set it up before exposing the port
  (`pnpm run setup --yes` with the `RONNE_ROOT_*` variables, or `docker compose run --rm -e … web
  pnpm run setup --yes`), or open the page straight away. The README and the page's footer say so.
- **Test connection is an anonymous probe** while no root exists: it tells "unreachable" from
  "wrong password" for any host and port the server can reach. Accepted: it only exists while
  anyone could take the instance anyway, and it goes away with the wizard.
- **Two visitors at once:** the settings file is written atomically (last wins), the migrations
  take their lock table, and root is created in one transaction that refuses a second root. The
  loser sees "Someone already set this instance up. Sign in." without the winner's email.
- **The wizard is interrupted** (tab closed after the settings were written, a failed migration),
  or **`pnpm run setup` is cancelled** at the root prompts: the state is `incomplete`, and the
  next visit resumes at Install with the database kept. Choosing another database instead is
  allowed and leaves the first one untouched, as 003 says.
- **The database was migrated by a newer version:** Install stops at the migrations with 003's
  message, creates no root, and offers another database.
- **The database stops answering after the settings were written:** the panel, not the wizard.
  Fix the server, the environment, or run `pnpm run setup` again.
- **A value already in the process environment wins over the file** (`loadConfig`'s rule):
  `compose.yaml` sets `PUBLIC_URL`, and `pnpm dev` loads an existing `apps/web/.env` when it
  starts. The wizard shows such a value read-only, and if a written value is still shadowed after
  the write (a re-run from a clone that changed the database), the Install list says to restart
  the process and reload. A fresh clone has no `.env`, so the common case needs no restart.
- **The settings file or the SQLite folder isn't writable:** the step fails with the path and, in
  Docker, the `chown -R 1000:1000 /app/data` fix from 005.
- **A relative SQLite path** is relative to `apps/web` (a clone) or to the data volume (Docker),
  as in the terminal.
- **Root exists but is disabled:** the instance is `ready`; the sign-in page can't help, so the
  fix stays `pnpm run reset-root-password` (003).
- **`/setup` once ready** redirects; every setup action also re-checks the state and answers
  "already set up" instead of doing anything.
- **Secrets:** the database password travels only from the form to the action; results, URLs,
  logs and the audit row never contain it (URLs are shown redacted). Server actions are protected
  by the framework's origin check, as every form in the app.
- **The API before setup:** `/api/v1/*` and the token exchange answer `503 setup_required` until
  `ready`, so `rmk login` against an unfinished instance gets a clear error, not a 500.

## Documentation

- **New topic `install` ("Installing Ronne"), in "Getting started" after Overview**
  (`apps/web/src/components/help/topics.ts`, `apps/web/src/features/docs/content.tsx`), sections:
  - `docker`: `compose.yaml` alone, `docker compose up -d`, open the address, the volume, the
    profiles for PostgreSQL and MySQL.
  - `node`: Node 24, `pnpm install`, `pnpm dev` (or `pnpm build && pnpm start`), open the address.
  - `setup`: what the wizard asks and writes, Test connection, the Install list, resuming, that
    the same setup runs from the terminal (`pnpm run setup`, `--yes` with the variables) and why
    someone would (a public host: the first visitor owns the instance).
  - `root`: one root, what it can do, `pnpm run reset-root-password`.
  - `upgrade`: `docker compose pull web && docker compose up -d`, or pull and rebuild; migrations
    run on start.
- **Roles → roles:** "root: the instance's owner, created at setup" becomes "created by the setup
  wizard (or `pnpm run setup`)".
- **Inline helpers:** none in `Help.tsx`. Its helpers link into the Documentation, which needs a
  signed-in session and would bounce back to `/setup`. The wizard uses inline tips (the shared
  `HelpTip` without a link) for the database kinds, the public URL and the root account.
- **Outside the app:** the README's Node and Docker sections say to open the address and follow
  the setup, keep the terminal commands as the alternative, and carry the first-visitor
  sentence; `compose.yaml`'s header and `pnpm run setup`'s closing message drop the restart step;
  MVP §5 and §15 (new "Web setup" row; the "Setup command" and "Docker" rows); 003's spec gets a
  "Where the code lives" note and 005's setup-required paragraph points here.

## Acceptance criteria

Each one is checkable, and each maps to at least one test or a manual check named in `PLAN.md`.

- [ ] From a fresh clone, `pnpm dev` opens on `/setup`; the wizard completes on SQLite, the
  Install list shows the three steps done, **Sign in** lands on `/sign-in` with the email
  prefilled, and root signs in without restarting anything. (Tasks 4, 5)
- [ ] From an empty folder holding only `compose.yaml`, `docker compose up -d` and the browser
  give a working instance without `docker compose exec` or `restart`; `PUBLIC_URL` from the
  environment is shown read-only. (Task 6)
- [ ] With JavaScript off, the single-form version completes setup and signs in. (Tasks 3, 5)
- [ ] Test connection shows the terminal's words for a wrong password, an unreachable host and a
  missing database on MySQL and PostgreSQL, and the version warning for an old server. (Task 1)
- [ ] A `pnpm run setup` cancelled at the root prompt leaves the instance `incomplete`; the
  wizard resumes at Install with the database kept. (Task 4)
- [ ] Until `ready`, every page redirects to `/setup` and `/api/health`, `/api/v1/*` and the
  token exchange answer `503 setup_required`; a configured instance whose database doesn't
  answer shows the panel, never the wizard; once `ready`, `/setup` redirects. (Tasks 2, 5)
- [ ] A second root attempt fails with "already set up", and the audit log holds exactly one
  `instance.root_created` row, with `via: web` from the wizard and `via: cli` from the
  terminal. (Tasks 1, 5)
- [ ] `pnpm run setup` behaves as 003 says, and its tests pass unchanged. (Task 1)
- [ ] The Documentation and inline helpers listed above say what the feature does now. (Task 7)

## Open questions

1. **A separate no-JavaScript Playwright project** (a second `next start` in CI, about a minute)
   or a manual check for the single-form version. Recommended: the project, dropped if CI gets
   slow.
2. **Auto-redirect to sign-in** a few seconds after Install finishes, instead of the button.
   Recommended: the button, so people can read the list and note the address.
