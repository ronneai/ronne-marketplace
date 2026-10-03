# Installing Ronne AI Marketplace

> **Draft for the website** (2026-10-03). This guide describes the install experience planned in
> milestone M12 (features [080](../features/080-docker-https/SPEC.md)–087). Today only the Docker
> install with `compose.yaml` on port 3000 works. Each section names the feature it needs; publish a
> section only once that feature is released, and recheck the commands then.

Ronne AI Marketplace installs in one command on macOS, Linux and Windows, with Docker or without it,
on your own machine or on a server with your domain and HTTPS.

## Choose your way to install

Most people should use the install script: it checks your machine, asks two questions and starts
Ronne.

| You want | You have | Use | Ronne opens at |
| --- | --- | --- | --- |
| Ronne on your own computer, for your projects | Docker | The install script (Docker) | `http://localhost:7650` |
| Ronne on your own computer | No Docker | Homebrew, apt/dnf or winget, as a service | `http://localhost:7650` |
| Ronne for a team, on a server with a domain | Docker | The install script, answering "server" | `https://your-domain` |
| Ronne for a team, no Docker | Linux server | The `.deb`/`.rpm` package, as a service | `https://your-domain` |
| To try it once, without installing a service | Node.js 22+ | `npx @ronneai/marketplace` | `http://localhost:7650` |

Every way keeps your data (the database, stored items and settings) in one folder or volume, and
runs database upgrades by itself when you upgrade Ronne. Ronne's commands are `rmk` (installing
items into your projects) and `rmk-server` (running the marketplace).

## Quick start with Docker

One command installs and starts Ronne, then opens it in your browser (features 080 and 081).

