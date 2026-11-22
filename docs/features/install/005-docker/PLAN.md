# 005 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [x] **1. Config file location.** Load config from `RONNE_ENV_FILE` (default `./.env`), with environment variables taking precedence. Make 003's setup write to the same path.
  *Done when:* a test shows the app and setup both honour `RONNE_ENV_FILE`, and that env vars override the file.

- [x] **2. Health endpoint and setup-required mode.** `GET /api/health`, the setup-required screen, and the `503 setup_required` API response.
  *Done when:* tests cover health with and without a database, and a page render in setup-required mode.

- [x] **3. Compiled scripts.** Bundle setup, reset-root-password and migrate into plain JS (for example with `tsdown`), with `pnpm run` entries that point at them in production.
  *Done when:* `node dist/setup.js --yes` works from a production build with no dev dependencies installed.

- [x] **4. Dockerfile.** Multi-stage build: install → build → a slim runtime with the standalone output, the compiled scripts, a non-root user, `/app/data`, `RONNE_ENV_FILE`, `HEALTHCHECK` and the start script.
  *Done when:* `docker build` succeeds locally, and the container shows the setup-required screen.

- [x] **5. Start script.** Config detection, migrations before start, the writable-volume check, and exit on migration failure.
  *Done when:* manual checks for a fresh volume, a configured volume, and a read-only volume behave as in SPEC.md (recorded in Notes).

- [x] **6. `compose.yaml`.** The web service, the volume, and the `mysql` and `postgres` profiles.
  *Done when:* acceptance criteria 1, 3 and 4 pass by hand (recorded in Notes).

- [x] **7. CI image build and scan.** Buildx for both architectures, a run-and-probe step on amd64,
  Trivy with `--severity HIGH,CRITICAL --ignore-unfixed`, and the `docker` ecosystem added to Dependabot.
  *Done when:* a pull request shows the job passing, and an older base image with a known CVE makes the scan fail (recorded in Notes).

- [x] **8. Docs.** The Docker section of the README, including reverse proxies and `TRUST_PROXY`.
  *Done when:* the README steps work as written.

## Notes
- **Task 1 (2026-09-27): settings file location.** `src/server/config.ts`:
  - `envFilePath()` is `RONNE_ENV_FILE` (absolute, or relative to the app) or `.env`.
  - `loadConfig()` reads the file, with environment variables taking precedence (an empty variable counts as unset). It returns `DATABASE_URL`, `AUTH_SECRET`, `PUBLIC_URL`, `STORAGE_PATH` (default `./data/storage`) and `TRUST_PROXY`.
  - `isConfigured()` needs a database URL and a secret.
  - `pnpm db:migrate`, setup and reset all use it, so they agree on the file. `migrate` previously read only `./.env` relative to the working directory. Setup has written to `RONNE_ENV_FILE` since 003.
  - **Tests:** relative and absolute `RONNE_ENV_FILE`, precedence, an empty variable, the unconfigured case, and `pnpm db:migrate` reading the database from the file.
- **Task 2 (2026-09-27): health and setup-required mode.**
  - `GET /api/health` (`app/api/health/route.ts` → `server/http/health.ts`) returns:
    - `200 {"status":"ok"}` when `select 1` answers within 3 seconds;
    - `503 setup_required` before setup;
    - `503 database_unavailable` otherwise. The driver's message is withheld, since the endpoint is public.

    Responses are `no-store`, and errors use the MVP §11 shape (`server/http/errors.ts`).
  - The root layout shows `features/setup-required/SetupRequired.tsx` instead of the page until `isConfigured(loadConfig())`. It calls `await connection()`, the Next 16 way to render per request (per the bundled docs), so settings are read at request time, not frozen at build time.
  - `server/db/instance.ts` keeps one pool per `DATABASE_URL` on `globalThis`, so dev hot reloads don't leak pools.
  - **Turbopack warning fixed:** reading the runtime settings file made Turbopack trace the whole project into the server output. That would have bloated the standalone build the image uses. The reads in `config.ts` now carry `/*turbopackIgnore: true*/`.
  - `better-sqlite3`, `pg` and `@node-rs/argon2` are on Next's default list of packages kept outside the server bundle. `mysql2` isn't, but the build doesn't need it yet.
  - **Live check** (`next start` on a temp `RONNE_ENV_FILE`): 503 and the setup screen before setup; 200 and the normal page after `setup --yes` and a restart.
