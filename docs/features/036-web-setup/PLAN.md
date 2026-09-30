# 036 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Shared steps and the audit origin.** `apps/web/src/server/setup/steps.ts`: the step
  logic now private in `run-setup.ts`, as four functions with no prompts and no logging, each
  opening and closing its own connection (`createDb`, never the cached pool): `checkDatabase(url)`
  (003's connection, version, charset and permission checks; a problem is `{ kind, explanation,
  detail? }` with the explanations moved out of `run-setup.ts`; the old-version warning is
  returned, not logged), `writeSettings({ envPath, appDir, databaseUrl, publicUrl, storagePath? })`
  (`updateEnvFile`, the storage folder, the weak-secret flag, and `restartNeeded`: true when
  `loadConfig` still answers with other values after the write, because the environment wins),
  `applyMigrations(url)` (lets `DatabaseAheadOfAppError` through), and `createRootAccount(url,
  input, origin)`. `public-url.ts` holds the URL rule (`^https?://`, trailing slashes removed)
  for both front ends. `run-setup.ts` keeps its prompts and loops and calls the steps; its logged
  lines don't change. `createRootUser` and `createRoot` in the identity domain take
  `origin: { via: "cli" | "web", ipAddress? }` and record it in the audit row (default `cli`).
  *Done when:* `steps.db.test.ts` passes on SQLite and under `pnpm test:db:postgres` and
  `:mysql` (each problem kind's explanation, `writeSettings`'s flags and 0600, migrations twice,
  root created then refused, the audit row's `via` and address), and `run-setup.db.test.ts` and
  `scripts/setup.db.test.ts` pass unchanged.

- [x] **2. The setup state and its callers.** `apps/web/src/server/setup/state.ts`:
  `getSetupState(config, getDb)` → `not_configured` | `incomplete` | `unavailable` | `ready`
  (no settings; settings but no `user` table or no root; a thrown connection error; a root),
  `ready` cached on `globalThis` keyed by the database URL, plus a reset for tests.
  `SETUP_PATH = "/setup"` in `route-guard.ts`, accepted by `isPublicPath`. The root layout
  (`app/layout.tsx`) reads the state: `ready` renders the app, `unavailable` renders a
  `DatabaseUnavailable` panel (`features/setup/`), anything else redirects to `/setup` unless
  that's the requested path (`PATH_HEADER`). `health.ts` maps the states to `setup_required`,
  `database_unavailable` and the `select 1` check; `setupRequiredResponse` gets the new message;
  `require-token.ts` and the token route answer 503 until `ready`; `prepare-start.ts` only
  changes its setup-mode line. `server/storage/index.ts` caches one adapter per path, like the
  pools. `app/sign-in/page.tsx` and `SignInPage` accept `?email=` (trimmed, at most 255
  characters) as the form's initial value. A placeholder `app/setup/page.tsx` renders the
  terminal commands (`TerminalSetup`, moved from `features/setup-required/`, which is deleted
  with its test).
  *Done when:* `state.db.test.ts` covers the four states and the cache, `health.db.test.ts` gains
  the `incomplete` and `unavailable` cases, `prepare-start.db.test.ts` passes, and with an empty
  `RONNE_ENV_FILE` `/` lands on `/setup` while `/api/health` answers 503.

- [x] **3. The development reset.** `apps/web/scripts/reset-setup.ts` and the root script
  `reset-setup`: refuses when `NODE_ENV=production` or `RONNE_RUNTIME=docker` (exit 2, nothing
  touched); reads the settings file through `loadConfig`; lists the settings file, the SQLite
  file named by `DATABASE_URL` when it resolves under `apps/web` (plus `-wal` and `-shm`), and
  the storage folder when it's under `apps/web/data`; asks for confirmation (the `SetupPrompts`
  `confirm`) unless `--yes`; removes them and prints each; with a server database it removes the
  settings file only and says the database is untouched. Not listed in `tsdown.config.ts`, so it
  isn't in `dist-scripts` or the image, and `docker/pnpm` keeps rejecting it. In development,
  `getSetupState` skips the `ready` cache, so `pnpm dev` shows the wizard on the next request.
  `README.md`'s Development table and `CLAUDE.md`'s command table get the row.
  *Done when:* `reset-setup.test.ts` covers the refusals, the listing, `--yes`, the SQLite and
  server cases and the outside-`apps/web` path; after `pnpm run setup` then `pnpm run reset-setup
  --yes`, a running `pnpm dev` answers `/` with a redirect to `/setup`.

