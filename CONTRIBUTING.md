# Contributing to Ronne AI Marketplace

Thank you for helping. This page is everything you need to make a change and get it merged: how to
set up, the project's rules, which checks to run, and how a pull request gets in. Taking part means
following the [code of conduct](CODE_OF_CONDUCT.md).

**Found a security problem?** Don't open an issue or a pull request. Report it privately, as
[SECURITY.md](SECURITY.md) says.

## Before you start

- **Small fixes** (a typo, a broken link, a clear bug with a small fix): open a pull request.
- **Anything bigger** (a feature, a change of behaviour, a new dependency): open an issue first, so
  we can agree whether it fits and where it belongs before you spend time on it. Planned work is in
  the [features index](docs/features/README.md); a feature marked `specified` has its spec and plan
  written and is ready to build.
- **Bugs:** use the bug report form in [Issues](https://github.com/ronneai/ronne-marketplace/issues/new/choose).

## Set up

You need:

- **Node.js 26 LTS** (see [`.nvmrc`](.nvmrc)). Develop on it: CI runs everything there. The packages
  run on 22.14 or later, and CI runs `pnpm test:runtime` on exactly 22.14.0.
- **pnpm**, installed directly: `npm install --global pnpm`. It then switches to the version pinned
  in `package.json` on its own. Don't use Corepack: current Corepack releases can't start pnpm 12.
  If `pnpm` is a Corepack shim on your machine, run `corepack disable pnpm` first.
- **Docker**, only for the database server tests and the image.

```sh
git clone https://github.com/ronneai/ronne-marketplace.git
cd ronne-marketplace
pnpm install          # through the supply-chain checks in pnpm-workspace.yaml
pnpm hooks:install    # once per clone: the pre-commit checks and the commit-message check
pnpm dev              # http://localhost:3000
```

Open http://localhost:3000 and follow the setup. It asks for the setup code the server printed when
it started (`pnpm run setup-code` prints it again). To start over, `pnpm run reset-setup` removes
this clone's settings, SQLite database and storage.

## Where things are

| Path | What it holds |
|---|---|
| `apps/web` | The Next.js app: the UI, server actions and the `/api/v1` registry API |
| `packages/core` | The manifest schema, resolver, packer and platform renderers, shared by everything else |
| `packages/cli` | The `rmk` CLI |
| `packages/mcp` | The registry MCP server |
| `packages/server` | `rmk-server`, which runs a packed instance (npm, the Linux packages and the bundles) |
| `packages/config` | Shared TypeScript, Biome and Vitest presets, and the Biome lint plugins |
| `packages/repo-tools` | Checks for this repository: commit messages, witness records, licenses, packages |
| `examples/items/` | One sample item of each type; every one must pass the manifest schema |
| `docs/MVP/MVP.md` | The design: scope, architecture, data model, API, and the decision log (§15) |
| `docs/spec/` | Contracts: the `ronne.yaml` manifest and the files `rmk` writes |
| `docs/features/` | The work, one folder per feature, and the index with the roadmap |
| `docs/issues/` | Bugs from GitHub that need more than a one-line fix, worked like features |
| `docs/knowledge/` | Lessons learned while building, one topic per note ([index](docs/knowledge/README.md)) |
| `docs/policies/` | The [dependency policy](docs/policies/dependencies.md) |
| `docs/runbooks/` | Guides for people running Ronne: install, backup, incidents, release |

## How the work is organised

Every change of behaviour belongs to a **feature** in [`docs/features/`](docs/features/README.md)
or an **issue** in [`docs/issues/`](docs/issues/README.md). Each has a folder with:

- **`SPEC.md`**: what it does and why, its edge cases, its acceptance criteria, and what the
  Documentation should say. If your work changes the behaviour, update the spec in the same change.
- **`PLAN.md`**: the tasks in order, each with a *Done when:* check. Work through them in order.
- **`WITNESS.md`**: the record of an independent check of each task (below).

If a change touches a design decision, check [MVP.md](docs/MVP/MVP.md) first; a change to a
decision updates MVP.md and its decision log in the same change.

### Tasks and the witness: leave the boxes unticked

Before a task in a `PLAN.md` is ticked, a reviewer that didn't do the work (the `state-witness`
agent, [`state-witness.md`](docs/knowledge/state-witness.md)) checks it against the repository and
records a pass in `WITNESS.md`. `pnpm witness:check` fails a ticked task without one.