- **Task 3 (2026-09-27): compiled scripts, using option A** (chosen by the owner).
  - **The options measured:**
    - Next standalone output: 24 MB. It lacks `@clack/prompts`, `@node-rs/argon2` and `better-auth`, which the scripts need.
    - `pnpm deploy --prod`: about 800 MB, including the Next compiler (SWC), rolldown, and Vitest, a `better-auth` peer dependency.

    So the scripts are bundled.
  - **The bundle:** `apps/web/tsdown.config.ts`, with `tsdown` 0.23.0 (MIT, no install scripts, rolldown already in the tree). It compiles `setup`, `migrate` and `reset-root-password` to `apps/web/dist-scripts/*.mjs` (1.8 MB). Everything is bundled except `better-sqlite3` and `@node-rs/argon2`. `deps.onlyImport` makes the build **fail** if the output would import any other package.
  - The output sits one level under the app, like `scripts/`, so the scripts' `resolve(import.meta.dirname, "..")` still finds the app folder.
  - **The web app's `build` is now `next build && tsdown`,** so the pre-commit hook and CI check the bundle on every change. `dist-scripts/` is git-ignored and a Turbo build output.
  - **Proof:** in a scratch folder whose only `node_modules` were `better-sqlite3` (plus `node-addon-api`) and `@node-rs/argon2` (plus its platform binary), `node dist-scripts/setup.mjs --yes`, `migrate.mjs` and `reset-root-password.mjs --yes` all worked.
  - Setup's closing message says `pnpm build && pnpm start`, which is wrong in Docker. To be adjusted with the start script in task 5.
- **Task 4 (2026-09-27): Dockerfile.**
  - **Stages:**
    - `deps`: `pnpm install --frozen-lockfile` with the workspace's supply-chain settings. pnpm 12.6.0 comes from `npm install --global`, because Corepack can't start pnpm 12. It also installs `python3 make g++`, only for `better-sqlite3`.
    - `build`: `NEXT_OUTPUT=standalone` for the Next build, then `tsdown`, then `docker/collect-native.mjs`.
    - `runtime`: the standalone server, `.next/static`, `dist-scripts` and the collected native modules. It runs as `node` (uid 1000) with a `/app/data` volume and `RONNE_ENV_FILE=/app/data/.env`.
  - **Base image:** `node:24-trixie-slim`, pinned by digest (`sha256:8ec5…cffe`, Node 24.21.0). **Changed from the spec's `node:24-slim`, which is Debian 12;** the policy asks for the current Debian stable (13). The spec is updated.
  - **`next.config.ts`:** `output: "standalone"` only when `NEXT_OUTPUT=standalone`, because local `next start` doesn't support standalone.
  - **`docker/collect-native.mjs`:** standalone links native modules only under hashed names in `.next/node_modules`, which the scripts can't import. So `better-sqlite3`, `node-addon-api`, `@node-rs/argon2` and its platform binary are copied into `apps/web/node_modules`, leaving out `deps/`, `src/` and similar (SQLite's C source).
  - **`docker/pnpm`** is a stand-in at `/usr/local/bin/pnpm`. It maps `pnpm run setup`, `pnpm run reset-root-password` and `pnpm db:migrate` to the compiled scripts, so the documented `docker compose exec web pnpm run setup` works. Anything else exits 2.
  - `apps/web/data` is a symlink to `/app/data`, so setup's defaults (`./data/ronne.db`, `./data/storage`) land on the volume.
  - `HEALTHCHECK` calls `/api/health` using Node's `fetch`, since `curl` isn't in the image.
  - **Size:** 422 MB, of which the base is 355 MB. Ronne adds about 52 MB: 31 MB server, 18 MB native modules, 2 MB scripts, 0.6 MB static assets. None of vitest, vite, typescript, tsx, tsdown, Biome or turbo is in the image.
  - **Checked by hand:**
    1. A new container shows the setup screen, and `/api/health` returns 503 `setup_required`.
    2. `docker exec … pnpm run setup --yes`, with `DATABASE_URL=file:./data/ronne.db` and the root variables, writes `/app/data/.env` (0600), `ronne.db` and `storage/`.
    3. After `docker restart`, it returns 200 `{"status":"ok"}`, shows the normal page, and Docker reports `healthy`.
  - **Non-interactive setup needs `DATABASE_URL`**, as in 003. The interactive run asks, and defaults to SQLite. Setup's closing message still says `pnpm build && pnpm start`, to be fixed in task 5.
