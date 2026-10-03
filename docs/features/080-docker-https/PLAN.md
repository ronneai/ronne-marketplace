# 080 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Check the vendor facts.** Against Caddy's current docs: the Caddyfile in the spec
  (`{$VAR:default}` in a site address and in `import`, an empty `email`, `trusted_proxies`,
  `{client_ip}`, `request_body`), the current 2.x image tag and digest. Against Compose's docs:
  inline `configs.content` and nested interpolation for the `PUBLIC_URL` default (the minimum
  Compose version both need). Re-check 7650/7651 in the IANA registry.
  *Done when:* the notes below record each answer, and the spec is corrected where one differs.

- [x] **2. The proxy in `compose.yaml`.** The `proxy` service, its inline Caddyfile, the
  `caddy-data` and `caddy-config` volumes and the `./certs` mount; `web` loses `ports:` and gains
  `TRUST_PROXY=true` and the `PUBLIC_URL` default. If Compose can't express the three-way default,
  the app derives it instead (`server/config.ts`: `PUBLIC_URL`, else `https://RONNE_DOMAIN`), with
  unit tests. The comment at the top of `compose.yaml` lists the four cases. `compose.build.yaml`
  still works.
  *Done when:* by hand, case 1 serves `http://localhost:7650`; `RONNE_DOMAIN=localhost
  RONNE_TLS=internal` serves `https://localhost:7651` and redirects HTTP; `RONNE_PORT=3000` gives
  the old address; `--profile postgres` still works.

- [x] **3. Client address and body size through the proxy.** Check that the audit log records the
  client's address directly and behind a second proxy on a private address (a throwaway nginx
  container in front), and that a 28 MB draft with a token passes and a larger one gets 413.
  *Done when:* both are recorded in the notes; if `client-ip.ts` needed a change, it has tests.

- [ ] **4. CI.** In `.github/actions/build-image` (shared by `image.yml` and `release.yml`), after
  the image probe: start the compose stack on the image just built, with `RONNE_DOMAIN=localhost`
  and `RONNE_TLS=internal`; probe `http://127.0.0.1:7650` (redirect) and `https://localhost:7651/api/health`
  (`-k`, expects `503 setup_required`); then once more with a self-signed certificate and
  `RONNE_TLS=files`.
  *Done when:* the workflow passes on a pull request, and fails when the Caddyfile is broken on
  purpose.

- [x] **5. Dependency policy and Dependabot.** Add the Caddy image to the policy (licence, why,
  pinning) and Dependabot's docker-compose ecosystem for `compose.yaml`. Trivy-scan the Caddy image
  in the same CI step as ours.
  *Done when:* Dependabot lists `compose.yaml`, and the scan runs.

- [ ] **6. Documentation.** The README's *With Docker* section and its upgrade note; the
  Documentation's `install.docker` section and `topics.ts` keywords; the setup's Public address
  helper; MVP §5 and the Docker row of §15; 005's spec (port, proxy). As the spec's Documentation
  section lists.
  *Done when:* the docs render tests and the setup field tests pass, and `pnpm test:e2e` passes.

- [ ] **7. A real domain.** On a server with a public name: case 2 end to end (certificate issued,
  sign-in, `rmk login`, Claude Code adding the plugin marketplace), then a container recreate
  without a new certificate being requested.
  *Done when:* the result is in the notes, and the feature's status is `done` in the index.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

### Task 1: vendor facts (2026-10-03)

Checked against the docs and by running `caddy validate` in the image and `docker compose config`
with Docker Compose 5.5.

- **Caddy image:** `caddy:2.11.4@sha256:0c994536bddb66445885237f1a5dcc1916bccea922661c76b4e9fc24061f9b52`
  (multi-arch index; amd64 and arm64 among its platforms). 2.11.6 (2026-10-01) is inside the 3-day
  cooldown and has regressions (an HTTP/2 proxy crash, streams cut after a minute) that 2.11.7
  (2026-10-03) fixes. 2.11.7 is too new. Dependabot moves the pin once the cooldown has passed.
  There is no 2.11.5.
