# Ronne AI Marketplace

An open-source, self-hosted, curated registry of AI capabilities: skills, agents, rules, commands,
hooks, MCP servers and more. A team installs it on its own infrastructure, proposes items, reviews
and releases them, and installs them into AI coding tools such as Claude Code, Codex, Cursor, GitHub Copilot, Antigravity and Gemini CLI with
the `rmk` CLI or from inside those tools through an MCP server.

> **Status:** in active development, released as 0.x versions. What's done and what's next is in
> the [features index](docs/features/README.md), and the design in [`docs/MVP/MVP.md`](docs/MVP/MVP.md).

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
and SQLite needs no server.

**The install script** checks Docker, asks whether Ronne runs on this computer or on a server with
a domain, writes `~/ronne-marketplace` (`compose.yaml` and `.env`), starts Ronne and opens it in
the browser:

```sh
curl -fsSL https://www.ronne.ai/marketplace/install.sh | sh
```

That address redirects to the script in the
[latest release](https://github.com/ronneai/ronne-marketplace/releases/latest), which also works
directly (`…/releases/latest/download/install.sh`). It installs the release it comes from, and
never uses `sudo`. On this computer, Ronne answers only on this computer (`127.0.0.1`); to reach it
from other devices, after the setup set `RONNE_PORT=0.0.0.0:7650` and
`PUBLIC_URL=http://<this computer's address>:7650` in its `.env` (the script keeps both), then run
`docker compose up -d` in that folder. Run it again to upgrade: it keeps
your answers and asks before moving to a newer version. For scripts:
`curl -fsSL https://www.ronne.ai/marketplace/install.sh | sh -s -- --yes --mode server --domain ronne.example.com`.
To read it first, download `install.sh` and `checksums.txt` from the release, check them with
`shasum -a 256 -c checksums.txt --ignore-missing`, then run `sh install.sh`.

**By hand**, with only [`compose.yaml`](compose.yaml):

```sh
mkdir ronne && cd ronne
curl -fsSLO https://raw.githubusercontent.com/ronneai/ronne-marketplace/main/compose.yaml
docker compose up -d                          # pulls the image and starts Ronne
```

Then open http://localhost:7650 and follow the setup. It asks for the setup code the server made at
its start, which only you can see: `docker compose logs web | grep setup_code`, or
`docker compose exec web pnpm run setup-code`.

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
  and put `cert.pem` (full chain) and `key.pem` in `./certs` next to `compose.yaml`. Create the
  folder before the first `docker compose up`: on Linux, Docker creates a missing one owned by
  root, and then you need `sudo` to write to it. After
  replacing them, `docker compose up -d --force-recreate proxy`. `RONNE_TLS=internal` issues a
  test certificate from Caddy's own CA instead (browsers warn; `rmk` needs `NODE_EXTRA_CA_CERTS`).
- **Behind a proxy you already run** (nginx, Apache, Traefik, a load balancer that does TLS):
  leave `RONNE_DOMAIN` empty and point your proxy at `http://127.0.0.1:7650`, with:

  ```sh
  RONNE_PORT=127.0.0.1:7650              # not reachable from outside
  PUBLIC_URL=https://ronne.example.com
  RONNE_TRUSTED_PROXIES=10.0.0.5         # your web server's address: take the client's address from its X-Forwarded-For
  ```

  Name your web server's address, not `private_ranges`, once you add the security scanner: every
  private range includes the scanners' addresses too, and a scanner could set the client's address.

  Your proxy must append to `X-Forwarded-For` (nginx: `$proxy_add_x_forwarded_for`) and allow
  request bodies of at least 28 MB (nginx: `client_max_body_size 28m;`), for drafts sent with a
  token. Keep the port on 127.0.0.1, so that
  nothing reaches Ronne except through your proxy.
- **Certificates** live in the `caddy-data` volume. `docker compose down -v` deletes them, and
  Let's Encrypt limits how often a domain can ask for new ones.

| Setting | Default | Meaning |
|---|---|---|
| `RONNE_PORT` | `7650` | Host port (or `address:port`) for HTTP |
| `RONNE_HTTPS_PORT` | `7651` | Host port (or `address:port`) for HTTPS, TCP and UDP |
| `RONNE_DOMAIN` | empty | The name to serve over HTTPS. Empty: HTTP only |
| `RONNE_TLS` | `auto` | With a domain: `auto` (Let's Encrypt), `files` (`./certs`), `internal` (Caddy's CA) |
| `RONNE_ACME_EMAIL` | empty | Email for the certificate authority |
| `RONNE_TRUSTED_PROXIES` | empty | Who may set `X-Forwarded-For` (Caddy's `trusted_proxies static`): your web server's address, not `private_ranges` with the scanner |
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

### As a Linux package (apt or dnf), no Docker or Node.js

Each release has a `.deb` and an `.rpm` for amd64 and arm64, with Node.js inside. Installing one
makes Ronne a service, started at boot and restarted if it stops. On Debian 12, Ubuntu 22.04,
Fedora, RHEL 9 and newer (glibc 2.34 or later), download it from the
[latest release](https://github.com/ronneai/ronne-marketplace/releases/latest), then:

```sh
sudo apt install ./rmk-server_X.Y.Z-1_amd64.deb     # or _arm64.deb
sudo dnf install ./rmk-server-X.Y.Z-1.x86_64.rpm    # or .aarch64.rpm
```

Then open http://localhost:7650 and finish the setup. The install script does all this when Docker
isn't installed: it offers the package, checks it against the release's `checksums.txt`, and asks
before running `sudo`.

- **Where:** the program in `/opt/rmk-server` (`/usr/bin/rmk-server`), the data in
  `/var/lib/rmk-server`, the settings in `/etc/rmk-server/env`, the log in `journalctl -u rmk-server`.
  It runs as the `rmk-server` account. The commands are those of *As a service* below
  (`rmk-server service status`, `sudo rmk-server service restart`, `--domain` for HTTPS…).
- **Upgrading:** install the new package the same way; the service restarts on it with the same
  options, and migrations run on start.
- **Removing:** `sudo apt remove rmk-server` (or `dnf remove`) stops and removes the service and
  keeps the data; `apt purge` and `dnf remove` print the command that deletes it.
- **Without systemd** (a container): the package installs, and says how to start Ronne by hand.

### With Node.js, no clone

With Node.js 22.14 or later, one command downloads and starts Ronne, with no clone, no Docker and
no build:

```sh
npx @ronneai/marketplace                 # then open http://localhost:7650 and follow the setup
npm install --global @ronneai/marketplace && rmk-server     # or keep it installed
```

The command is `rmk-server`: `rmk-server [start] [--port N] [--host H] [--no-open]`, `rmk-server
setup` (the setup in the terminal, with `--yes` for scripts), `rmk-server migrate` and
`rmk-server reset-root-password`. On a terminal, the first start opens the browser.

- **Network:** it listens on `127.0.0.1:7650`, this machine only. `--host 0.0.0.0` (or `HOST`)
  makes it reachable from the network; `--port` (or `PORT`) changes the port. If the port is busy, it
  says so rather than picking another, since the address is saved in the settings and in `rmk login`.
- **Data** (settings, the SQLite database, stored items) lives in `RONNE_DATA_DIR`, or by default
  in `~/Library/Application Support/RonneAI Marketplace` (macOS), `$XDG_DATA_HOME/rmk-server` or
  `~/.local/share/rmk-server` (Linux).
- **Moving from a clone:** copy `apps/web/.env` and what's in `apps/web/data/` (the SQLite file and
  `storage/`) into the data folder. Then, in the copied `.env`, change `DATABASE_URL` and
  `STORAGE_PATH` to their new absolute paths (a clone's are relative to `apps/web`), and
  `PUBLIC_URL` to the new address, such as `http://localhost:7650`.
- **Upgrading:** `npx @ronneai/marketplace@latest`, or `npm install --global @ronneai/marketplace`.
  Migrations run on start.
- **Native modules:** `better-sqlite3` ships prebuilt binaries for macOS, Linux (glibc 2.34 or later,
  so Debian 12, Ubuntu 22.04, RHEL 9 and newer, and musl), on x64 and arm64, and has no
  fallback that compiles it. On another system, or an older glibc, SQLite won't load: use Docker.

#### As a service (macOS and Linux)

To keep it running in the background, started at boot and restarted if it stops (systemd on Linux,
launchd on macOS), with a Node.js installed for the whole machine (the service's
own account can't read one in your home folder, such as nvm's):

```sh
sudo rmk-server service install          # then open http://localhost:7650 and finish the setup
rmk-server service status                # running?, version, address, folders (no sudo)
sudo rmk-server service stop | start | restart | logs
sudo rmk-server service uninstall        # the data stays; --delete-data deletes it too
```

- **Where:** Linux: data `/var/lib/rmk-server`, settings `/etc/rmk-server/env`, log `journalctl -u
  rmk-server`, account `rmk-server`. macOS: data `/usr/local/var/rmk-server` (Homebrew:
  `/opt/homebrew/var/rmk-server`), settings `…/etc/rmk-server/env`, log
  `/Library/Logs/rmk-server/server.log`, account `_rmkserver`, or you with `--user`.
- **Options:** `--port`, `--host` (as above); running install again updates the service and keeps
  the data. `sudo rmk-server setup`, `migrate` and `reset-root-password` work on the service's data.
- **A domain with HTTPS:** `--domain ronne.example.com` (with `--tls auto|internal|files` and
  `--email`) adds `rmk-server-proxy`, Caddy on ports 80 and 443, with the same Caddyfile as Docker.
  It needs Caddy 2.7 or later on PATH: [Caddy's own repository](https://caddyserver.com/docs/install)
  on Debian and Ubuntu (their package is 2.6), `brew install caddy` on macOS. `--tls files` reads
  copies of `cert.pem` and `key.pem` in `/etc/rmk-server-proxy/certs` (macOS: `…/etc/rmk-server-proxy/certs`
  in the same prefix).
- **Upgrading:** `npm install --global @ronneai/marketplace@latest`, then `sudo rmk-server service
  restart`. A Node.js moved or removed since the install needs `sudo rmk-server service install`
  again (`status` says so).
- **Windows:** `npx @ronneai/marketplace` runs the server in a terminal, with no service
  (best-effort; data in `%LOCALAPPDATA%\RonneAI\Marketplace`; #222). To run it at boot, use WSL 2
  or a Linux virtual machine, with the Linux steps there. `rmk` and `rmk-mcp` run on Windows itself
  (feature 121).
- **No systemd** (a container, WSL 1, another init system): run `rmk-server start --no-open` under
  your own supervisor, or use Docker.

### From source

For developers working on Ronne itself. You need Node.js and pnpm (see
[CONTRIBUTING.md](CONTRIBUTING.md#set-up)).

```sh
git clone https://github.com/ronneai/ronne-marketplace.git
cd ronne-marketplace
pnpm install
pnpm build && pnpm start          # or `pnpm dev` while developing
```

Then open http://localhost:3000 and follow the setup. It writes `apps/web/.env` (readable only by
you) and, with SQLite, the database under `apps/web/data/`. It asks for the setup code the server
printed when it started (the `server.setup_code` line); `pnpm run setup-code` prints it again. A
forgotten root password is reset with `pnpm run reset-root-password`.

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
lockfile so a team gets the same files. Claude Code, Codex, Cursor, GitHub Copilot, Antigravity and
Gemini CLI are supported. `rmk export` goes the other way: it sends a skill, agent, command, rule or
MCP server you wrote for any of them to the registry as a private draft, after showing you everything it would upload (and never an MCP
server's credentials).

The registry MCP server, `rmk-mcp` (`packages/mcp`), does the same from inside those tools: the
assistant searches, shows a plan of what an install would change, and applies it once you've seen
it. It can export an item you wrote the same way: it asks which scope, shows every file it would
upload, and creates the draft once you've approved. `rmk mcp-setup` adds it to each tool's MCP
settings.

Both are on npm, and need Node.js 22.14 or later:

```sh
npm install --global @ronneai/rmk @ronneai/mcp
rmk login --registry https://your-ronne-instance.example
rmk login --web                    # or approve it in the browser: company sign-in, two-factor
rmk install @scope/name
rmk export my-skill --to @scope    # a skill from .claude/skills/, as a draft
rmk mcp-setup                      # registers rmk-mcp with the AI tools this project uses
```

The package is [`@ronneai/rmk`](https://www.npmjs.com/package/@ronneai/rmk) because the unscoped
`rmk` name is taken on npm; the command is still `rmk`. The server is
[`@ronneai/mcp`](https://www.npmjs.com/package/@ronneai/mcp), and both build on
[`@ronneai/core`](https://www.npmjs.com/package/@ronneai/core). The Documentation
([Installing with rmk](https://www.ronne.ai/marketplace/docs/rmk),
[Exporting your own items](https://www.ronne.ai/marketplace/docs/export) and
[Registry MCP server](https://www.ronne.ai/marketplace/docs/mcp)) explains the commands and the
files they write.

If you built them from a clone before and linked them, run `npm unlink --global @ronneai/rmk
@ronneai/mcp` first, so the npm install is what `rmk` runs. Contributors can still run the local
build: after `pnpm build`, `pnpm exec rmk` (or `node packages/cli/dist/bin.js`), and
`rmk mcp-setup --command "node /path/to/packages/mcp/dist/bin.js"` for the server. Releasing a new
version follows the [release runbook](docs/runbooks/release.md).

## Contributing

Contributions are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) has everything you need: setting up,
the project's rules, the tests, every command, and how a pull request gets in. Taking part means
following the [code of conduct](CODE_OF_CONDUCT.md), and a security problem is reported privately
([SECURITY.md](SECURITY.md)).

## License

[MIT](LICENSE)