- **Task 5 (2026-09-27): start script.** `scripts/start.ts` is bundled to `dist-scripts/start.mjs` and is the image's `CMD`. The logic lives in `src/server/setup/prepare-start.ts`:
  1. **Check `RONNE_DATA_DIR` (`/app/data`) is writable** with a probe file. If not, `StartError` prints the `chown` fix and exits 1.
  2. **Before setup,** start in setup-required mode and log the setup command.
  3. **After setup,** apply pending migrations. A failure (including `DatabaseAheadOfAppError`) exits 1, so the server never serves a half-migrated database and the restart policy retries.
  4. **Start the standalone `server.js`** in the same process, through a dynamic `import()`, so signals go straight to Next.js.
- **Setup's closing message** says "Restart it with `docker compose restart web`" when `RONNE_RUNTIME=docker`, which the image sets.
- **Tests** (`prepare-start.db.test.ts`): setup mode; migrations applied, then nothing to do; a database with an unknown migration refused; an unwritable folder refused with the `chown` hint.
- **Checked with the image and named volumes:**
  1. Fresh volume: setup mode, 503, then setup in the container.
  2. Same volume in a new container: "The database is up to date", then 200.
  3. Root-owned volume: exit 1 with the `chown` command.
- **Testing gotcha:** Docker copies the image's folder ownership onto an *empty* named volume on first mount. An empty root-owned volume therefore becomes writable, and the unwritable case only happens when the volume already has content. The first attempt at scenario 3 simply started the server.
- **Task 6 (2026-09-27): `compose.yaml`** (project `ronne`).
  - **`web`:** built from the Dockerfile, `restart: unless-stopped`, port `${RONNE_PORT:-3000}`, `PUBLIC_URL` from the environment, and the `ronne-data` volume.
  - **Profiles `postgres` (`postgres:18`) and `mysql` (`mysql:8.4`):**
    - each has a `ronne` user owning the `ronne` database, which avoids PostgreSQL 15+'s `public` schema grant;
    - the password is `RONNE_DB_PASSWORD`, with a placeholder default and a comment to change it;
    - no published ports, so they're reachable only inside the project;
    - their own volumes and health checks.

    PostgreSQL 18's volume goes on `/var/lib/postgresql`, the path its image expects from 18.
  - There's no `depends_on`, because `web` can't depend on an optional profile. If the database isn't ready yet, the start script's migration exits and `restart: unless-stopped` retries.
  - **Checked with a throwaway project** (`-p ronne-t6`, port 3203), for SQLite, `--profile postgres` and `--profile mysql`: 503 before setup; `docker compose exec -T web pnpm run setup --yes` applied `0001_identity` and created root; after `docker compose restart web`, the logs show "The database is up to date" (with the password redacted) and the health check returns 200. Then `down -v`.
