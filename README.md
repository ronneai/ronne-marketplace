# Ronne AI Marketplace

An open-source, self-hosted, curated registry of AI capabilities: skills, agents, rules, commands,
hooks, MCP servers and more. A team installs it on its own infrastructure, proposes items, reviews
and releases them, and installs them into AI coding tools such as Claude Code, Codex and Cursor with
the `rmk` CLI or from inside those tools through an MCP server.

> **Status:** early development. Milestones M0 to M5 are done: Ronne AI Marketplace installs;
> people sign in and get tokens; items go from a draft through review to a catalogue of released
> versions, with change proposals and version management; `rmk` installs them into Claude Code,
> Codex and Cursor; and the registry MCP server does the same from inside those tools. The design is in [`docs/MVP/MVP.md`](docs/MVP/MVP.md), and
> the work is tracked in [`docs/features/README.md`](docs/features/README.md).

## Getting started

You need Node.js and pnpm (see [Requirements](#development)), and optionally a database server.
Ronne never installs a database: SQLite needs nothing extra, and for MySQL, MariaDB or PostgreSQL
you create an empty database and a user first.

```sh
git clone https://github.com/ronneai/ronne-marketplace.git
cd ronne-marketplace
pnpm install
pnpm run setup          # not `pnpm setup`, which is a pnpm command that configures pnpm itself
pnpm build && pnpm start
```

`pnpm run setup` asks which database to use, checks that it can connect and create tables, writes
`apps/web/.env` (readable only by you), creates the tables, and creates the **root** account, which
can do everything, including managing other users. Running it again is safe: it keeps your
settings and never creates a second root.

**Supported databases:** SQLite (the default), MySQL 8.4+, MariaDB 10.11+ and PostgreSQL 15+.
On PostgreSQL 15 and later, a user that doesn't own the database also needs
`GRANT CREATE ON SCHEMA public TO <user>;`. Setup tells you if it's missing.

**Without prompts** (Docker, CI, scripts), pass `--yes` and give the values as environment
variables. The password is never a flag:

```sh
DATABASE_URL=file:./data/ronne.db PUBLIC_URL=https://ronne.example.com \
RONNE_ROOT_EMAIL=you@example.com RONNE_ROOT_NAME="Your Name" RONNE_ROOT_PASSWORD='…' \
pnpm run setup --yes
```

It exits with `0` when done, `1` when a check fails, and `2` when a value is missing or invalid.
`--database-url`, `--public-url`, `--storage-path`, `--root-email` and `--root-name` work as flags too.

**Forgot the root password?** `pnpm run reset-root-password` sets a new one, signs root out
everywhere and revokes its access tokens (`--yes` with `RONNE_ROOT_PASSWORD` works here too).

### With Docker

You need Docker with Compose. Nothing else: the image,
[`ronneai/marketplace`](https://hub.docker.com/r/ronneai/marketplace) on Docker Hub, has Node.js,
and SQLite needs no server. No clone is needed, only [`compose.yaml`](compose.yaml):

```sh
mkdir ronne && cd ronne
curl -fsSLO https://raw.githubusercontent.com/ronneai/ronne-marketplace/main/compose.yaml
docker compose up -d                          # pulls the image and starts Ronne
docker compose exec web pnpm run setup        # asks the same questions as above
docker compose restart web                    # picks up the new settings
```

Open http://localhost:3000 (or set `RONNE_PORT` before `up`). Until setup has run, every page shows
"This instance isn't set up yet", and `/api/health` answers `503`.

- **Your data** (the SQLite file, stored items and the settings file) lives in the `ronne-data`
  volume (Docker names it `ronne-marketplace_ronne-data`), mounted at `/app/data`. Recreating or upgrading the container keeps it. Back up that volume.
- **Upgrading:** `docker compose pull web && docker compose up -d`. Pending database migrations run
  when the container starts. If they fail, the container stops instead of serving a half-migrated database.
- **Versions:** `latest` is the newest stable release. To pin one, set `RONNE_IMAGE` in the
  environment or in a `.env` file next to `compose.yaml`: `RONNE_IMAGE=ronneai/marketplace:0.1.0`.
  Each release is tagged `X.Y.Z`, `X.Y` and, from major 1, `X`; a pre-release only `X.Y.Z`. The
  image is built for `linux/amd64` and `linux/arm64`, carries the same version as the npm packages,
  and has BuildKit provenance and SBOM attestations (`docker buildx imagetools inspect ronneai/marketplace:latest`).
- **Pull limits:** Docker Hub allows anonymous pulls of 100 per 6 hours per address, and 200 for a
  free account that's logged in (`docker login`). A busy shared address can hit it.
- **Building from a checkout** (contributors): `docker compose -f compose.yaml -f compose.build.yaml up -d --build`.
  The override builds the local image under its own name, so a later `pull` never replaces it.
- **PostgreSQL or MySQL instead of SQLite:** `docker compose --profile postgres up -d` (or
  `--profile mysql`) also starts that database. Set `RONNE_DB_PASSWORD` first. In setup, use host
  `postgres` (or `mysql`), and database and user `ronne`.
- **Without prompts:** `docker compose exec -T web pnpm run setup --yes`, with the variables from
  the section above passed as `-e NAME=value` (`DATABASE_URL=file:./data/ronne.db` for SQLite).
- **Root password:** `docker compose exec web pnpm run reset-root-password`.
- **"isn't writable" on start:** the volume is owned by root. Fix it once with
  `docker compose run --rm --user root web chown -R 1000:1000 /app/data`.

**Behind a reverse proxy** (nginx, Caddy, Traefik): proxy HTTPS to port 3000, and set `PUBLIC_URL`
to the public address, for example `PUBLIC_URL=https://ronne.example.com docker compose up -d`.
Set `TRUST_PROXY=true` too, so Ronne takes the client's address from the proxy's `X-Forwarded-For`:
sign-in is then rate-limited per address as well as per email, and sessions record it. Only set it
when a proxy you control sits in front of Ronne and adds that header; otherwise anyone could forge it.

## The `rmk` CLI

`rmk` installs approved items into your AI coding tools, and keeps them current: `login`, `search`,
`info`, `install`, `update`, `outdated`, `remove`, `list`, `platforms` and `mcp-setup`, with a
lockfile so a team gets the same files. Claude Code, Codex and Cursor are supported.

The registry MCP server, `rmk-mcp` (`packages/mcp`), does the same from inside those tools: the
assistant searches, shows a plan of what an install would change, and applies it once you've seen
it. `rmk mcp-setup` adds it to each tool's MCP settings.

Both are on npm, and need Node.js 22.12 or later:

```sh
npm install --global @ronneai/rmk @ronneai/mcp
rmk login --registry https://your-ronne-instance.example
rmk install @scope/name
rmk mcp-setup                      # registers rmk-mcp with the AI tools this project uses
```

The package is [`@ronneai/rmk`](https://www.npmjs.com/package/@ronneai/rmk) because the unscoped
`rmk` name is taken on npm; the command is still `rmk`. The server is
[`@ronneai/mcp`](https://www.npmjs.com/package/@ronneai/mcp), and both build on
[`@ronneai/core`](https://www.npmjs.com/package/@ronneai/core). The Documentation inside the app
(Docs → Installing with rmk, and Registry MCP server) explains the commands and the files they write.

If you built them from a clone before and linked them, run `npm unlink --global @ronneai/rmk
@ronneai/mcp` first, so the npm install is what `rmk` runs. Contributors can still run the local
build: after `pnpm build`, `pnpm exec rmk` (or `node packages/cli/dist/bin.js`), and
`rmk mcp-setup --command "node /path/to/packages/mcp/dist/bin.js"` for the server. Releasing a new
version is described under Development.

## Development

**Requirements**

- Node.js 24 LTS (see [`.nvmrc`](.nvmrc)). Node.js 22.12 or later also works.
- pnpm. Install it directly with `npm install --global pnpm`; it then switches to the version pinned
  in `package.json` (`packageManager`) on its own. Don't use Corepack: current Corepack releases
  can't start pnpm 12. If `pnpm` is a Corepack shim on your machine, run `corepack disable pnpm` first.

**Commands**

| Command | What it does |
|---|---|
| `pnpm install` | Installs dependencies, with the supply-chain checks in `pnpm-workspace.yaml` |
| `pnpm dev` | Runs the web app at http://localhost:3000 |
| `pnpm build` | Builds every package and the web app |
| `pnpm lint` | Checks lint and formatting with Biome |
| `pnpm format` | Fixes formatting and safe lint issues |
| `pnpm typecheck` | Type-checks every package |
| `pnpm test` | Runs every test with Vitest |
| `pnpm hooks:install` | Turns on the local git hooks (once per clone): checks before each commit, and the commit-message format |
| `pnpm run setup` | Configures an instance: database, `.env`, tables and the root account |
| `pnpm run reset-root-password` | Sets a new root password and signs root out everywhere |
| `pnpm db:migrate` | Applies pending database migrations |
| `pnpm test:e2e` | Builds the web app and runs the end-to-end tests (Playwright, Chromium) against a throwaway instance. Install the browser once with `pnpm --filter @ronneai/web exec playwright install chromium` |
| `pnpm test:db` | Runs only the database tests (in-memory SQLite, or `TEST_DATABASE_URL`) |
| `pnpm test:db:up` / `pnpm test:db:down` | Starts or stops local PostgreSQL, MySQL and MariaDB test servers (Docker) |
| `pnpm test:db:postgres` (or `:mysql`, `:mariadb`) | Runs the database tests against one of those servers |
| `pnpm exec rmk --version` | Runs the local `rmk` CLI (after `pnpm build`) |
| `pnpm packages:check` | Checks what `@ronneai/core`, `@ronneai/rmk` and `@ronneai/mcp` would publish against an allowlist (after `pnpm build`) |
| `pnpm release:smoke` | Installs the packed packages with npm in an empty folder and runs `rmk` and `rmk-mcp` (after `pnpm build`) |
| `pnpm release:version <x.y.z>` | Sets the version the three published packages share. Commit it, then push the tag `vX.Y.Z`: the Release workflow checks, packs and publishes them to npm with provenance, and creates the GitHub release |

**Layout**

| Path | What it holds |
|---|---|
| `apps/web` | The Next.js app: UI, server actions and the `/api/v1` registry API |
| `packages/core` | Manifest schema, resolver, packer and platform renderers |
| `packages/cli` | The `rmk` CLI |
| `packages/mcp` | The registry MCP server |
| `packages/config` | Shared TypeScript, Biome and Vitest presets |
| `packages/repo-tools` | Checks for this repository, such as the commit message format |
| `docs/` | The MVP design, specs, feature plans and policies |
| `examples/items/` | One sample item of each type |

## Contributing

Commits and pull request titles use `[type] NNN: Description`, where `type` is `docs`, `feat`,
`chore` or `bugfix` and `NNN` is the feature ID (left out, as `[type]: Description`, when the change
isn't part of a feature). Run `pnpm hooks:install` once: before each commit it runs lint, typecheck, test and build (skipped when
the commit only changes Markdown or text files), and it checks the commit message. CI checks
pull request titles.


Work is organised as features in [`docs/features/`](docs/features/README.md): read a feature's
`SPEC.md`, then follow its `PLAN.md`. Every new dependency must follow the
[dependency policy](docs/policies/dependencies.md): free and redistributable licenses only, the
latest stable or LTS versions, and no known vulnerabilities.

## License

[MIT](LICENSE)
