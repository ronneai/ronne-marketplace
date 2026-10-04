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