- **Caddy env vars vs Compose interpolation:** Caddy's `{$VAR:default}` works in site addresses and
  `import` (substituted before parsing). But Compose also interpolates `$` in `configs.content`, so
  `{$VAR}` would need escaping as `{$$VAR}`, and Caddy can't express "no domain → ignore
  `RONNE_TLS`". The Caddyfile uses Compose's `${…}` instead (spec updated). 083 writes its own
  Caddyfile with the same directives.
- **Empty `email`:** refused ("wrong argument count … after 'email'"). Written only when set
  (`${RONNE_ACME_EMAIL:+email …}`).
- **`trusted_proxies static private_ranges`, `{client_ip}` in `header_up`, `request_body { max_size
  28MB }`, `tls internal`:** valid in 2.11.4. `tls /certs/cert.pem /certs/key.pem` with no files:
  "open /certs/cert.pem: no such file or directory". An unknown `RONNE_TLS`: "File to import not
  found: tls-bogus".
- **Compose:** `configs.content` needs Docker Compose 2.23.1 or later. The nested default
  `${PUBLIC_URL:-${RONNE_DOMAIN:+https://}${RONNE_DOMAIN:-http://localhost:${RONNE_PORT:-7650}}}`
  gives `http://localhost:7650`, `http://localhost:3000` (with `RONNE_PORT=3000`),
  `https://ex.com` (with a domain), and an explicit `PUBLIC_URL` wins. So the app doesn't have to
  derive `PUBLIC_URL`, and `server/config.ts` is unchanged.
- **Ports:** the IANA registry (CSV, 2026-10-03) still lists 7649–7662 as unassigned.
- **Redirect port:** Caddy's HTTP-to-HTTPS redirect goes to 443, not to the published HTTPS port
  (an edge case in the spec now).

### Task 2: the proxy by hand (2026-10-03)

Run from the checkout with `-f compose.yaml -f compose.build.yaml -p rmk080` on Docker 29.7 and
Compose 5.5:

- **Case 1:** `http://localhost:7650/api/health` answers `503 setup_required` through Caddy;
  `docker compose ps` shows ports only for `proxy` (`web` lists `3000/tcp`, unpublished).
- **`RONNE_DOMAIN=localhost RONNE_TLS=internal`:** `https://localhost:7651/api/health` answers over
  HTTP/2 with a "Caddy Local Authority" certificate; `http://localhost:7650` answers 308 to
  `https://localhost/…` (port 443, the edge case in the spec). `web` gets
  `PUBLIC_URL=https://localhost` and `TRUST_PROXY=true`.
- **`RONNE_TLS=files`:** with a self-signed `localhost` certificate in `./certs`, Caddy serves
  exactly that certificate (same SHA-256 fingerprint). With the files removed, the proxy keeps
  restarting with "open /certs/cert.pem: no such file or directory".
- **`RONNE_PORT=3000`:** `docker compose config` publishes host 3000 to the proxy's 80 and sets
  `PUBLIC_URL=http://localhost:3000`. Not started here, because a dev server already held 3000 on
  this machine, which is the clash the new default avoids.
- **`--profile postgres`:** starts, and `web` reaches `postgres:5432`.
- **Compose doesn't recreate a container when only a config's `content` changes.** A `.env` change
  left the old Caddyfile running. So `proxy` also gets the four settings as environment variables,
  which Caddy ignores. A change to them recreates it.
- `./certs` is created on `up` when it's missing, so it's in `.gitignore` and `.dockerignore`.

### Task 3: client address and body size (2026-10-03)

The instance was set up with `docker compose exec web pnpm run setup --yes`, SQLite, and a token
came from `POST /api/v1/auth/token`, which writes `access_token.created` to the audit log with the
address. Docker Desktop on macOS:

