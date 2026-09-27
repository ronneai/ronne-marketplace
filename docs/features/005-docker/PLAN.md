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

- [ ] **6. `compose.yaml`.** The web service, the volume, and the `mysql` and `postgres` profiles.
  *Done when:* acceptance criteria 1, 3 and 4 pass by hand (recorded in Notes).

- [ ] **7. CI image build and scan.** Buildx for both architectures, a run-and-probe step on amd64,
  Trivy with `--severity HIGH,CRITICAL --ignore-unfixed`, and the `docker` ecosystem added to Dependabot.
  *Done when:* a pull request shows the job passing, and an older base image with a known CVE makes the scan fail (recorded in Notes).

- [ ] **8. Docs.** The Docker section of the README, including reverse proxies and `TRUST_PROXY`.
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