**As an outside contributor, leave the tasks unticked**, and say in your pull request which tasks it
does. The maintainer runs the witness on your branch, adds the record and ticks the tasks before
merging. You don't need Claude Code or any AI tool for this, and an unticked task passes every
check. If you do run the witness yourself, the maintainer runs it again before merging.

### The Documentation

People using Ronne read the Documentation at
[ronne.ai/marketplace/docs](https://www.ronne.ai/marketplace/docs). Its source is in a separate,
private repository, so you can't change it. Instead:

- fill in the **Documentation** section of the spec (which topics change and what they should
  say, or "None" and why), and say in your pull request what the website should say;
- the maintainer updates the website for the release.

The in-app helpers (`apps/web/src/components/help/`) are in this repository: change them in your
pull request.

## Code rules

Lint and the tests enforce most of these; the rest is checked in review.

- **Arrow functions only.** Every function and React component is `const name = (…) => …`,
  including Next.js pages and layouts. A Biome plugin
  ([`no-function-declaration.grit`](packages/config/biome-plugins/no-function-declaration.grit))
  fails lint on `function`.
- **Screen text goes through messages.** Every word a person reads in the web app is a message in
  `apps/web/messages/<en|pt|fr>/<namespace>.json`, in all three languages, never a string in the
  component. Read [`i18n.md`](docs/knowledge/i18n.md) before writing screen text.
- **Frontend is feature-first:** one folder per feature with its component, `hooks.ts`, `types.ts`
  and tests; shared primitives in `apps/web/src/components/ui`
  ([MVP §9.3](docs/MVP/MVP.md#93-frontend-feature-first)).
- **Backend is domain-first clean architecture** in
  `apps/web/src/server/domains/<domain>/{actions,services,models,repositories,exceptions}`; services
  depend on repository interfaces, and server actions and API routes are thin adapters over the
  same actions ([MVP §9.2](docs/MVP/MVP.md#92-backend-domain-first-clean-architecture)).
- **One database code for SQLite, PostgreSQL, MySQL and MariaDB.** Kysely, one migration set, only
  features all of them support, dialect differences in small helpers in `apps/web/src/server/db/`
  ([MVP §9.4](docs/MVP/MVP.md#94-database)).
- **The design system** ([032](docs/features/032-design-system/SPEC.md)): flat, no shadows, teal as
  the one accent, red and amber only for errors and warnings, colours only through the tokens in
  `apps/web/src/app/globals.css`. Inter for text, IBM Plex Mono only for machine values.
- **Dependencies** follow the [dependency policy](docs/policies/dependencies.md): only licenses
  that allow free use and redistribution (never GPL, AGPL, SSPL, BUSL or non-commercial, even for
  development), the latest stable or LTS version, and no known high or critical vulnerabilities.
  Read it before adding any package, tool, GitHub Action or image.
- **The CLI is `rmk`.** Never use `ronne` or `ronneai` as a command or binary name
  ([MVP §15](docs/MVP/MVP.md#15-decision-log)).
- **Read the knowledge note** for the area you're changing first: the
  [index](docs/knowledge/README.md) lists them, such as how to write regular expressions CodeQL
  accepts. When a check fails for a reason the next person could avoid, add or update a note in the
  same change, and list a new note in the index.

## Tests

- **`pnpm test`** runs every Vitest suite: unit, component, and the database tests on SQLite in
  memory. Add tests next to the code they test.
- **Database tests** are named `*.db.test.ts` and get a database from `createTestDb()`. SQLite
  accepts what the servers refuse, so when you change database code, also run the tests you touched
  against the servers: `pnpm test:db:up`, then `pnpm test:db:postgres -- <paths>` (and `:mysql`,
  `:mariadb`), then `pnpm test:db:down`. Only for database code:
  [`test-runs.md`](docs/knowledge/test-runs.md) says which tests run where.
- **End-to-end tests** (`pnpm test:e2e`, Playwright) build the app and run it against a throwaway
  SQLite instance, on desktop, phone (also WebKit) and tablet. Install the browsers once with
  `pnpm --filter @ronneai/web exec playwright install chromium webkit`.

## Commits

The pre-commit hook (`pnpm hooks:install`) runs `pnpm witness:check` and `pnpm docs:check` on
every commit and, unless
every staged file is Markdown or text, `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build`.
When `package.json`, the lockfile or `pnpm-workspace.yaml` change, it also runs
`pnpm install --frozen-lockfile` and `pnpm licenses:check`. Commit only when they pass, and never
skip them with `--no-verify`.

Commit messages and pull request titles use one format:

```
[type] NNN: Description      for a feature in docs/features (NNN is its 3-digit ID)
[type] #NNN: Description     for an issue in docs/issues (NNN is the GitHub issue number)
[type]: Description          otherwise
```

- `type` is `docs`, `feat`, `chore` or `bugfix`.
- The description is imperative, starts with a capital letter and has no full stop; the whole line
  is at most 72 characters.
- Examples: `[feat] 001: Add CI workflow on Node 22 and 24`,
  `[bugfix] #141: Try older versions when the newest conflicts`, `[docs]: Fix a broken link`.

## Pull requests

- Work on a branch named after the type, such as `feat/187-contributor-docs`,
  `bugfix/141-older-versions` or `docs/fix-install-link`.
- The title follows the commit format (CI checks it); pull requests are squash-merged, so the title
  becomes the commit on `main`.
- Fill in the template: what the change does, the feature or issue, the tasks it does (unticked),
  the checks you ran, and what the Documentation should say.
- Don't write "closes #N" or "fixes #N": issues are closed by hand when the fix is released.
- CI runs lint, typecheck, the tests and the build on the target Node.js (26), `pnpm test:runtime`
  on the oldest supported version (22.14.0), the witness,
  docs and license checks, CodeQL, the end-to-end tests, and the database tests on PostgreSQL,
  MySQL and MariaDB (all of them when database code changes, the database code's own otherwise). A
  pull request that only changes documentation skips the heavy steps. A draft pull request runs
  only the light checks until it's ready for review.

## Commands

Every script in the root `package.json`. A test in `packages/repo-tools` fails when one is missing
here.

**Working on the code**

| Command | What it does |
|---|---|
| `pnpm install` | Installs dependencies through the supply-chain checks in `pnpm-workspace.yaml` |
| `pnpm hooks:install` | Turns on the local pre-commit and commit-message checks (once per clone) |
| `pnpm dev` | Runs the web app at http://localhost:3000 |
| `pnpm build` | Builds every package and the web app (Turborepo), first trimming the build caches over their limits ([`build-caches.md`](docs/knowledge/build-caches.md)) |
| `pnpm start` | Runs the web app's production build (after `pnpm build`) |
| `pnpm lint` / `pnpm format` | Checks lint and formatting with Biome / fixes formatting and safe lint issues |
| `pnpm typecheck` | Type-checks every package |
| `pnpm clean:cache` / `pnpm clean` | Empties Turborepo's and Turbopack's caches / and removes every build output too. Always safe: the next run rebuilds |
| `pnpm exec rmk --version` | Runs the local `rmk` CLI (after `pnpm build`) |

**Tests**

| Command | What it does |
|---|---|
| `pnpm test` | Runs every Vitest suite; `pnpm --filter @ronneai/core test` for one package |
| `pnpm test:runtime` | The tests of the code that runs on a person's Node.js: every suite but the component tests (`*.test.tsx`) and `repo-tools`. CI runs it on exactly the oldest supported Node.js, `MIN_NODE` (22.14.0) |
| `pnpm test:db` | Only the database tests (`*.db.test.ts`), on in-memory SQLite or `TEST_DATABASE_URL` |
| `pnpm test:db:core` | Only the database code's own tests (`db/`, migrations, repositories, setup, backup, scripts) |
| `pnpm test:db:up` / `pnpm test:db:down` | Starts or stops local PostgreSQL, MySQL and MariaDB test servers at the minimum versions (Docker) |
| `pnpm test:db:postgres`, `pnpm test:db:mysql`, `pnpm test:db:mariadb` | The database tests against one of those servers (`-- <paths>` for some files) |
| `pnpm test:e2e` | Builds the web app and runs the Playwright tests (`apps/web/e2e`) against a throwaway SQLite instance (`--shard=1/2` runs half, as CI does) |
| `pnpm test:install` | The install script's tests (`scripts/install/test-install.sh`) under dash and bash |

**Checks**

| Command | What it does |
|---|---|
| `pnpm witness:check` | Checks every `WITNESS.md`, and that each ticked task has a pass that met it |
| `pnpm docs:check` | Checks that every root script has a row in this table and that the [knowledge index](docs/knowledge/README.md) lists every note |
| `pnpm data:disposable-domains` | Refreshes the bundled throwaway email domains (190) from the CC0 `disposable-email-domains` list at its newest commit, checked before it's written; `-- --check` only validates the copy in the repository |
| `pnpm licenses:check` | Checks every installed package's license against `license-policy.json` |
| `pnpm audit --audit-level high` | Fails on known high or critical vulnerabilities |
| `pnpm docs:links` | Checks that the app's Documentation links match the website's topics (skipped unless the private website repository is next to this one) |
| `pnpm i18n:review` | Writes every message, English beside Portuguese and French, for a native speaker to review ([`i18n.md`](docs/knowledge/i18n.md)) |
| `pnpm docker:limits` | How many Docker Hub pulls are left, anonymously and signed in ([`docker-hub-pulls.md`](docs/knowledge/docker-hub-pulls.md)) |

**An instance from this clone**

| Command | What it does |
|---|---|
| `pnpm run setup` | Configures an instance in the terminal (interactive, or `--yes` with environment variables). Never `pnpm setup`: that's a pnpm built-in |
| `pnpm run setup-code` | Prints the one-time code the web setup asks for, making one if there's none |
| `pnpm run reset-setup` | Development only: removes this clone's settings file, SQLite database and storage, so the setup can run again. Asks first, or `--yes`; refuses in production and in Docker |
| `pnpm db:migrate` | Applies pending migrations to `DATABASE_URL` |
| `pnpm run reset-root-password` | Sets a new root password; ends root's sessions and revokes its tokens ([incident runbook](docs/runbooks/incident-response.md)) |
| `pnpm run reset-two-factor` | Turns off one account's two-factor sign-in (`--email`), ends its sessions and revokes its access tokens ([incident runbook](docs/runbooks/incident-response.md)) |
| `pnpm run disable-sso` | Turns every identity provider off, so everyone signs in with a password again ([incident runbook](docs/runbooks/incident-response.md)) |
| `pnpm run revoke-access` | Ends sessions and revokes access tokens ([incident runbook](docs/runbooks/incident-response.md)) |
| `pnpm run rotate-secret` | Makes a new `AUTH_SECRET`; everyone signs in again ([incident runbook](docs/runbooks/incident-response.md)) |
| `pnpm run backup` / `pnpm run restore` | Backs up or restores the database and storage ([backup runbook](docs/runbooks/backup.md)) |

**Packages and releases** (the maintainer's, following the [release runbook](docs/runbooks/release.md))

| Command | What it does |
|---|---|
| `pnpm build:server` | The web app's standalone build and `rmk-server`, which packing `@ronneai/marketplace` copies in |
| `pnpm packages:check` | After `pnpm build` and `pnpm build:server`: checks what the four published packages would contain against an allowlist |
| `pnpm release:smoke` | After `pnpm build` and `pnpm build:server`: installs the packed packages with npm in an empty folder and runs `rmk`, `rmk-mcp` and `rmk-server` |
| `pnpm bundle <tarball>` | Builds this machine's self-contained `rmk-server` archive, Node.js inside, from a packed `@ronneai/marketplace` (`--out DIR`, `--keep`); `node packages/repo-tools/src/bundle-smoke.js <archive>` checks and runs it with no Node.js on `PATH` |
| `pnpm release:version <x.y.z>` | Sets the version the four published packages share, for a patch, a major or a pre-release |

## License

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE), as
the rest of the project is.
