# Ronne AI Marketplace

An open-source, self-hosted, curated registry of AI capabilities: skills, agents, rules, commands,
hooks, MCP servers and more. A team installs it on its own infrastructure, proposes items, reviews
and releases them, and installs them into AI coding tools such as Claude Code, Codex and Cursor with
the `rmk` CLI or from inside those tools through an MCP server.

> **Status:** early development (milestone M0). Nothing is usable yet. The design is in
> [`docs/MVP/MVP.md`](docs/MVP/MVP.md), and progress is tracked in [`docs/features/`](docs/features/README.md).

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
| `pnpm test:db` | Runs only the database tests (in-memory SQLite, or `TEST_DATABASE_URL`) |
| `pnpm test:db:up` / `pnpm test:db:down` | Starts or stops local PostgreSQL, MySQL and MariaDB test servers (Docker) |
| `pnpm test:db:postgres` (or `:mysql`, `:mariadb`) | Runs the database tests against one of those servers |
| `pnpm exec rmk --version` | Runs the local `rmk` CLI (after `pnpm build`) |

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
