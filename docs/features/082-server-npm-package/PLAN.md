# 082 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Spike: what goes in the package.** Pack the standalone build with `collect-native.mjs`'s
  logic and measure its size and install time with npm on macOS, Linux and Windows. Decide between
  a new `packages/server` (a thin package that copies the build in at pack time) and publishing
  `apps/web` itself. Recommended: `packages/server`, so `apps/web` stays private.
  *Done when:* the notes record sizes, times and the choice.

- [x] **2. The package and its command.** `packages/server` with `bin: rmk-server`, the command
  table, the data folder per system, `RONNE_RUNTIME=npm`, `127.0.0.1:7650` by default, the browser
  on first start, the Node version check. Unit tests for the folder and argument logic.
  *Done when:* tests pass, and `pnpm pack` then `npm i -g ./…tgz` runs it on this machine.

- [ ] **3. Checks and release.** Add it to `packages:check`, `release:smoke`, `release:version` and
  `release.yml` (provenance, trusted publishing).
  *Done when:* a dry-run release packs and smoke-tests all four packages.

- [ ] **4. Three systems.** CI matrix (ubuntu, macos, windows × Node 22, 24): install the packed
  tarball, start, wait for `/api/health` = 503, run `setup --yes` with SQLite, health = 200.
  *Done when:* the matrix passes.

- [ ] **5. Documentation and decisions.** README, the Documentation section, MVP §5 and §15.
  *Done when:* the docs render tests pass.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

### Task 1: the spike (2026-10-04)

