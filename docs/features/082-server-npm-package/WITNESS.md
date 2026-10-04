# 082 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, a fresh agent that didn't do the work checks it: it gets the task's *Done
when*, the claims in the notes and where to look, runs the commands itself, and reports each claim as
confirmed, partly or not met (owner, 2026-10-04). A task is ticked only when every claim holds.
Its record lands here, in the same commit as the task. Differences it finds are fixed in the notes
in that commit.

## Task 1 — Spike: what goes in the package

Witnessed: 2026-10-04 (23:13–23:15 EDT on 2026-10-03), by a fresh agent. Machine: macOS 27.0.1 arm64, Node v24.0.0, npm 11.5.2, Docker 29.7.2.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | Done-when met: the notes record sizes, install times and the choice | confirmed | PLAN.md's task 1 notes have a Measured table (8.4 MB, 34.4 MB unpacked, 65–67 MB installed, 2.5 s macOS, 5.7 s Debian) and "Choice: a new `packages/server`" with three reasons. |
| 2 | The standalone build uses pnpm's symlinked layout; externals resolve through hashed links | confirmed | `find .next/standalone -type l \| wc -l` → 50; `du` → 38M; `.next/standalone/apps/web/.next/node_modules` has `better-sqlite3-bfc5648742806807 -> …/.pnpm/better-sqlite3@13.0.3/…`, `pg-ad45e98bb7b7a165 -> …/.pnpm/pg@8.23.1/…`, `@node-rs/argon2-790216376ce6de64 -> …`. |
| 3 | better-sqlite3 13.0.3 ships 8 prebuilt binaries and has no install script; argon2 uses optional per-platform deps | confirmed | `prebuilds/` holds 8 `.node` files (darwin, linux, linuxmusl and win32, each x64 and arm64). The scripts have no install, preinstall or postinstall, and `gypfile: false`. argon2 has 13 optional platform packages. |
| 4 | Standalone output copies apps/web/.env; the assembler excludes .env; .dockerignore excludes .env | confirmed | `.next/standalone/apps/web/.env` exists, with keys DATABASE_URL, AUTH_SECRET, STORAGE_PATH and PUBLIC_URL (values not read). The assembler's copy filter drops `.env*`. `.dockerignore` lines 8–10 exclude `**/.env` and `**/.env.*`. |
| 5 | The assembler gives no symlinks, no *.node and one-line re-exports; the pack is ~8.4 MB, ~1,753 files, with no .env | confirmed (one file fewer) | 21 packages flattened, `pg-protocol` 1.16.1 kept. 0 symlinks, 0 `.node` files, 3 one-line shims. `npm pack` → 8.4 MB packed, 34.4 MB unpacked, **1,752** files, no `.env`. |
| 6 | macOS: `npm install -g` works (~2.5 s), health 503 → setup → 200 with no restart | confirmed | Empty cache and prefix: real 2.20 s. 65M installed, with `argon2-darwin-arm64` and better-sqlite3's prebuild (no `build/`). Health 503 `setup_required`, then `setup.mjs --yes` (SQLite, migrations 0001–0018, root created), then 200 from the same server process. |
| 7 | Linux (node:22-bookworm-slim) does the same with Node 22, and npm picks a linux argon2 binary | confirmed | Node v22.23.3, npm 10.9.9, aarch64. The install took 5.77 s and chose `argon2-linux-arm64-gnu`. Health 503 → setup → 200. |
| 8 | The notes say Windows wasn't run here and leave it to task 4's CI | confirmed | "Windows wasn't run here: task 4's CI matrix covers it." Windows isn't in the Measured table or the Runs list. |
| 9 | (a) The launcher's child server survives the launcher; (b) the messages name Docker/pnpm, not rmk-server | confirmed | (a) Killing `rmk-server` (PID 99640) left `next-server` (99644) re-parented to PID 1, still on :7656 and answering 200. (b) The start log says "run `docker compose exec web pnpm run setup`"; setup says "start it with `pnpm build && pnpm start`". |