- [x] **4. The form and the no-JavaScript install.** `apps/web/src/features/setup/`: `SetupPage`
  (server: brand mark, heading, the form, "Prefer the terminal?", the first-visitor warning),
  `SetupForm` (the three fieldsets with 003's prompt ids as field names, all visible without
  JavaScript, one Install button bound to `installAll` with `useActionState`), `form.ts` (pure
  `FormData` → database answers and root input, testable), `types.ts` (state and error codes with
  the field each belongs to, as `features/account/types.ts` does), `actions.ts` (`"use server"`:
  `testDatabase`, `installSettings`, `installMigrations`, `installRoot`, `installAll`; each
  re-checks the state, answers `{ ok } | { error }`, and never returns a password or an
  unredacted URL). A `Select` primitive in `components/ui/Field.tsx` (native `<select>` with
  `inputClasses`) replaces the three local `selectClasses` copies. Docker hints when
  `RONNE_RUNTIME=docker`; the read-only public URL when `process.env.PUBLIC_URL` is set; the
  "keep the database" checkbox when `incomplete`.
  *Done when:* `setup.test.tsx` (heading, field names, commands, warning, Docker hints only in
  Docker, read-only URL, the checkbox only when `incomplete`) and `form.test.ts` pass, and a
  browser with JavaScript off completes setup on SQLite from `pnpm dev` and signs in.

- [x] **5. The progressive wizard.** `SetupWizard.tsx` (`"use client"`) hydrates the same form:
  one fieldset at a time with a step header and Next/Back; Test connection reads the form and
  calls `testDatabase` in a transition, showing the explanation and detail; the final submit runs
  `installSettings` → `installMigrations` → `installRoot` and updates `StepList.tsx` (pending,
  running, done, failed; `aria-live="polite"`); a failure returns to the owning step and Retry
  resumes from the failed step; the weak-secret, old-version and restart-needed notices; the
  `incomplete` resume; the finished screen with **Sign in** to `/sign-in?email=…`.
  *Done when:* the wizard completes in `pnpm dev` on SQLite and on a local PostgreSQL
  (`pnpm test:db:up`), a wrong password shows the terminal's words, and after `pnpm run setup` is
  cancelled at the root prompt the page resumes at Install with the database kept.