A prototype assembler (kept in the session's scratchpad; task 2 writes the real one) turned the
standalone build into a package, packed it with `npm pack`, installed it with `npm install -g`
into an empty prefix, and ran it.

**What the standalone build is.** `NEXT_OUTPUT=standalone` gives 38 MB in pnpm's layout:
`node_modules/.pnpm/<pkg>@<version>/…` with 50 symlinks between them. The server finds its external
modules through hashed links in `apps/web/.next/node_modules` (`better-sqlite3-bfc5648742806807`,
`pg-ad45e98bb7b7a165`, `@node-rs/…`), which point into that store. `npm pack` can't carry the
symlinks, and the native modules in it are built for the build machine only.

**How the package is assembled:**
1. Copy `apps/web` from the standalone output with symlinks resolved, plus `.next/static` and
   `dist-scripts/`.
2. Flatten the pnpm store into one plain `app/node_modules` (21 packages, each once). Two
   versions of `pg-protocol` were traced: 1.16.0 is only a stray `package.json`, and `pg` needs
   1.16.1. The assembler keeps the copy with real files.
3. Leave out the native modules (`better-sqlite3`, `@node-rs/argon2*`). Replace each hashed link
   with a one-line `module.exports = require("<name>")`.
4. Declare the natives as the package's only dependencies, at `apps/web`'s exact versions:
   - `better-sqlite3` 13.0.3 ships prebuilt binaries for 8 platforms in its npm package (darwin,
     linux, linuxmusl and win32, each x64 and arm64) and has no install script;
   - `@node-rs/argon2` 2.2.1 brings each platform's binary as an optional dependency.

   So npm compiles nothing on these platforms.
5. `files: ["bin", "app"]` keeps the nested `node_modules` and `.next` in the tarball (npm leaves
   nested `node_modules` out otherwise).

**Found: Next's standalone output copies `apps/web/.env`.** The first spike tarball held this clone's
`AUTH_SECRET` and `DATABASE_URL`. Nothing was published. The assembler must skip `.env*`, and
`packages:check` must refuse them (task 3). The Docker image is safe (`.dockerignore` excludes
`**/.env`), and release builds run from a clean checkout, but the package gets its own guard.

**Measured** (the spike build, 0.0.0-spike):

| | |
|---|---|
| Tarball | 8.4 MB, 1,752 files (1,753 in the first tarball, with the `.env`) |
| Unpacked | 34.4 MB; 65–67 MB installed with the natives |
| `npm install -g`, empty npm cache, macOS arm64, Node 24.0.0, npm 11.5.2 | 2.5 s |
| `npm install -g`, Debian arm64 container, Node 22.23.3 | 5.7 s |

**Runs.** On each, health answered 503 before setup, then `setup.mjs --yes` with SQLite, then 200
with no restart:
- macOS arm64, Node 24 (and sign-in returns a token, so argon2 works);
- Debian arm64, Node 22 (token too);
- Alpine arm64, Node 22 (musl; npm chose `argon2-linux-arm64-musl`);
- Debian amd64, Node 24 (emulated; `argon2-linux-x64-gnu`).

Windows wasn't run here: task 4's CI matrix covers it.

**For task 2:**
- The spike's launcher started `start.mjs` as a child process, and the server kept running after
  it, holding the port (`EADDRINUSE` on the next start). `rmk-server` must run the server in its own
  process, or forward signals.
- The messages still name Docker and pnpm: "run `docker compose exec web pnpm run setup`" at start,
  and "start it with `pnpm build && pnpm start`" after setup. `RONNE_RUNTIME=npm` must give
  `rmk-server` commands.
- Without `PUBLIC_URL`, the start log says "Open http://localhost:3000" whatever the port (found by
  the witness). `rmk-server` sets `PUBLIC_URL` to `http://localhost:<port>` by default, as the spec says.

**Choice: a new `packages/server`,** a thin package whose `prepack` assembles the build into
`app/`, rather than publishing `apps/web`:
- `apps/web` stays private;
- the published `package.json` declares only the two native modules;
- the assembler is the one place that decides what ships, which `packages:check` can then verify.

### Task 2: the package and its command (2026-10-04)

- **`packages/server`** (`@ronneai/marketplace`, 0.2.0):
  - `src/cli.ts`: the arguments. `start` is the default, with `--port`/`PORT` (7650),
    `--host`/`HOST` (127.0.0.1) and `--no-open`. The scripts keep their own flags.
  - `src/paths.ts`: the data folder per system.
  - `src/server-env.ts`: what it sets for the web app.
  - `src/node-version.ts`: needs 22.12.
  - `src/run.ts`: runs everything in one process.
  - `scripts/assemble.mjs`: task 1's assembler, run by `prepack`. It fails when there's no standalone
    build, when the native modules' versions differ from `apps/web`'s, or when `app/` would hold a
    `.env`, a symlink or a `.node` file.
  - 14 unit tests.
- **The app** (`apps/web/src/server/runtime.ts`):
  - `RONNE_RUNTIME=npm`, with defaults in the data folder;
  - the suggested address from `PORT`, without setting `PUBLIC_URL`;
  - `rmk-server` commands in the start log, the 503 response, the setup's last message, the `migrate`
    and `reset-root-password` errors, the no-terminal hint, and the disabled-root advice;
  - the setup form's hints for npm. Tests for each.
- **A standalone build made before an app change ships the old app.** The first run still said
  "docker compose exec" until the standalone build was redone. Rebuild with
  `NEXT_OUTPUT=standalone pnpm --filter "@ronneai/web..." build` before `assemble`; the release
  workflow must do the same (task 3).
- **Checked on this machine** (macOS arm64, Node 24), from `pnpm pack` → `npm install -g` into an
  empty prefix:
  - `--version`, `--help`, and an unknown command (exit 1);
  - start in setup mode, with the right messages;
  - `migrate` before setup (names `rmk-server setup`);
  - `setup --yes` with `DATABASE_URL`, then health 200 with no restart, and the settings,
    `ronne.db` and `storage/` in the data folder;
  - sign-in returns a token;
  - `migrate` ("nothing to migrate");
  - `reset-root-password --yes` (the old password 401, the new one 201);
  - stopping `rmk-server` frees the port;
  - a busy port names `--port`;
  - in a pseudo-terminal, the first start opens the browser (a fake `open`); with no terminal it
    doesn't;
  - without `RONNE_DATA_DIR`, data goes to `~/Library/Application Support/RonneAI Marketplace`;
  - under Node 20 (container), npm warns `EBADENGINE` and `rmk-server` exits 1 naming 22.12.0.
- Tarball: 8.5 MB. Next's server-page source maps (`.next/server/**/*.js.map`) ship, as in the
  Docker image; there's no `.env` and no `.node` file.
