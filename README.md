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

Run the image, open it in the browser, and the setup does the rest: it asks which database to use,
checks the connection, asks for the public address and the **root** account, creates the tables
and the account, and sends you to sign in. Ronne never installs a database: SQLite (the default)
needs nothing extra, and for MySQL 8.4+, MariaDB 10.11+ or PostgreSQL 15+ you create an empty
database and a user first (on PostgreSQL 15 and later, a user that doesn't own the database also
needs `GRANT CREATE ON SCHEMA public TO <user>;`; the setup tells you if it's missing).

### With Docker

You need Docker with Compose 2.23.1 or later. Nothing else: the image,
[`ronneai/marketplace`](https://hub.docker.com/r/ronneai/marketplace) on Docker Hub, has Node.js,
and SQLite needs no server. No clone is needed, only [`compose.yaml`](compose.yaml):

```sh
mkdir ronne && cd ronne
curl -fsSLO https://raw.githubusercontent.com/ronneai/ronne-marketplace/main/compose.yaml
docker compose up -d                          # pulls the image and starts Ronne
```

Then open http://localhost:7650 and follow the setup. Anyone who can open that address before you
can set the instance up, so open it right after `up`.

A small proxy, [Caddy](https://caddyserver.com), runs next to Ronne and is the only way in: HTTP
on port **7650** and HTTPS on **7651**, ports nothing common uses (3000 often clashes with other
dev servers). Ronne's own port, 3000, isn't published. Settings go in a `.env` file next to
`compose.yaml`; after changing it, run `docker compose up -d` again.

**Upgrading from a `compose.yaml` before the proxy:** the address moves from
`http://localhost:3000` to `http://localhost:7650`. Put `RONNE_PORT=3000` in `.env` to keep the old
one. An old `compose.yaml` still works with new images.

#### Your own domain with HTTPS

Point the domain's DNS (`A`, and `AAAA` for IPv6) at the server, open ports 80 and 443 in its
firewall, and write this `.env`:

```sh
RONNE_DOMAIN=ronne.example.com
RONNE_PORT=80
RONNE_HTTPS_PORT=443
# RONNE_ACME_EMAIL=ops@example.com    # optional: expiry notices from the certificate authority
```

`docker compose up -d`, then open `https://ronne.example.com`. Caddy gets a Let's Encrypt
certificate on the first visit, renews it, and redirects `http://` to `https://`. `PUBLIC_URL`
follows the domain unless you set it. If no certificate comes, `docker compose logs proxy` says
why: usually the DNS, a closed port, or ports other than 80 and 443.

- **Your own certificate** (a private network, or one from your IT team): add `RONNE_TLS=files`
  and put `cert.pem` (full chain) and `key.pem` in `./certs` next to `compose.yaml`. After
  replacing them, `docker compose up -d --force-recreate proxy`. `RONNE_TLS=internal` issues a
  test certificate from Caddy's own CA instead (browsers warn; `rmk` needs `NODE_EXTRA_CA_CERTS`).
- **Behind a proxy you already run** (nginx, Apache, Traefik, a load balancer that does TLS):
  leave `RONNE_DOMAIN` empty and point your proxy at `http://127.0.0.1:7650`, with:

  ```sh
  RONNE_PORT=127.0.0.1:7650              # not reachable from outside
  PUBLIC_URL=https://ronne.example.com
  RONNE_TRUSTED_PROXIES=private_ranges   # take the client's address from your X-Forwarded-For
  ```

  Your proxy must append to `X-Forwarded-For` (nginx: `$proxy_add_x_forwarded_for`) and allow
  request bodies of at least 28 MB (nginx: `client_max_body_size 28m;`), for drafts sent with a
  token. Keep the port on 127.0.0.1: with private ranges trusted, a client reaching it directly
  could claim any address.
- **Certificates** live in the `caddy-data` volume. `docker compose down -v` deletes them, and
  Let's Encrypt limits how often a domain can ask for new ones.

| Setting | Default | Meaning |
|---|---|---|
| `RONNE_PORT` | `7650` | Host port (or `address:port`) for HTTP |
| `RONNE_HTTPS_PORT` | `7651` | Host port (or `address:port`) for HTTPS, TCP and UDP |
| `RONNE_DOMAIN` | empty | The name to serve over HTTPS. Empty: HTTP only |
| `RONNE_TLS` | `auto` | With a domain: `auto` (Let's Encrypt), `files` (`./certs`), `internal` (Caddy's CA) |
| `RONNE_ACME_EMAIL` | empty | Email for the certificate authority |
| `RONNE_TRUSTED_PROXIES` | empty | Who may set `X-Forwarded-For` (Caddy's `trusted_proxies static`) |
| `PUBLIC_URL` | `https://RONNE_DOMAIN`, or `http://localhost:RONNE_PORT` | The address people open |

#### Running it

- **Your data** (the SQLite file, stored items and the settings file) lives in the `ronne-data`
  volume (Docker names it `ronne-marketplace_ronne-data`), mounted at `/app/data`. Recreating or upgrading the container keeps it. Back up that volume.
- **Upgrading:** `docker compose pull && docker compose up -d`. Pending database migrations run
  when the container starts. If they fail, the container stops instead of serving a half-migrated database.
- **Versions:** to pin one, set `RONNE_IMAGE` in the environment or in a `.env` file next to
  `compose.yaml`: `RONNE_IMAGE=ronneai/marketplace:0.1.1`. The tags:

  | Tag | Meaning |
  |---|---|
  | `latest` | The newest stable release |
  | `X.Y.Z` | One release, never moved |
  | `X.Y` | The newest patch of that minor |
  | `X` | The newest release of that major, from major 1 |

  A pre-release gets only its `X.Y.Z` tag, and `latest` doesn't move. Every image is built for
  `linux/amd64` and `linux/arm64`, carries the same version as the npm packages, and has BuildKit
  provenance and SBOM attestations (`docker buildx imagetools inspect ronneai/marketplace:latest`).
- **Pull limits:** Docker Hub allows anonymous pulls of 100 per 6 hours per address, and 200 for a
  free account that's logged in (`docker login`). A busy shared address can hit it.
- **PostgreSQL or MySQL instead of SQLite:** `docker compose --profile postgres up -d` (or
  `--profile mysql`) also starts that database. Set `RONNE_DB_PASSWORD` first. In the setup, use
  the host `postgres` (or `mysql`), and the database and user `ronne`.
- **Forgot the root password:** `docker compose exec web pnpm run reset-root-password` sets a new
  one and signs root out everywhere.
- **"isn't writable" on start:** the volume is owned by root. Fix it once with
  `docker compose run --rm --user root web chown -R 1000:1000 /app/data`.

### From source

For developers, or a host without Docker. You need Node.js and pnpm (see
[Requirements](#development)).

```sh
git clone https://github.com/ronneai/ronne-marketplace.git
cd ronne-marketplace
pnpm install
pnpm build && pnpm start          # or `pnpm dev` while developing
```

Then open http://localhost:3000 and follow the setup. It writes `apps/web/.env` (readable only by
you) and, with SQLite, the database under `apps/web/data/`. Anyone who can open that address before
you can set the instance up, so open it right after starting. A forgotten root password is reset
with `pnpm run reset-root-password`.

**Behind a reverse proxy, from source** (nginx, Caddy, Traefik): proxy HTTPS to port 3000, and set
`PUBLIC_URL` to the public address in `apps/web/.env`. Set `TRUST_PROXY=true` too, so Ronne takes
the client's address from the proxy's `X-Forwarded-For`: sign-in is then rate-limited per address
as well as per email, and sessions record it. Only set it when a proxy you control sits in front of
Ronne and adds that header; otherwise anyone could forge it. With Docker, `compose.yaml` does all
this already (see [Your own domain with HTTPS](#your-own-domain-with-https)).

**Building the image from a checkout** (contributors):
`docker compose -f compose.yaml -f compose.build.yaml up -d --build`. The override builds the local
image under its own name, `ronne-web:local`, so a later `docker compose pull` never replaces it.

## The `rmk` CLI

`rmk` installs approved items into your AI coding tools, and keeps them current: `login`, `search`,
`info`, `install`, `update`, `outdated`, `remove`, `list`, `platforms` and `mcp-setup`, with a
lockfile so a team gets the same files. Claude Code, Codex and Cursor are supported. `rmk export`
goes the other way: it sends a skill, agent, command, rule or MCP server you wrote for Claude Code,
Codex or Cursor to the registry as a private draft, after showing you everything it would upload (and never an MCP
server's credentials).

The registry MCP server, `rmk-mcp` (`packages/mcp`), does the same from inside those tools: the
assistant searches, shows a plan of what an install would change, and applies it once you've seen
it. It can export an item you wrote the same way: it asks which scope, shows every file it would
upload, and creates the draft once you've approved. `rmk mcp-setup` adds it to each tool's MCP
settings.

Both are on npm, and need Node.js 22.12 or later:

```sh
npm install --global @ronneai/rmk @ronneai/mcp
rmk login --registry https://your-ronne-instance.example
rmk install @scope/name
rmk export my-skill --to @scope    # a skill from .claude/skills/, as a draft
rmk mcp-setup                      # registers rmk-mcp with the AI tools this project uses
```

The package is [`@ronneai/rmk`](https://www.npmjs.com/package/@ronneai/rmk) because the unscoped
`rmk` name is taken on npm; the command is still `rmk`. The server is
[`@ronneai/mcp`](https://www.npmjs.com/package/@ronneai/mcp), and both build on
[`@ronneai/core`](https://www.npmjs.com/package/@ronneai/core). The Documentation inside the app
(Docs → Installing with rmk, Exporting your own items, and Registry MCP server) explains the
commands and the files they write.

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

**Setting up without the browser** (CI, scripts, or a host that must be set up before its port is
exposed). The same setup runs in the terminal as `pnpm run setup` (not `pnpm setup`, a pnpm
built-in), and without prompts with `--yes` and the values as environment variables; the password
is never a flag:

```sh
DATABASE_URL=file:./data/ronne.db PUBLIC_URL=https://ronne.example.com \
RONNE_ROOT_EMAIL=you@example.com RONNE_ROOT_NAME="Your Name" RONNE_ROOT_PASSWORD='…' \
pnpm run setup --yes
```

In Docker: `docker compose exec -T web pnpm run setup --yes`, with the variables passed as
`-e NAME=value`. It exits with `0` when done, `1` when a check fails, and `2` when a value is
missing or invalid; `--database-url`, `--public-url`, `--storage-path`, `--root-email` and
`--root-name` work as flags too. Running it again is safe: it keeps the settings and never creates
a second root. To start over on a development clone, `pnpm run reset-setup`.

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
| `pnpm run reset-setup` | Development only: removes this clone's settings file, SQLite database and storage, so the setup can be run again |
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
