# 036 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Shared steps and the audit origin.** `apps/web/src/server/setup/steps.ts`: the step
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

- [ ] **2. The setup state and its callers.** `apps/web/src/server/setup/state.ts`:
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

- [ ] **3. The form and the no-JavaScript install.** `apps/web/src/features/setup/`: `SetupPage`
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

- [ ] **4. The progressive wizard.** `SetupWizard.tsx` (`"use client"`) hydrates the same form:
  one fieldset at a time with a step header and Next/Back; Test connection reads the form and
  calls `testDatabase` in a transition, showing the explanation and detail; the final submit runs
  `installSettings` → `installMigrations` → `installRoot` and updates `StepList.tsx` (pending,
  running, done, failed; `aria-live="polite"`); a failure returns to the owning step and Retry
  resumes from the failed step; the weak-secret, old-version and restart-needed notices; the
  `incomplete` resume; the finished screen with **Sign in** to `/sign-in?email=…`.
  *Done when:* the wizard completes in `pnpm dev` on SQLite and on a local PostgreSQL
  (`pnpm test:db:up`), a wrong password shows the terminal's words, and after `pnpm run setup` is
  cancelled at the root prompt the page resumes at Install with the database kept.

- [ ] **5. End to end.** `e2e/harness.ts` gains `prepareBlankInstance()` (a temporary folder, a
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

- [ ] **6. Docker and the terminal path.** `scripts/setup.ts`'s closing message drops the
  restart step; `compose.yaml`'s header and `.env.example` say to open the address; the README's
  Node and Docker sections say to open the address and follow the setup, keep the terminal
  commands, and carry the first-visitor sentence. Then build with `compose.build.yaml` and walk
  the wizard from a folder holding only `compose.yaml` (`RONNE_IMAGE=ronne-web:local`), on SQLite
  and with `--profile postgres`.
  *Done when:* both walkthroughs sign in without `docker compose restart web`, the read-only
  `PUBLIC_URL` is visible, and `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass.

- [ ] **7. Documentation.** The `install` topic and its five sections, the roles wording, MVP §5
  and §15 (the new "Web setup" row, and the "Setup command" and "Docker" rows), the notes in
  003's and 005's specs, and the index status.
  *Done when:* `docs.test.tsx` and `help.test.tsx` pass, every new section renders, and the
  index says `done`.

## Notes

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