- [x] **6. End to end.** `e2e/harness.ts` gains `prepareBlankInstance()` (a temporary folder, a
  settings path that doesn't exist yet, `DATABASE_URL`, `AUTH_SECRET` and `PUBLIC_URL` set to
  empty so nothing from a developer's `.env` leaks in, a free port); `playwright.config.ts` runs
  it as extra web servers with readiness on `/setup`, and projects `wizard` and `wizard-nojs`
  (`javaScriptEnabled: false`) with their own `baseURL` and test file, ignored by the main
  project. `e2e/setup-wizard.e2e.ts`: `/` redirects to `/setup`, health is 503, an absolute SQLite
  path (a relative one would write into the repository), Test connection, the public URL, root,
  Install with three rows done, Sign in with the email prefilled, the header shows root, `/setup`
  redirects, health 200, a second root attempt through the action fails.
  *Done when:* `pnpm test:e2e` passes, and `audit.e2e.ts` still finds one `instance.root_created`
  row on the main instance.

- [x] **7. Docker and the terminal path.** `scripts/setup.ts`'s closing message drops the
  restart step; `compose.yaml`'s header and `.env.example` say to open the address; the README's
  Node and Docker sections say to open the address and follow the setup, keep the terminal
  commands, and carry the first-visitor sentence. Then build with `compose.build.yaml` and walk
  the wizard from a folder holding only `compose.yaml` (`RONNE_IMAGE=ronne-web:local`), on SQLite
  and with `--profile postgres`.
  *Done when:* both walkthroughs sign in without `docker compose restart web`, the read-only
  `PUBLIC_URL` is visible, and `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass.

- [x] **8. Documentation.** The `install` topic and its five sections, the roles wording, MVP §5
  and §15 (the new "Web setup" row, and the "Setup command" and "Docker" rows), the notes in
  003's and 005's specs, and the index status.
  *Done when:* `docs.test.tsx` and `help.test.tsx` pass, every new section renders, and the
  index says `done`.

## Notes

- Task 1: `steps.ts` opens a connection per step (`createDb`), so its tests use a SQLite file in
  a temporary folder rather than `createTestDb()`'s in-memory database, which would be a
  different empty database on every open. `writeSettings` computes `restartNeeded` from the
  process environment it's given (a `DATABASE_URL` or `PUBLIC_URL` there that differs from what
  was written), not by re-reading the file. The terminal's logged lines didn't change:
  `run-setup.db.test.ts` and `scripts/setup.db.test.ts` passed untouched, on SQLite, PostgreSQL
  and MySQL.
- Task 2: `getSetupState` remembers `ready` only when asked, and the default is "in production"
  (`NODE_ENV`), so tests and `pnpm dev` always check. It races the check against a 3 s timeout,
  so an unreachable server makes every page answer with the panel in bounded time instead of
  hanging. The root layout can't tell the proxy to skip sign-in, so before setup `/` still goes
  through `/sign-in`, which then redirects to `/setup`: two hops, one page. The token guard's
  `configured` dependency became `ready`, and `health` answers `setup_required` for both
  `not_configured` and `incomplete`, so Docker's health check stays red until root exists.
- Task 3: `reset-setup` acts on what the app sees (`loadConfig`, so `RONNE_ENV_FILE` and the
  environment count), and only removes files under the app folder (the database) or under
  `data/` (storage); anything else is listed as left alone. Its CLI test points `RONNE_ENV_FILE`
  at a temporary folder with a database outside the app, so it never touches the developer's own
  clone. Checked live: after `pnpm run setup --yes` a running `pnpm dev` answered health with 200
  and `/setup` with a redirect; after `pnpm run reset-setup --yes`, without a restart, `/` ended
  on `/setup` and health answered 503.
- After task 8 (owner, 2026-09-30): the README's install sections, `compose.yaml` and the
  "Installing Ronne" topic describe only the image (or the source) and the web setup; the
  terminal setup and `--yes` are in the README's Development section.
- Task 4: the install logic lives in `features/setup/install.ts` as functions of a context
  (app folder, settings file, environment, database opener, audit origin), and `actions.ts` only
  builds that context from the request; `install.db.test.ts` runs the steps against a temporary
  app folder. Without JavaScript, a redirect from the *page* after the action came back as a 307,
  which the browser re-sent as a POST to `/sign-in` ("Failed to find Server Action"); a
  `redirect()` inside the action gives the 303 the framework documents, so `installAll` redirects
  to `/sign-in?email=…&setup=done` itself, and the spec says so. Checked in Chromium with
  JavaScript off against `pnpm dev`: a short password came back with the list (settings and
  migrations done, root failed), the values kept and the password cleared; the retry landed on
  sign-in with the email and the notice, and root signed in. `Select` in `components/ui/Field.tsx`
  replaced four local copies of the same classes.
- Task 5: the wizard is the same `SetupForm`: the server renders the single form, and an effect
  after hydration switches to one group at a time, so the no-JavaScript markup is exactly what a
  browser without it gets. A client component can't import `server/setup/steps.ts` (it pulls the
  database and argon2 into the browser bundle: the build failed), so the product name in
  "Connected to PostgreSQL 15.19" comes from `server/setup/server-name.ts`, a module with no
  runtime imports that the terminal uses too (it used to print "Connected to 15.19"). The page uses
  the full brand logo (owner, 2026-09-30). Checked in Chromium: SQLite with Test connection; on
  the local PostgreSQL (`pnpm test:db:up`) a wrong password showed "The server refused the user
  name or password." and the right one "Connected to PostgreSQL 15.19 …", then the install; and
  after `pnpm run setup --yes` stopped at the root prompt (exit 2), the page said the setup
  didn't finish, kept the database, and Install reported "Database up to date" then the root,
  and root signed in. Two things about checking against `next dev`: the browser must use
  `localhost`, not `127.0.0.1` (Next blocks its dev resources for other origins, so nothing
  hydrates), and only one dev server can run per checkout (`.next/dev/lock`), so with the owner's
  `pnpm dev` running the checks used `next build` + `next start` on another port.
- Task 6: `RONNE_E2E_INSTANCE` now carries three instances (`main`, `wizard`, `nojs`), so the
  `rmk` and MCP tests read `main.baseURL`. The blank instances wait on `/setup` (health is 503
  there until the test sets them up). In the setup form, the database and the root account both
  have a "Password" field, so the tests select the setup fields by name and keep the labels for
  the sign-in page. The whole suite passed locally with the three servers: the wizard test also
  checks the audit log shows one `instance.root_created` row on its own instance.
- Task 7: the terminal setup's closing message no longer says to restart (in Docker it says to
  open the address; from a clone, to start the server if it isn't running). Checked with the
  image built by `compose.build.yaml`, from a folder holding only `compose.yaml`
  (`RONNE_IMAGE=ronne-web:local`): health 503, the wizard on `/setup` with the default SQLite
  path inside the volume, `PUBLIC_URL` from the environment shown read-only with its note, the
  three steps done, health 200 and root signed in, all without `docker compose restart web`; then
  the same with `--profile postgres` (host `postgres`, database and user `ronne`,
  `RONNE_DB_PASSWORD`), which reported "Connected to PostgreSQL 18.6".
- Task 8: the `install` topic sits in "Getting started" between Overview and Roles. Its words
  come from what the app does now (the four steps, the read-only public address, the resume, the
  terminal alternative and `--yes`), and the docs test checks it never says "restart". MVP §5
  describes the setup once for both front ends and §15 gains a "Web setup" row; 003 says where
  the shared steps live, and 005's setup-required paragraph points here.

Facts the design rests on (checked in the code, 2026-09-29):

- `loadConfig()` reads the settings file on every call, environment variables win over it, and
  an empty variable counts as unset. Database pools (`db/instance.ts`) and the auth instance
  (`identity/repositories/auth-instance.ts`) are cached per settings; only storage
  (`server/storage/index.ts`) is cached once per process, which task 2 fixes. That's why setup
  needs no restart.
- `next dev` and `next start` load `apps/web/.env` into the process environment at boot, so a
  value present at boot can't be changed by rewriting the file until a restart; a fresh clone has
  no `.env`. `compose.yaml` sets `PUBLIC_URL` in the environment on purpose (that's how a reverse
  proxy's address is given), so the wizard shows it read-only.
- The settings file is written atomically (temporary file and rename, mode 0600) by
  `env-file.ts`; `migrateToLatest` uses a lock table; `createRootUser` refuses a second root
  inside its transaction. Two visitors need no new code.
- `process.cwd()` is `apps/web` in `pnpm dev`, `next start` and Docker (`WORKDIR /app/apps/web`,
  with `./data` linked to the volume), which `envFilePath()` already relies on.
- The proxy sends every visitor without a session to `/sign-in` and leaves `/api/*` alone; the
  root layout replaces every page before setup. `safeNextPath` already refuses public paths, so
  adding `/setup` to `isPublicPath` also keeps sign-in from sending anyone back to it.
- Playwright's server readiness needs a 2xx, and `/api/health` answers 503 before setup, so the
  blank instances wait on `/setup` instead.
- `/docs` needs a session, so the wizard can't link into the Documentation; its help is inline.
