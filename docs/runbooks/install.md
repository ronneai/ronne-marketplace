# Installing Ronne AI Marketplace

> **Draft for the website** (2026-10-03). This guide describes the install experience planned in
> milestone M12 (features [080](../features/080-docker-https/SPEC.md)–087). Each section names the
> feature it needs; publish a section only once that feature is released, and recheck the commands
> then. Built so far: Docker (080, 081), npm and its service (082, 083), the bundles (084), the
> `.deb` and `.rpm` (085). On hold: the Homebrew tap. Withdrawn by
> [121](../features/121-no-windows-server/SPEC.md): the Windows service (086), the Windows installer
> and winget (087), and `install.ps1`. Since [#222](../issues/222-windows-foreground/SPEC.md),
> `rmk-server` runs on Windows again, in a terminal only.

Ronne AI Marketplace installs in one command on macOS and Linux, with Docker or without it, on your
own machine or on a server with your domain and HTTPS. On Windows, it runs in a terminal with
`npx`, or as a server in WSL 2 or a Linux virtual machine ([below](#windows)).

## Choose your way to install

Most people should use the install script: it checks your machine, asks two questions and starts
Ronne.

| You want | You have | Use | Ronne opens at |
| --- | --- | --- | --- |
| Ronne on your own computer, for your projects | Docker | The install script (Docker) | `http://localhost:7650` |
| Ronne on your own computer | No Docker | apt/dnf, as a service (Homebrew on hold) | `http://localhost:7650` |
| Ronne for a team, on a server with a domain | Docker | The install script, answering "server" | `https://your-domain` |
| Ronne for a team, no Docker | Linux server | The `.deb`/`.rpm` package, as a service | `https://your-domain` |
| To try it once, without installing a service | Node.js 22.12+ | `npx @ronneai/marketplace` | `http://localhost:7650` |

Every way keeps your data (the database, stored items and settings) in one folder or volume, and
runs database upgrades by itself when you upgrade Ronne. Ronne's commands are `rmk` (installing
items into your projects) and `rmk-server` (running the marketplace).

## Quick start with Docker

One command installs and starts Ronne, then opens it in your browser (features 080 and 081).

**Before you start:** install Docker. On macOS that's
[Docker Desktop](https://www.docker.com/products/docker-desktop/), free for personal use and small
companies; larger companies need a Docker subscription, or can use a free alternative such as
[Rancher Desktop](https://rancherdesktop.io/) or [Podman Desktop](https://podman-desktop.io/). On
Linux, install Docker Engine from your distribution or
[docs.docker.com](https://docs.docker.com/engine/install/).

**macOS and Linux**, in Terminal:

```sh
curl -fsSL https://www.ronne.ai/marketplace/install.sh | sh
```

The address redirects to the script in the
[latest release](https://github.com/ronneai/ronne-marketplace/releases/latest) on GitHub, which
also works directly.

The script:

1. Checks that Docker and Docker Compose are installed and running, and tells you how to fix it if not.
2. Asks where Ronne runs: **this computer** or **a server with a domain**.
3. For a server, asks for the domain and an optional email for certificate notices.
4. Creates a `ronne-marketplace` folder in your home folder with `compose.yaml` and its settings (`.env`).
   On **this computer**, Ronne answers only on this computer (`127.0.0.1`), not to your network. To
   reach it from another device, put `RONNE_PORT=0.0.0.0:7650` and
   `PUBLIC_URL=http://<this computer's address>:7650` in `.env` (the script keeps both) and run
   `docker compose up -d` in that folder; do it after the setup, which is open to anyone who can
   reach it until then. HTTPS on 7651 stays on this computer.
5. Starts Ronne, waits until it answers, and opens it in your browser.

Then follow the setup in the browser: choose the database (SQLite needs nothing else), and create
the root account. Open the address right away: until setup is done, anyone who can reach it can
set it up.

Prefer to read a script before running it? Download it and `checksums.txt` from the
[latest release](https://github.com/ronneai/ronne-marketplace/releases/latest), check it
(`shasum -a 256 -c checksums.txt --ignore-missing`), read it, then run `sh install.sh`. Run the
script again to upgrade: it keeps your answers and asks before moving to the newer version.

## Your own domain with HTTPS

Give Ronne a domain and it gets and renews its own HTTPS certificate from Let's Encrypt
(feature 080). A small proxy, Caddy, runs next to Ronne and handles it.

**Do these three things first:**

1. **DNS:** at your domain registrar, add an `A` record (and `AAAA` for IPv6) for
   `ronne.example.com` pointing at your server's public IP address.
2. **Firewall:** open ports **80** and **443** (TCP, and UDP 443 for HTTP/3) to the internet.
   Let's Encrypt checks your domain on them.
3. **Nothing else on 80 and 443:** if the server already runs a web server such as nginx or
   Apache, see *Behind your own web server* below.

Then run the install script and answer **a server with a domain**. To set it up by hand instead,
put this `.env` next to `compose.yaml` and run `docker compose up -d`:

```sh
RONNE_DOMAIN=ronne.example.com
RONNE_PORT=80
RONNE_HTTPS_PORT=443
RONNE_ACME_EMAIL=ops@example.com   # optional
```

Open `https://ronne.example.com`. The first visit takes a few seconds while the certificate is
issued.

**Ports.** Without a domain, Ronne uses ports 7650 (HTTP) and 7651 (HTTPS), chosen because nothing
common uses them. With a domain, use 80 and 443: certificates need them, and people type the
address without a port.

| Setting | Default | What it does |
| --- | --- | --- |
| `RONNE_DOMAIN` | empty | Your domain. Empty means HTTP only |
| `RONNE_PORT` | `7650` | The HTTP port on your machine |
| `RONNE_HTTPS_PORT` | `7651` | The HTTPS port on your machine |
| `RONNE_TLS` | `auto` | `auto` (Let's Encrypt), `files` (your own certificate), `internal` (a test certificate) |
| `RONNE_ACME_EMAIL` | empty | Where the certificate authority sends expiry notices |
| `RONNE_TRUSTED_PROXIES` | empty | Only behind your own web server: who may tell Ronne the client's address (your web server's address, such as `10.0.0.5`; not `private_ranges` with the scanner, which includes the scanners) |
| `COMPOSE_PROFILES` | empty | `scanner`, and `scanner-semantic` for semantic analysis: the security scan's containers (install.sh sets them; keep any database profile in the list) |
| `RONNE_SKILL_SCANNER_URL`, `RONNE_SKILL_SCANNER_SEMANTIC_URL` | empty | The scanner containers' addresses, `http://proxy:8081` and `http://proxy:8082` (install.sh sets them) |
| `RONNE_SCAN_KEY` | empty | 64 hex characters the proxy requires on those two ports (install.sh makes one; `openssl rand -hex 32`) |
| `RONNE_SCANNER_REF` | `main` | The tag the scanner is built from, and its image tag (install.sh sets the version); `RONNE_SCANNER_REPO` is where it's fetched from |
| `LOG_LEVEL` | `info` | The least serious log lines written: `debug`, `info`, `warn` or `error` |
| `LOG_FORMAT` | `json` | `json`, or `text` for a person reading a terminal |
| `RONNE_JOBS` | `on` | `off` stops the server's own retention purge (every six hours); run `rmk-server purge` from cron then ([Privacy](https://www.ronne.ai/marketplace/docs/privacy#retention)) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | empty | Your OpenTelemetry collector's OTLP/HTTP address: metrics and traces, off while empty ([Monitoring](https://www.ronne.ai/marketplace/docs/monitoring#monitoring)) |

**Your company's certificate** (a private network, or a certificate from your IT team): set
`RONNE_TLS=files` and put `cert.pem` (with the full chain) and `key.pem` in a `certs` folder next
to `compose.yaml`. Create the folder before the first `docker compose up`: on Linux, Docker
creates a missing one owned by root, and then you need `sudo` to write to it. When you replace them, run `docker compose up -d --force-recreate proxy`.

**Behind your own web server** (nginx, Apache, Traefik or a load balancer that already handles
HTTPS): leave `RONNE_DOMAIN` empty, set `RONNE_PORT=127.0.0.1:7650`,
`PUBLIC_URL=https://ronne.example.com` and `RONNE_TRUSTED_PROXIES` to your web server's address
(such as `10.0.0.5`), and point your web server at `http://127.0.0.1:7650`. Name it rather than
`private_ranges` if you add the security scanner below: every private range includes the scanners'
addresses too, and a scanner could then set the client's address. It must add the client's address to `X-Forwarded-For`
(nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`) and allow request bodies
of at least 28 MB (nginx: `client_max_body_size 28m;`).

**Keep the certificates:** they live in the `caddy-data` volume. Never run
`docker compose down -v`, which deletes it along with your data; Let's Encrypt limits how often a
domain can ask for new ones.

## Without Docker: try it with Node.js

With Node.js 22.12 or later installed, one command downloads and starts Ronne, with nothing to
clone (feature 082):

```sh
npx @ronneai/marketplace
```

On the first start it opens `http://localhost:7650` in your browser, and it runs until you close
the terminal. To keep it
installed and start it later with `rmk-server`:

```sh
npm install --global @ronneai/marketplace
rmk-server
```

Your data stays in one folder, kept when you upgrade:

| System | Data folder |
| --- | --- |
| macOS | `~/Library/Application Support/RonneAI Marketplace` |
| Linux | `~/.local/share/rmk-server` |

On Linux, `XDG_DATA_HOME` moves it (to `$XDG_DATA_HOME/rmk-server`). Set `RONNE_DATA_DIR` to use
another folder, and `--port` (or `PORT`) for another port. It listens on `127.0.0.1`, this machine
only; `--host 0.0.0.0` (or `HOST`) makes it reachable from the network. To keep
Ronne running in the background and starting with your computer, install it as a service (next
section).

## Install as a service

As a service, Ronne runs in the background, starts with your computer or server, and restarts if
it stops. The packages below include everything Ronne needs, Node.js too (features 083–085).

**macOS and Linux with Homebrew** *(on hold: the tap isn't published yet, feature 085)*:

```sh
brew install ronneai/tap/rmk-server
brew services start rmk-server
```

**Debian 12, Ubuntu 22.04 and newer:** download the `.deb` for your processor (amd64 or arm64)
from the [latest release](https://github.com/ronneai/ronne-marketplace/releases/latest), then:

```sh
sudo apt install ./rmk-server_*.deb      # starts the service
```

**Fedora, RHEL 9 and newer:** `sudo dnf install ./rmk-server-*.rpm`.

The install script does this by itself when Docker isn't installed: it offers the package, checks
it against the release's `checksums.txt`, and asks before running `sudo` (feature 085). Removing the
package (`apt remove`, `dnf remove`) keeps the data; the packages need glibc 2.34 or later.

**Installed with npm instead?** Register the service yourself (feature 083):

```sh
sudo rmk-server service install      # then open http://localhost:7650 and finish the setup
```

The service runs under its own account (`rmk-server` on Linux, `_rmkserver` on macOS), which
can't read a Node.js installed in your home folder (nvm, for example): install Node.js for the
whole machine first. On macOS, `--user` runs
it as you instead. If `sudo rmk-server` isn't found, keep your PATH:
`sudo env "PATH=$PATH" rmk-server service install`. macOS may show a notification about
a new background item: that's the service.

**With a domain and HTTPS**, without Docker: install Caddy 2.7 or later
([Caddy's own repository](https://caddyserver.com/docs/install) on Debian and Ubuntu, whose own
`caddy` package is too old; `brew install caddy` on macOS), stop the `caddy` service its package
may have started (`sudo systemctl disable --now caddy`), then:

```sh
sudo rmk-server service install --domain ronne.example.com
```

The same DNS and firewall steps as in *Your own domain with HTTPS* apply. `--tls internal` uses
Caddy's own authority instead of Let's Encrypt, and `--tls files` reads copies of your `cert.pem`
and `key.pem` in `/etc/rmk-server-proxy/certs` on Linux, or the prefix's
`etc/rmk-server-proxy/certs` on macOS (copy them again and restart after each renewal).

**Managing the service:**

| To | Run |
| --- | --- |
| See whether it runs, its version, address and data folder | `rmk-server service status` |
| Stop, start or restart | `sudo rmk-server service stop` / `start` / `restart` |
| Read its logs | `sudo rmk-server service logs` |
| Set it up, migrate or reset root's password in the terminal | `sudo rmk-server setup` / `migrate` / `reset-root-password` |
| Remove the service (your data stays) | `sudo rmk-server service uninstall` |
| Remove it and delete the data | `sudo rmk-server service uninstall --delete-data` |

Every command but `status` needs `sudo`. (With the Homebrew tap, on hold, `brew services` would
do this.)

Where things are, for a service installed with npm:

| | Linux | macOS |
| --- | --- | --- |
| Data | `/var/lib/rmk-server` | `/usr/local/var/rmk-server` (Homebrew: `/opt/homebrew/var/rmk-server`) |
| Settings | `/etc/rmk-server/env` | the same prefix's `etc/rmk-server/env` |
| Logs | `journalctl -u rmk-server` | `/Library/Logs/rmk-server/server.log` |

## Windows

On Windows, Ronne runs two ways.

**In a terminal, on Windows itself** (best-effort; [#222](../issues/222-windows-foreground/SPEC.md)).
With Node.js 22.12 or later, in PowerShell:

```powershell
npx @ronneai/marketplace
```

It runs while the terminal is open, with no service: nothing starts it at boot, and `rmk-server
service` refuses on Windows. The data lives in `%LOCALAPPDATA%\RonneAI\Marketplace` (or
`RONNE_DATA_DIR`), where 0.3.x kept it, so an instance started with `npx` on 0.3.x upgrades in
place. `npx @ronneai/marketplace reset-root-password` and the other commands run on the same data.
It's checked in CI, but not a production setup. A Windows service from 0.3.x is removed with
`npx @ronneai/marketplace@0.3.2 service uninstall`, in a terminal opened as administrator.

**As a server, in WSL 2 or a Linux virtual machine**, following the Linux steps there:

```powershell
wsl --install          # in PowerShell as administrator: WSL 2 with Ubuntu; restart when it asks
wsl --install -d Ubuntu   # when WSL is there with no Linux distribution (wsl -l -v lists none)
```

Then, in the Ubuntu terminal, use the install script (with Docker Desktop's WSL integration on, or
Docker Engine installed in Ubuntu), the `.deb` package, or npm with `sudo rmk-server service
install`. The service needs systemd: if `systemctl` says it isn't running, add `systemd=true`
under `[boot]` in `/etc/wsl.conf` and run `wsl --shutdown` in PowerShell. Windows reaches a server
in WSL at `http://localhost:7650`.

`rmk` and the MCP server run on Windows itself, where your AI tools are:
`npm install --global @ronneai/rmk @ronneai/mcp` in PowerShell.

## After installing

**Set it up in the browser.** The first visit opens the setup: choose the database (SQLite,
MySQL/MariaDB or PostgreSQL), confirm the public address, and create the root account. No restart
is needed afterwards.

**Connect your projects.** On each computer that uses the marketplace, install the `rmk` command and
sign in with an access token made in Ronne (the sidebar's CLI & tokens page):

```sh
npm install --global @ronneai/rmk
rmk login --registry http://localhost:7650     # or https://ronne.example.com
```

Then, in any project folder, `rmk install` adds items for Claude Code, Codex or Cursor. Ronne
doesn't need a copy of your projects or their git repositories.

**Upgrade:**

| Installed with | Upgrade with |
| --- | --- |
| The install script (Docker) | Run the install script again, or `docker compose pull && docker compose up -d` in the `ronne-marketplace` folder |
| apt, dnf (the packages) | Install the new `.deb` or `.rpm` the same way; the service restarts on it |
| apt, dnf | Install the new `.deb` or `.rpm` the same way |
| npm | `npm install --global @ronneai/marketplace@latest`, then `rmk-server service restart` |

Database changes are applied on start. Going back to an older version after an upgrade isn't
supported, so back up first.

**Back up** with one command, while Ronne runs: `docker compose exec web pnpm run backup` with
Docker, `sudo rmk-server backup` with a service, `rmk-server backup` otherwise. It writes one archive
with the database (whichever kind), the stored files and the settings file.
[`backup.md`](backup.md) says how to schedule it, copy it off the machine and restore it.

**Personal data** is kept only as long as root's retention says (Admin › Settings › Privacy):
the server purges what's older every six hours on its own. `docker compose exec web pnpm run purge
--dry-run`, `sudo rmk-server purge --dry-run` or `rmk-server purge --dry-run` shows what a run
would clear; without `--dry-run` it runs one now.

**Scan submissions with SkillSpector (optional).** Ronne can have NVIDIA's SkillSpector check each
submission for hidden instructions, credential access, exfiltration and obfuscated code, and show
its findings to reviewers. Ronne doesn't ship it.

*With Docker*, `install.sh` asks "Add the security scanner?" (or takes `--scanner yes`, or
`--scanner semantic` for semantic analysis too), and an existing install gets the question when you
run the install command again. Compose then builds the scanner on your server from Ronne's
repository at your version, with SkillSpector at the pinned commit: a few minutes and about 500 MB
the first time, with access to GitHub and PyPI. The scanner is a container of its own with no way
out, and Ronne reaches it through the proxy with a scan key (`RONNE_SCAN_KEY`, made for you); a
second container does the semantic scans, with the internet for the provider and nothing of Ronne's.
Upgrading builds the new version's scanner; the old image stays until you remove it
(`docker image rm ronne-skillspector:v<old version>`).

*Without Docker*, install it at the pinned version and name its command in `RONNE_SKILL_SCANNER` (or
list several in `RONNE_SKILL_SCANNERS` for root to choose from), restart Ronne, or run the same
container with `docker compose -f scripts/skill-scanner/scanner.compose.yaml up -d --build` and set
`RONNE_SKILL_SCANNER_URL=http://127.0.0.1:7670`; an address wins over a command.

Then turn it on in Admin › Settings › Security scan, where root can also set up an
LLM provider and its key for semantic analysis. An endpoint on a private address, or over
`http://` (a local Ollama), needs its host in `RONNE_SKILL_SCANNER_HTTP_HOSTS`, bare names or
addresses separated by commas.
[`skill-scanner.md`](../knowledge/skill-scanner.md) has the install, the container wrapper, the scan
service and the rules it follows. NVIDIA's own pages:
[Scanning agent skills](https://docs.nvidia.com/skills/scanning-agent-skills) (what it checks, how to
run it) and [NVIDIA/SkillSpector](https://github.com/NVIDIA/SkillSpector) (the source, its releases
and licence).

**Uninstall:** `docker compose down` in the `ronne-marketplace` folder (add `-v` only to delete all
data), or `sudo apt remove rmk-server` or `sudo dnf remove rmk-server` (the data stays). Your data
folder is kept unless you delete it.

## Troubleshooting

| You see | What to do |
| --- | --- |
| "Port is already allocated" or "address already in use" | Another program uses the port. Choose another: `RONNE_PORT=7660` in `.env` (Docker) or `rmk-server service install --port 7660`. For ports 80/443, see *Behind your own web server* |
| "Cannot connect to the Docker daemon" | Start Docker Desktop (macOS), or `sudo systemctl start docker` (Linux) |
| The domain doesn't open, or the browser warns about the certificate | Check that the domain's DNS points at this server (`nslookup ronne.example.com`), that ports 80 and 443 are open, and read the proxy's log: `docker compose logs proxy` |
| "Permission denied" on the data folder | Docker: `docker compose run --rm --user root web chown -R 1000:1000 /app/data`. Service: run `sudo rmk-server service install` again, which fixes the owner |
| Forgot the root password | `docker compose exec web pnpm run reset-root-password`, or `sudo rmk-server reset-root-password` |
| "service isn't available on Windows" | On Windows, `rmk-server` runs in a terminal only. To start it at boot, run it in WSL 2 or a Linux VM: [Windows](#windows) |
| `EBADPLATFORM` on Windows | `@ronneai/marketplace` 0.4.0 and 0.5.0 didn't install on Windows; use a later version: [Windows](#windows) |

**Where the logs are:** Docker: `docker compose logs web` (and `proxy`). Service:
`sudo rmk-server service logs`; underneath, `journalctl -u rmk-server` on Linux, and
`/Library/Logs/rmk-server/` on macOS. Ronne's lines are JSON, each with a level and most with an
`event` name (Next.js's own lines are plain text); `LOG_LEVEL=debug` writes more: in the settings
file (Docker: the `.env` next to `compose.yaml`, then `docker compose up -d`), then a restart. A problem someone reports
comes with the `X-Request-Id` of the response they got: its lines carry that `requestId`. What
each line holds, and what it never does: [Logs](https://www.ronne.ai/marketplace/docs/logs#logs).

Still stuck? [Open an issue](https://github.com/ronneai/ronne-marketplace/issues) with the output of
`rmk-server service status` or `docker compose ps` and the last lines of the log.
