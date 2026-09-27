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
- Publishing images to a registry (GHCR) → at the first release.
- Kubernetes manifests or Helm charts → post-MVP, if asked for.

## Behaviour

**Image:**
- Based on `node:24-slim`, the current Node.js LTS on Debian stable (glibc, so `better-sqlite3` uses its prebuilt binaries on both architectures). The tag is pinned by digest, and Dependabot updates it.
- Next.js `output: "standalone"`.
- Runs as a non-root user with UID 1000.
- Exposes port 3000.
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

**Setup-required mode.** Every page shows one screen: "This instance isn't set up yet", with the exact
command to run. API routes return `503` with error code `setup_required` (MVP §11 error format).
After setup finishes, the user restarts the container (`docker compose restart web`), and setup's
final message says so.

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
- **`PUBLIC_URL` behind a reverse proxy:** documented in the README. The app trusts `X-Forwarded-*` headers only when `TRUST_PROXY=true`.
- **Running setup without a TTY** (`docker compose exec -T`): 003's non-interactive rules apply.

## Acceptance criteria

- [ ] `docker compose up`, then `docker compose exec web pnpm run setup` with SQLite defaults, then `docker compose restart web` gives a working instance at `http://localhost:3000`.
- [ ] Before setup, pages show the setup-required screen and `/api/health` returns `503`.
- [ ] Removing and recreating the container keeps the database, config and root account (state is on the volume).
- [ ] The same flow works with `--profile postgres` and `--profile mysql`.
- [ ] CI builds the image for amd64 and arm64 on each pull request.
- [ ] The container runs as a non-root user, and the image contains no dev dependencies.
- [ ] The Trivy scan passes, and the base image is pinned by digest and covered by Dependabot.
- [ ] Starting a newer image on an older database applies the new migrations before serving.

## Open questions

- None.