**Not checked here:** Windows (left to task 4's CI); the Alpine/musl and emulated amd64 runs in the notes; signing in for a token (setup creating root already exercises argon2); install time with a warm cache.
**Differences from the notes:** 1,752 files, not 1,753, now corrected in the notes (the first tarball still held the `.env`). The macOS install took 2.20 s against 2.5 s (timing noise). Another finding for task 2, now in the notes: without `PUBLIC_URL`, the start log says "Open http://localhost:3000" whatever the port.
**Overall:** met. Every claim re-run matches, apart from the one-file count and timing noise.

## Task 2 — The package and its command

Witnessed: 2026-10-04 (23:26–23:35 EDT on 2026-10-03), by a fresh agent. Machine: macOS 27.0.1 arm64, Node v24.0.0, npm 11.5.2; Docker 29.7.2 for the Node 20 check.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | package.json: name, bin, engines, deps, files | confirmed | `@ronneai/marketplace` 0.2.0, `bin.rmk-server: ./dist/bin.js`, `engines.node: >=22.12`. The dependencies are exactly `@node-rs/argon2 2.2.1` and `better-sqlite3 13.0.3`, as in apps/web. `files`: dist (without maps and tests) and app. |
| 2 | Unit tests exist and pass | confirmed | `pnpm --filter @ronneai/marketplace test` → 14 passed (cli 6, paths 4, server-env 3, node-version 1). `runtime.test.ts` + `src/features/setup` → 23 passed; `prepare-start` (db) → 6 passed. |
| 3 | lint and typecheck pass | confirmed | `pnpm lint` → exit 0; `pnpm typecheck` → exit 0. |
| 4 | The assembler refuses .env, symlinks and .node files; tarball contents | confirmed | `assemble.mjs` skips `.env*`, leaves out the natives, and exits 1 on a symlink, `.env` or `*.node` in app/ (and with no standalone build, or when the versions differ from apps/web). The tarball has 1,765 entries: no `.env`, no `.node`, no symlinks, no dist tests or maps. It has `dist/bin.js` and `app/apps/web/server.js`. 8,516,580 bytes. |
| 5 | --version, --help, unknown command | confirmed | After `npm install -g --prefix …`, in a clean `env -i`: `--version` → `0.2.0`; `--help` → the commands, options and data folders; `frobnicate` → "Unknown option or command", exit 1. |
| 6 | Defaults to 127.0.0.1:7650 | confirmed | Started without `--port` → `lsof` shows only `127.0.0.1:7650 (LISTEN)`. The LAN address and `[::1]` refuse the connection. |
| 7 | Before setup: 503, and the messages name `rmk-server setup` and localhost:<port> | confirmed | 503 `setup_required` "…or run \`rmk-server setup\`". The log says "Open http://localhost:7650 … or run \`rmk-server setup\`". No docker, no :3000. |
| 8 | `setup --yes`, then health 200 with no restart; data folder contents | confirmed | `setup --yes` (DATABASE_URL, RONNE_ROOT_*, PORT) → exit 0, migrations 0001–0018, root created, and the last message names `rmk-server`. The same server PID then answered 200. The data folder holds `.env`, `ronne.db` and `storage/`, with `STORAGE_PATH=<data>/storage` and `PUBLIC_URL=http://localhost:7650`. |
| 9 | migrate and reset-root-password; old password refused, new one accepted | confirmed | `migrate` → "Nothing to migrate". `reset-root-password --yes` → reset. The old password then gets 401 and the new one 201 at `/api/v1/auth/token`. |
| 10 | Stopping rmk-server frees the port | confirmed | One process: the rmk-server PID itself listens (titled `next-server`) and has no children. `kill` → the port is free; SIGTERM in the pty run freed 7659 too. |
| 11 | Busy port: exit 1, the message names --port | confirmed | "port 7650 is in use on 127.0.0.1. Choose another with --port, for example rmk-server --port 7660.", exit 1. |
| 12 | Opens the browser on the first start in a terminal, and not without one | confirmed | A fake `open` first on PATH. Under `pty.fork` it recorded `http://localhost:7659`; without a terminal it recorded nothing. |
| 13 | macOS default data folder | confirmed | Without RONNE_DATA_DIR: "Data folder: <HOME>/Library/Application Support/RonneAI Marketplace", and the folder was created. |
| 14 | Node 20 refused, naming 22.12.0 | confirmed | `node:20-bookworm-slim`: npm warns EBADENGINE; `rmk-server` → "Node.js 22.12.0 or later is needed; this is 20.20.2.", exit 1. |
| 15 | The notes and the SPEC change match the code | confirmed | `serverEnv` sets RONNE_RUNTIME=npm, RONNE_DATA_DIR, RONNE_ENV_FILE, PORT and HOSTNAME, and never PUBLIC_URL. `defaultDataPath` and `defaultPublicUrl` are used in config, steps, run-setup, the setup page and prepare-start. `run.ts` imports the scripts and doesn't spawn them. |

**Not checked here:**
- Already checked by hand in the notes: `migrate` before setup.
- Covered by unit tests: the setup form's npm hints in a browser, the disabled-root advice and the no-terminal hint, and `--host`/`HOST` at runtime.
- Checked from the code and tests only: the Linux and Windows data folders.
- Left to task 4's CI: Linux and Windows.
- Left to the pre-commit hook: a full `pnpm test`/`pnpm build`.

**Differences from the notes:** none.
**Overall:** met. The package builds, packs, installs with `npm i -g` and does everything task 2 promises on this machine.