| Setup | Sent `X-Forwarded-For` | Recorded |
|---|---|---|
| Spec's default, `trusted_proxies static private_ranges`, direct | `6.6.6.6` | **`6.6.6.6`** (spoofed) |
| Nobody trusted (new default), `trusted_proxies_strict`, direct | `6.6.6.6` | `192.168.65.1` (Docker Desktop's gateway) |
| `RONNE_TRUSTED_PROXIES=private_ranges`, behind nginx appending `203.0.113.7` | `6.6.6.6` | `203.0.113.7` |
| `RONNE_TRUSTED_PROXIES=private_ranges`, direct | `6.6.6.6` | `6.6.6.6`: why case 4 binds the port to 127.0.0.1 |

So the default changed to "nobody", and `trusted_proxies_strict` is always on (spec updated). Without
strict mode Caddy reads `X-Forwarded-For` left to right, and the leftmost entry is the client's to
write. `client-ip.ts` needs no change: Caddy sends one address.

Body size: Caddy's `28MB` is 28,000,000 bytes, which refused an exact 28 MiB body with an empty
413 before the app saw it. With `28MiB`, a 29,360,128-byte body with a token reaches the app (400:
the padding isn't a valid draft, so it's past the limit but not a real upload), and one byte more,
or 40 MiB, gets the app's `413 body_too_large`. The app checks `Content-Length` first, so Caddy's
limit is the backstop for bodies sent without one.

Caddy logs "Caddyfile input is not formatted" at start: the optional lines (`email`,
`trusted_proxies`) leave blank lines when they're unset, so no indentation would satisfy
`caddy fmt`. It does no harm.

### Task 4: CI (2026-10-03)

`.github/actions/build-image/compose-probe.sh` runs after the single-container probe, from the
repository root, so it can be run by hand too (`… compose-probe.sh ronne-web:local`). It runs
case 1 (HTTP on 7650, and `web` publishes no host port), then `RONNE_DOMAIN=localhost
RONNE_TLS=internal` (HTTPS on 7651 with `-k`, and a 308 from 7650 to `https://localhost/…`), then
`RONNE_TLS=files` with a one-day self-signed certificate, checked with `--cacert` so only that
certificate passes. On failure it prints the last 80 lines of the `proxy` and `web` logs.

- Locally (Docker Desktop, macOS): passes in about 5 s. With `reverse_proxy` misspelt in the
  Caddyfile it fails at the first probe, and the log shows Caddy's "unrecognized directive".
- `docker compose port web 3000` prints `invalid IP:0` and exits 0 when nothing is published, so
  the script reads `PublishedPort` from `docker compose ps` instead.
- **Still open:** the run on a pull request. Tick the task when that run passes on both architectures.

### Task 5: the Caddy image (2026-10-03)

- **2.11.4 failed the policy.** Trivy found 17 fixable HIGH vulnerabilities in it (Go standard
  library, `x/net`, `x/crypto`, `x/text`, `grpc`), and the scan would fail CI. 2.11.6 scans clean,
  but it was a day inside the cooldown, and 2.11.7 wasn't on Docker Hub yet. The owner chose 2.11.6
  as exception E-6 (policy §5), until Dependabot's 2.11.7 update is merged.
- Pin: `caddy:2.11.6@sha256:907efba736324e43f891ccb9d760fe5abe545e313419b3d18d63d4ec670dad8d`.
  The compose probe passes on it, and Caddy's licence is Apache-2.0 (GitHub's licence API).
- 2.11.6's HTTP/2 crash, a reverse proxy still reading a request body after the handler returned,
  didn't happen in nine 28–40 MiB uploads over HTTP/2 to `/api/v1/drafts` with a bad token,
  which answers before reading the body.
- Dependabot's `docker-compose` ecosystem already covered `/` (compose.yaml, since 035). It now
  picks up `caddy` too; no major-version ignore, since the compose probe catches a Caddyfile that
  stops working. Whether GitHub lists the new dependency can only be seen after the merge.
- Trivy scans the image that `docker compose config --images` names, in its own step after ours.
  It passed locally (exit 0).