- **Task 7 (2026-09-27): image build and scan in CI, written but not yet ticked.** Waiting on the first GitHub run.
  - `.github/workflows/image.yml`, job `Docker image (build, run, scan)`, on pull requests and pushes to `main`:
    - a Buildx build for `linux/amd64,linux/arm64` (QEMU for arm64, GitHub Actions cache), with no push;
    - an amd64 build loaded as `ronne-web:ci`, run, and probed until `/api/health` answers `setup_required`;
    - **Trivy 0.74.0** from its own image (`aquasec/trivy@sha256:62b1…1969`, Apache-2.0) rather than a third-party action: `--severity HIGH,CRITICAL --ignore-unfixed --exit-code 1`.

    The Docker actions (`setup-qemu` v4.4.0, `setup-buildx` v4.4.1, `build-push` v7.4.0; Apache-2.0; all over 3 days old) are pinned by SHA.
  - **The first local Trivy scan failed: 4 HIGH (`brace-expansion`, `ip-address`, `tar`), all inside the base image's own npm.** The bare `node:24-trixie-slim` has the same 4; Debian packages and Ronne's dependencies had 0. **Option A (owner's choice):** the runtime stage removes npm, npx, corepack and Yarn 1, which nothing at runtime uses. After that, Trivy exits 0. Setup, restart (200), `reset-root-password` and `db:migrate` were re-run in the container, and they all still work. The image size is unchanged (422 MB), because the base layers still hold those files; only the final filesystem, which is what gets scanned and run, is smaller.
  - **Dependabot:** added the `docker` (the Dockerfile's base digest) and `docker-compose` (`/` and `/docker`) ecosystems, weekly, with a 3-day cooldown and the `[chore]` prefix. The base image moved from an `ARG` into `FROM`, so Dependabot can see it. The Trivy digest in `image.yml` is in a `docker run` line, which Dependabot doesn't update, so bump it by hand.
  - **After merging,** add `Docker image (build, run, scan)` to the required checks on `main`.
- **Task 8 (2026-09-27): docs.**
  - The README has a "With Docker" section: up, setup, restart, `RONNE_PORT`, the setup screen, the `ronne-data` volume and backups, upgrades running migrations on start, the PostgreSQL and MySQL profiles, `--yes` in the container, `reset-root-password`, and the `chown` fix.
  - **Reverse proxies:** `PUBLIC_URL`, plus a note that `TRUST_PROXY` is read by `loadConfig()` but unused until sign-in (006). It's documented as having no effect yet, rather than implying it does something.
  - MVP §5's Docker line now includes the restart step and links to this feature.
  - The README steps were run as written through compose (task 6) and with plain `docker run` (tasks 4 and 5).
- **Task 7 confirmed on GitHub (PR #11, 2026-09-27):** `Docker image (build, run, scan)` passed in 8 minutes, covering the amd64 and arm64 builds, the run check answering `setup_required`, and a clean Trivy scan.
- **A CI flake it exposed:** `Database tests (mysql)` failed one test (`migrate.db.test.ts`, "Test timed out in 5000ms"). The other 65 passed, and the same test passed on MySQL in PR #10 and locally. **Option A (owner's choice):** the `db` Vitest project's test and hook timeouts are now 30 seconds; unit tests keep 5 seconds.
- **Compose project renamed (2026-09-27): `ronne` → `ronne-marketplace`.** The owner's machine already had another compose project called `ronne` (the other product the name is reserved for), with volumes such as `ronne_postgres-data`. Our `name: ronne` would have shared them: `--profile postgres` would have mounted that database, and `down -v` would have deleted its data. Nothing was touched, because the tests used their own project names. The volumes are now `ronne-marketplace_*`.
- **Dependabot ignores majors (2026-09-27):** its first run proposed `node` 24 → 26 (not an LTS yet), and moving the test databases off their deliberate minimum versions (`postgres` 15 → 18, `mariadb` 10.11 → 13.0, `mysql` 8.4 → 26.7). The `docker` and `docker-compose` entries now ignore semver-major updates of `node`, `postgres`, `mysql` and `mariadb`. Majors move by hand, with the policy, as for `@types/node`.

- **Faster image check (2026-09-28):** `Docker image (build, run, scan)` took 7–8 minutes and gated every merge. Measured: arm64 under QEMU took ~4.7 minutes (`pnpm install` 97 s, `next build` 170 s, against 23 s and 24 s natively), the `mode=max` cache export 137 s, and the build record upload ~30 s. Now:
  - each architecture builds natively on its own runner, in parallel (`ubuntu-latest` and `ubuntu-24.04-arm`, free for public repositories), and each one runs the health check and the Trivy scan, which only amd64 had before;
  - the cache is exported only on pushes to `main` (a PR's cache is only visible to that PR), with a scope per architecture; PRs read `main`'s;
  - the build summary and record upload are off;
  - a small job keeps the name `Docker image (build, run, scan)`, which branch protection requires, and passes when both builds pass or were skipped for a docs-only PR.
  - Not done: installing only `@ronneai/web...` in the image. `packages/core` builds with the root's TypeScript, which a filtered install leaves out.