**Before you start:** install Docker. On macOS and Windows that's
[Docker Desktop](https://www.docker.com/products/docker-desktop/), free for personal use and small
companies; larger companies need a Docker subscription, or can use a free alternative such as
[Rancher Desktop](https://rancherdesktop.io/) or [Podman Desktop](https://podman-desktop.io/). On
Linux, install Docker Engine from your distribution or
[docs.docker.com](https://docs.docker.com/engine/install/).

**macOS and Linux**, in Terminal:

```sh
curl -fsSL https://github.com/ronneai/ronne-marketplace/releases/latest/download/install.sh | sh
```

**Windows**, in PowerShell:

```powershell
irm https://github.com/ronneai/ronne-marketplace/releases/latest/download/install.ps1 | iex
```

The script:

1. Checks that Docker and Docker Compose are installed and running, and tells you how to fix it if not.
2. Asks where Ronne runs: **this computer** or **a server with a domain**.
3. For a server, asks for the domain and an optional email for certificate notices.
4. Creates a `ronne-marketplace` folder in your home folder with `compose.yaml` and its settings (`.env`).
5. Starts Ronne, waits until it answers, and opens it in your browser.

Then follow the setup in the browser: choose the database (SQLite needs nothing else), and create
the root account. Open the address right away: until setup is done, anyone who can reach it can
set it up.

Prefer to read a script before running it? Download it, read it, then run `sh install.sh`. Each
release publishes the script's SHA-256 checksum next to it.

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
| `RONNE_TRUSTED_PROXIES` | empty | Only behind your own web server: who may tell Ronne the client's address (`private_ranges`) |

**Your company's certificate** (a private network, or a certificate from your IT team): set
`RONNE_TLS=files` and put `cert.pem` (with the full chain) and `key.pem` in a `certs` folder next
to `compose.yaml`. When you replace them, run `docker compose up -d --force-recreate proxy`.

**Behind your own web server** (nginx, Apache, Traefik or a load balancer that already handles
HTTPS): leave `RONNE_DOMAIN` empty, set `RONNE_PORT=127.0.0.1:7650`,
`PUBLIC_URL=https://ronne.example.com` and `RONNE_TRUSTED_PROXIES=private_ranges`, and point your
web server at `http://127.0.0.1:7650`. It must add the client's address to `X-Forwarded-For`
(nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`) and allow request bodies
of at least 28 MB (nginx: `client_max_body_size 28m;`).

**Keep the certificates:** they live in the `caddy-data` volume. Never run
`docker compose down -v`, which deletes it along with your data; Let's Encrypt limits how often a
domain can ask for new ones.

## Without Docker: try it with Node.js

With Node.js 22 or later installed, one command downloads and starts Ronne, with nothing to clone
(feature 082):

```sh
npx @ronneai/marketplace
```

It opens `http://localhost:7650` in your browser and runs until you close the terminal. To keep it
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
| Windows | `%LOCALAPPDATA%\RonneAI\Marketplace` |

Set `RONNE_DATA_DIR` to use another folder, and `--port` (or `PORT`) for another port. To keep
Ronne running in the background and starting with your computer, install it as a service (next
section).

## Install as a service

As a service, Ronne runs in the background, starts with your computer or server, and restarts if
it stops. The packages below include everything Ronne needs, Node.js too (features 083–087).

**macOS and Linux with Homebrew:**

```sh
brew install ronneai/tap/rmk-server
brew services start rmk-server
```

**Debian and Ubuntu:** download the `.deb` for your processor (amd64 or arm64) from the
[latest release](https://github.com/ronneai/ronne-marketplace/releases/latest), then:

```sh
sudo apt install ./rmk-server_*.deb      # starts the service
```

**Fedora, RHEL and openSUSE:** `sudo dnf install ./rmk-server-*.rpm` (or `zypper install`).

**Windows**, in PowerShell:

```powershell
winget install RonneAI.Marketplace
```

**Installed with npm instead?** Register the service yourself: `sudo rmk-server service install`
on macOS and Linux, or `rmk-server service install` in an administrator PowerShell on Windows.

**With a domain and HTTPS**, without Docker: install
[Caddy](https://caddyserver.com/docs/install) (`brew install caddy`, `apt install caddy` or
`winget install CaddyServer.Caddy`), then:

```sh
sudo rmk-server service install --domain ronne.example.com
```

The same DNS and firewall steps as in *Your own domain with HTTPS* apply.

**Managing the service:**

| To | Run |
| --- | --- |
| See whether it runs, its address and data folder | `rmk-server service status` |
| Stop, start or restart | `rmk-server service stop` / `start` / `restart` |
| Read its logs | `rmk-server service logs` |
| Remove the service (your data stays) | `rmk-server service uninstall` |

On macOS and Linux, commands that change the service need `sudo`; on Windows, an administrator
PowerShell. With Homebrew, use `brew services` instead.

## After installing

**Set it up in the browser.** The first visit opens the setup: choose the database (SQLite,
MySQL/MariaDB or PostgreSQL), confirm the public address, and create the root account. No restart
is needed afterwards.

**Connect your projects.** On each computer that uses the marketplace, install the `rmk` command and
sign in with an access token made in Ronne (Account › Access tokens):

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
| Homebrew | `brew upgrade rmk-server` |
| apt, dnf | Install the new `.deb` or `.rpm` the same way |
| winget | `winget upgrade RonneAI.Marketplace` |
| npm | `npm install --global @ronneai/marketplace@latest`, then `rmk-server service restart` |

Database changes are applied on start. Going back to an older version after an upgrade isn't
supported, so back up first.

**Back up** the data: with Docker, the `ronne-marketplace_ronne-data` volume; otherwise the data
folder shown by `rmk-server service status`. With MySQL or PostgreSQL, back up that database too.

**Uninstall:** `docker compose down` in the `ronne-marketplace` folder (add `-v` only to delete all
data), `brew uninstall rmk-server`, `sudo apt remove rmk-server`, or
`winget uninstall RonneAI.Marketplace`. Your data folder is kept unless you delete it.

## Troubleshooting

| You see | What to do |
| --- | --- |
| "Port is already allocated" or "address already in use" | Another program uses the port. Choose another: `RONNE_PORT=7660` in `.env` (Docker) or `rmk-server service install --port 7660`. For ports 80/443, see *Behind your own web server* |
| "Cannot connect to the Docker daemon" | Start Docker Desktop (macOS, Windows), or `sudo systemctl start docker` (Linux) |
| The domain doesn't open, or the browser warns about the certificate | Check that the domain's DNS points at this server (`nslookup ronne.example.com`), that ports 80 and 443 are open, and read the proxy's log: `docker compose logs proxy` |
| "Permission denied" on the data folder | Docker: `docker compose run --rm --user root web chown -R 1000:1000 /app/data`. Service: run `sudo rmk-server service install` again, which fixes the owner |
| Forgot the root password | `docker compose exec web pnpm run reset-root-password`, or `sudo rmk-server reset-root-password` |
| Windows: "running scripts is disabled" | Run the command in PowerShell as shown (`irm … \| iex`), which doesn't save a script file, or allow scripts for this session: `Set-ExecutionPolicy -Scope Process Bypass` |

**Where the logs are:** Docker: `docker compose logs web` (and `proxy`). Service:
`rmk-server service logs`; underneath, `journalctl -u rmk-server` on Linux,
`/Library/Logs/rmk-server/` on macOS, and the `logs` folder inside the data folder on Windows.

Still stuck? [Open an issue](https://github.com/ronneai/ronne-marketplace/issues) with the output of
`rmk-server service status` or `docker compose ps` and the last lines of the log.
