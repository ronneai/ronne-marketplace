# 080 — Docker with a domain and HTTPS

> Milestone: M12 · Depends on: 005, 035, 036 · Design: [MVP §5](../../MVP/MVP.md#5-installation--bootstrap), [§15](../../MVP/MVP.md#15-decision-log) (Docker) · Policy: [`docs/policies/dependencies.md`](../../policies/dependencies.md) §3 · Guide: [`docs/runbooks/install.md`](../../runbooks/install.md)

## Goal

Someone with a server and a domain name gets Ronne on `https://their-domain` with a valid
certificate by writing three lines in a `.env` file next to `compose.yaml`, without installing or
configuring a reverse proxy. Someone only trying it gets it on a port that is unlikely to clash with
anything else on their machine.

## Why

Today `compose.yaml` publishes the app's own port, `3000:3000`. Two problems:

- **3000 is busy.** It's the default of Next.js, Rails, Grafana, Create React App, Gitea and most
  Node.js tutorials, so on a developer's machine `docker compose up` often fails with "port is
  already allocated".
- **HTTPS is left to the user.** The README says "proxy HTTPS to port 3000" and leaves the rest
  (installing nginx or Caddy, getting and renewing a certificate, `X-Forwarded-For`,
  `TRUST_PROXY`, the 28 MB body limit) to them. That's the hardest step of a self-hosted install,
  and Ronne needs HTTPS for anything real: session cookies are `Secure` only on an `https://`
  `PUBLIC_URL`, `rmk login` sends a token, and Claude Code reads a plugin marketplace only over
  HTTPS (077).

## The approach

The owner asked for the container to listen on 80 and 443 inside, with other ports published to
the network. That is what this feature does, with one change to where 80 and 443 live: they are
served by a small **Caddy** container in front of the app, not by the Node.js server itself.

```
  network                     compose project (ronne-marketplace)
  ───────                     ──────────────────────────────────────────────
  host :7650  ───────────▶  proxy (Caddy)  :80  ─┐
  host :7651  ───────────▶                 :443 ─┴─▶  web (Ronne)  :3000
                                                      not published to the host
```

Why Caddy rather than TLS in the Node.js server:

- **Certificates are automatic.** Given a domain, Caddy gets a certificate from Let's Encrypt (or
  ZeroSSL), renews it, redirects HTTP to HTTPS and serves HTTP/2 and HTTP/3. Doing that in Next.js
  would mean an ACME client, a renewal timer and certificate reloading in the app: code Ronne
  would have to own for no gain.
- **The app image doesn't change.** It still runs as UID 1000 on port 3000 (binding 80 or 443
  needs root or a capability, which 005 avoids), so every existing install, custom proxy and
  Kubernetes setup keeps working.
- **It's one process per container.** Bundling Caddy in the app image would need a process
  supervisor, a larger image and two things to scan and upgrade together.
- **Caddy fits the dependency policy:** Apache-2.0, an official Docker Hub image for amd64 and
  arm64, no paid plan.

Alternatives looked at: Traefik (MIT, but configured through labels and more moving parts for a
single site), nginx with certbot (two containers and a renewal cron), and a Caddy that only starts
with a profile (see Open questions).

**The port numbers.** Published on the host by default:

| Host port | Inside | Used for |
|---|---|---|
| **7650** (`RONNE_PORT`) | proxy :80 | HTTP; with a domain, only the certificate challenge and the redirect to HTTPS |
| **7651** (`RONNE_HTTPS_PORT`) | proxy :443 (TCP and UDP) | HTTPS (UDP for HTTP/3) |

7650 and 7651 were chosen because, checked against the IANA registry on 2026-10-03, they sit in
the unassigned range 7649–7662; no common developer tool defaults to them; they aren't on the
ports Chrome and Firefox refuse to open (such as 6000, 6665–6669 or 10080); and they're below the
ephemeral ranges of Linux (32768+) and macOS and Windows (49152+), so the operating system never
hands them to an outgoing connection. 765 is "RMK" on a phone keypad.

With a domain and automatic certificates, the host ports **must** be 80 and 443: Let's Encrypt
checks the domain on port 80 (HTTP-01) or 443 (TLS-ALPN-01), and people type the address without a
port. The `.env` below sets them.

