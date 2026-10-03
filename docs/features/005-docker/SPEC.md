# 005 — Docker image and compose

> Milestone: M0 · Depends on: 003 · Design: [MVP §5](../../MVP/MVP.md#5-installation--bootstrap)

## Goal

The second install path from MVP §5: `docker compose up`, then `docker compose exec web pnpm run setup`.
It works on amd64 and arm64, keeps all state on one volume, and survives upgrades.

## Scope

**In:**
- A multi-stage `Dockerfile` for `apps/web`, including the setup and reset commands.
- `compose.yaml` with the `web` service and a data volume, plus optional MySQL and PostgreSQL services behind profiles.
- A start script that applies pending migrations before the server starts.
- A health endpoint.
- A "setup required" page for when the instance isn't configured yet.
- A CI job that builds the image for both architectures.

**Out:**
- Publishing the image to a registry → [035](../035-docker-hub-image/SPEC.md): Docker Hub, as
  `ronneai/marketplace`, from the release workflow.
- Kubernetes manifests or Helm charts → post-MVP, if asked for.

## Behaviour

**Image:**
- Based on `node:24-trixie-slim`: the current Node.js LTS on the current Debian stable (13). The plain `node:24-slim` tag is still Debian 12. It's glibc, so `better-sqlite3` can use prebuilt binaries on both architectures; the build stage also has `python3 make g++` for when it can't. The image is pinned by digest, and Dependabot updates it; the build also applies Debian's security updates (`apt-get upgrade`), since Debian often publishes a fix days before the Node image is rebuilt with it, and the scan would block every build until then (2026-09-30).
- Next.js `output: "standalone"`.
- Runs as a non-root user with UID 1000.
- Exposes port 3000. Since [080](../080-docker-https/SPEC.md), `compose.yaml` doesn't publish it:
  a Caddy proxy in front of it is published on host ports 7650 (HTTP) and 7651 (HTTPS).
- The setup, reset and migrate commands are compiled to plain JS during the build, so the image
  needs no dev dependencies or TypeScript runner. `pnpm run setup` inside the container calls that compiled script.

**State lives in `/app/data`** (one named volume). It holds the SQLite file (by default), `storage/`
for artifacts, and the config file. Setup writes its `.env` to `/app/data/.env` in the container:
the app reads its config file from `RONNE_ENV_FILE`, which defaults to `./.env` outside Docker and is
set to `/app/data/.env` in the image. Variables set directly in the environment (for example in
`compose.yaml`) override the file.

**Start script** (the container's entrypoint):
1. If there is no config (no `DATABASE_URL` in the environment or the config file), start the server in setup-required mode.
2. Otherwise run pending migrations. If they fail, exit with the error, so the container restarts
   instead of serving a half-migrated database.
3. Start the Next.js server.

**Setup-required mode.** Until the instance is set up, every page opens the web setup
([036](../036-web-setup/SPEC.md); before 036, a screen with the command to run), and API routes
return `503` with error code `setup_required` (MVP §11 error format). No restart follows: the app
reads its settings on each request (036), so the container picks a finished setup up at once.

**Health endpoint:** `GET /api/health` returns `200 {"status":"ok"}` when the database answers,
`503` otherwise, including in setup-required mode. The image's `HEALTHCHECK` uses it.

**`compose.yaml`:**
- The `web` service, the `ronne-data` volume, and `PUBLIC_URL` as the only variable most people change.
- Profiles `mysql` and `postgres` add a database service with a volume, for trying Ronne with those
  databases (`docker compose --profile postgres up`). Setup is then pointed at that service's host name.

**CI** builds the image with Buildx for `linux/amd64` and `linux/arm64` on every pull request, without
pushing. It then runs the amd64 image and waits for `/api/health` to return `503 setup_required`.
The image is scanned with Trivy, which fails on high or critical vulnerabilities that have a fix
(dependency policy §3).

## Edge cases

- **Volume owned by root** (created by an older setup or by hand): the start script checks it can write to `/app/data` and exits with a message showing the `chown` command.
- **Upgrading the image:** migrations run on start. A migration from a newer image is never rolled back by an older one: the older image refuses to start (002's unknown-migration check).
- **`PUBLIC_URL` behind a reverse proxy:** documented in the README. The app trusts `X-Forwarded-*` headers only when `TRUST_PROXY=true`. Since 080, `compose.yaml` sets it, because its own proxy is always in front.
- **Running setup without a TTY** (`docker compose exec -T`): 003's non-interactive rules apply.

## Acceptance criteria

- [x] `docker compose up`, then `docker compose exec web pnpm run setup` with SQLite defaults, then `docker compose restart web` gives a working instance at `http://localhost:3000` (since 036: the browser's setup, or the same command, with no restart).
- [x] Before setup, pages show the setup-required screen and `/api/health` returns `503`.
- [x] Removing and recreating the container keeps the database, config and root account (state is on the volume).
- [x] The same flow works with `--profile postgres` and `--profile mysql`.
- [x] CI builds the image for amd64 and arm64 on each pull request.
- [x] The container runs as a non-root user, and the image contains no dev dependencies.
- [x] The Trivy scan passes, and the base image is pinned by digest and covered by Dependabot.
- [x] Starting a newer image on an older database applies the new migrations before serving.

## Open questions

- None.