## Scope

**In:**
- A `proxy` service (Caddy) in `compose.yaml`, always started, in front of `web`. Its Caddyfile is
  inline in `compose.yaml` (Compose `configs.content`), so `compose.yaml` stays the only file to
  download.
- `web` no longer published to the host; only `proxy` is.
- New defaults: HTTP on host port 7650, HTTPS on 7651.
- `RONNE_DOMAIN`: set it and Caddy serves that name over HTTPS; `PUBLIC_URL` follows it.
- Four TLS modes (`RONNE_TLS`): none, automatic, own certificate files, Caddy's internal CA.
- `TRUST_PROXY=true` and a single, correct `X-Forwarded-For` set for `web`, since `proxy` is now
  always in front of it.
- The request body limit (28 MB) set in the proxy.
- An example `.env` in the README and the Documentation for each case below.
- CI: the compose stack started in `image.yml`, probed over HTTP and over HTTPS (internal CA).
- The README, the *Installing* Documentation topic, MVP §5 and §15, 005's spec and the dependency
  policy updated.

**Out** (and where it goes instead):
- **TLS inside the Node.js server**, or the app image listening on 80/443: not planned (above).
- **DNS-01 challenges** (a certificate for a host that isn't reachable from the internet, through a
  DNS provider's API): needs a Caddy built with that provider's plugin. Hosts on a private network
  use their own certificate files or the internal CA instead. A feature of its own if asked for.
- **Several domains or a path prefix** (`https://example.com/ronne`): `PUBLIC_URL` and the app
  assume their own host. Not planned.
- **Kubernetes ingress and Helm**: still post-MVP (005).
- **Showing the certificate's state in Admin**: the app can't see Caddy's state; `docker compose
  logs proxy` shows it.

## Behaviour

### The three ways to run it

**1. Trying it on a laptop** (nothing to set):

```sh
curl -fsSLO https://raw.githubusercontent.com/ronneai/ronne-marketplace/main/compose.yaml
docker compose up -d                  # then open http://localhost:7650
```

The proxy serves plain HTTP on 7650. `PUBLIC_URL` defaults to `http://localhost:7650`. Port 7651
is published but answers nothing useful until a TLS mode is set (see Edge cases).

**2. A server with a public domain** (automatic HTTPS): point the domain's DNS `A`/`AAAA` record at
the server, open ports 80 and 443 in its firewall, and create `.env` next to `compose.yaml`:

```sh
RONNE_DOMAIN=ronne.example.com
RONNE_PORT=80
RONNE_HTTPS_PORT=443
# RONNE_ACME_EMAIL=ops@example.com    # optional: expiry notices from the certificate authority
```

`docker compose up -d`, then open `https://ronne.example.com`. Caddy gets the certificate on the
first request (a few seconds), renews it about 30 days before it expires, and redirects
`http://` to `https://`. `PUBLIC_URL` becomes `https://ronne.example.com`.

**3. A private network, or a company certificate**:

```sh
RONNE_DOMAIN=ronne.corp.internal
RONNE_TLS=files          # put cert.pem (full chain) and key.pem in ./certs next to compose.yaml
RONNE_PORT=80
RONNE_HTTPS_PORT=443
```

`RONNE_TLS=internal` instead makes Caddy issue its own certificate from a local CA (for a test
server; browsers warn until that CA is trusted, and `rmk` needs `NODE_EXTRA_CA_CERTS`).

**4. Behind a proxy you already run** (nginx, Apache, Traefik, a load balancer that does TLS):
leave `RONNE_DOMAIN` empty, point your proxy at `http://127.0.0.1:7650`, and set
`PUBLIC_URL=https://ronne.example.com`. Set `RONNE_PORT=127.0.0.1:7650` so the plain port isn't
reachable from outside. The proxy trusts `X-Forwarded-For` from private addresses (below).

### Settings

All are read by `compose.yaml` from the environment or `.env`; none are needed for case 1.

| Variable | Default | Meaning |
|---|---|---|
| `RONNE_PORT` | `7650` | Host port (or `address:port`) for HTTP. Kept from 005 with its meaning ("where I open Ronne") and a new default |
| `RONNE_HTTPS_PORT` | `7651` | Host port (or `address:port`) for HTTPS, TCP and UDP |
| `RONNE_DOMAIN` | empty | The name Caddy serves. Empty: any name, HTTP only |
| `RONNE_TLS` | `auto` | Only with a domain: `auto` (ACME), `files` (`./certs/cert.pem`, `./certs/key.pem`), `internal` (Caddy's CA) |
| `RONNE_ACME_EMAIL` | empty | Optional email given to the certificate authority |
| `RONNE_TRUSTED_PROXIES` | `private_ranges` | Who may set `X-Forwarded-For` in front of the proxy (Caddy's `trusted_proxies static …`) |
| `PUBLIC_URL` | `https://$RONNE_DOMAIN`, or `http://localhost:$RONNE_PORT` | Unchanged meaning; wins over both defaults when set |

### The proxy service

- Image: `caddy` from Docker Hub, the current 2.x release, pinned by tag and digest and kept
  current by Dependabot, like the base image (dependency policy §2).
- Caddyfile, inline in `compose.yaml`, in outline:

  ```
  {
      email {$RONNE_ACME_EMAIL:}
      servers {
          trusted_proxies static {$RONNE_TRUSTED_PROXIES:private_ranges}
      }
  }
  (tls-auto) {}
  (tls-files) { tls /certs/cert.pem /certs/key.pem }
  (tls-internal) { tls internal }

  {$RONNE_SITE} {
      import tls-{$RONNE_TLS:auto}
      request_body { max_size 28MB }
      reverse_proxy web:3000 {
          header_up X-Forwarded-For {client_ip}
      }
  }
  ```

  `RONNE_SITE` is `RONNE_DOMAIN` when set, otherwise `:80`, which turns HTTPS off. The exact
  syntax, including an empty `email`, is checked against Caddy's docs when built.
- `X-Forwarded-For` is replaced by one address, the client's as Caddy sees it after
  `trusted_proxies`. Ronne's rule (the rightmost entry, 005) then gives the real client both
  directly and behind another proxy.
- Volumes `caddy-data` (certificates and the ACME account: losing it means asking for new ones,
  which Let's Encrypt rate-limits) and `caddy-config`. `./certs` is mounted read-only at `/certs`
  only for `RONNE_TLS=files` (see Open questions on how).
- `restart: unless-stopped`; starts after `web` (`depends_on`), and answers 502 until `web` is up.

### The web service

- No `ports:`. Reachable only on the compose network as `web:3000`.
- `TRUST_PROXY=true`, set in `compose.yaml`: `proxy` is always in front and is the only way in.
- `PUBLIC_URL` as in the table. The image, its port and its health check don't change.

### Upgrading an existing install

The image is unchanged, so an old `compose.yaml` keeps working with new images. Someone who
downloads the new `compose.yaml` gets the new port: `http://localhost:3000` becomes
`http://localhost:7650`. The release notes and the README say so, and `RONNE_PORT=3000` keeps the
old address. `PUBLIC_URL` in the settings file (`/app/data/.env`) is still overridden by the
environment, as today.

## Edge cases

- **Ports 80 or 443 already taken on the host** (a web server is installed): `docker compose up`
  fails with "port is already allocated". The docs point to case 4.
- **DNS not pointing at the server yet, or port 80/443 closed:** Caddy can't get a certificate,
  retries with back-off and logs why (`docker compose logs proxy`). Ronne answers on HTTP only for
  the redirect. The docs list the three checks: DNS, firewall, `RONNE_PORT=80`/`RONNE_HTTPS_PORT=443`.
- **A domain with non-standard host ports** (`RONNE_DOMAIN` set, ports left at 7650/7651) and
  `RONNE_TLS=auto`: the challenge can't reach Caddy unless something else forwards 80 and 443. The
  docs say so; `files` and `internal` work on any port, with `PUBLIC_URL=https://domain:7651`.
- **`RONNE_TLS=files` with missing or unreadable files:** Caddy refuses to start and says which
  file; the proxy restarts until it's fixed. The files must be readable by Caddy's user.
- **Renewed own certificates:** replace the files and `docker compose restart proxy`.
- **`RONNE_TLS` set without `RONNE_DOMAIN`:** ignored (HTTP only); the docs say a domain is needed.
- **HTTPS port with no domain:** nothing serves 443, so a request to 7651 is refused or reset.
  Accepted: the port is published so turning HTTPS on is a `.env` change, not a compose edit.
- **Let's Encrypt rate limits** (5 certificates per domain set per week): `caddy-data` is a named
  volume so recreating containers never asks again. `docker compose down -v` deletes it; the docs
  warn.
- **`RONNE_PORT` with an address** (`127.0.0.1:7650`): the `PUBLIC_URL` default would be wrong,
  so the docs pair it with an explicit `PUBLIC_URL`, as case 4 does.
- **Running two instances on one host:** set different `RONNE_PORT`/`RONNE_HTTPS_PORT` and a
  different project name (`-p`), as today.
- **IPv6:** Caddy listens on both; Docker publishes both when the daemon has IPv6 on.

## Documentation

- **README**, *With Docker*: the new address (`http://localhost:7650`); a short *Your own domain
  with HTTPS* section with the three `.env` examples (public domain, own certificates, existing
  proxy); the upgrade note about the port. The *Behind a reverse proxy* paragraph becomes case 4.
- **Documentation › Installing an instance › With Docker** (`content.tsx`, `install.docker`): the
  new address, a paragraph per case with its `.env` example, the ports table (7650/7651 by default,
  80/443 for a public domain), and where certificates live (`caddy-data`; never `down -v`). The
  sentence about nginx's 28 MB body limit stays, for case 4. `topics.ts` gains search keywords:
  HTTPS, TLS, SSL, certificate, domain, Let's Encrypt, port, Caddy.
- **Setup › Public address** helper (`fields.tsx`): when `PUBLIC_URL` comes from the environment,
  it also mentions `RONNE_DOMAIN` ("set by `RONNE_DOMAIN` or `PUBLIC_URL` in the environment").
- No new inline helper in `Help.tsx`: nothing in the signed-in app changes.

## Acceptance criteria

- [ ] `docker compose up -d` with no `.env` serves Ronne at `http://localhost:7650`, and port 3000
      on the host is not used.
- [ ] `web` has no published port; `docker compose ps` shows only `proxy`'s.
- [ ] With `RONNE_DOMAIN=localhost`, `RONNE_TLS=internal`, `curl -k https://localhost:7651/api/health`
      answers through Caddy, and `http://localhost:7650` redirects to HTTPS (CI, `image.yml`).
- [ ] With `RONNE_TLS=files` and a test certificate in `./certs`, Caddy serves that certificate
      (CI or a manual check named in PLAN.md).
- [ ] On a real server with a public domain, `RONNE_DOMAIN` and ports 80/443 give a trusted Let's
      Encrypt certificate and a working sign-in (manual check, recorded in PLAN.md).
- [ ] `PUBLIC_URL` follows `RONNE_DOMAIN`, and an explicit `PUBLIC_URL` wins.
- [ ] The audit log and rate limits see the client's real address directly through Caddy and
      behind a second proxy on a private address, not Caddy's or the proxy's.
- [ ] A 28 MB draft upload with a token works through the proxy; a larger one is refused.
- [ ] `RONNE_PORT=3000` gives the old address.
- [ ] The Caddy image is pinned, covered by Dependabot, and listed in the dependency policy.
- [ ] The README, MVP §5 and §15 (the Docker row), 005's spec and the Documentation and helper
      listed above say what the feature does now.

## Open questions

1. **Caddy always, or only when HTTPS is wanted?** Recommended: always. One `compose.yaml`, the
   same ports whatever the mode, and switching to HTTPS is a `.env` change. The cost is a second
   image (about 50 MB) even for a laptop trial. The alternative, `--profile https`, keeps trials to
   one container but needs the app's port published in one mode and not the other, which Compose
   can only do with a second file (`ports: !reset`).
2. **The default ports 7650/7651.** Proposed above; any unassigned pair works.
3. **Mounting `./certs`.** A bind mount fails when the folder doesn't exist on hosts that don't use
   `files`, unless Docker creates it (it does, owned by root, which is harmless but untidy).
   Options: always mount `./certs` (and let Docker create it), or mount it from a second compose
   file only for `files`. Recommended: always mount, read-only, and say in the docs that it may
   stay empty.
