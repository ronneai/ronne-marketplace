# 084 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, a fresh agent that didn't do the work checks it: it gets the task's *Done
when*, the claims in the notes and where to look, runs the commands itself, and reports each claim as
confirmed, partly or not met (owner, 2026-10-04). A task is ticked only when every claim holds.
Its record lands here, in the same commit as the task. Differences it finds are fixed in the notes
in that commit.

## Task 1 — Build script

Witnessed: 2026-10-04 (14:45–15:00 EDT, with a re-check of the fixes), by a fresh agent. Machine: macOS (Darwin 27.0.0) arm64, Node 24.0.0 on the host, Docker.

| # | Claim | Verdict | Evidence (command → what was seen) |
|---|---|---|---|
| 1 | Tests, lint, typecheck | confirmed | repo-tools 84 passed (8 new); marketplace 88; `pnpm lint` 53 warnings, 0 errors; typecheck 7/7. |
| 2 | `pnpm bundle <tgz>` builds darwin-arm64 in about 15 s | confirmed | The witness's own `pnpm build`, `build:server`, pack and bundle: 15.2 s, 74.2 MB (73.4 MB after the fixes). |
| 3 | The newest Node 24, checked against `SHASUMS256.txt` | confirmed | `index.json`'s newest v24 is 24.21.0; the code compares the SHA-256 and throws on a mismatch or a missing entry; the printed `bed7eea5…6057` matches nodejs.org's file and the witness's own download. |
| 4 | `node/` is the official build, unmodified | confirmed | `diff -r` against the official tarball, extracted: no differences. |
| 5 | Layout | confirmed | `bin/`, `node/`, `lib/node_modules/` (@ronneai/marketplace, @node-rs/argon2 with its darwin-arm64 binary, better-sqlite3, node-addon-api), `THIRD_PARTY_NOTICES`, `LICENSE`. |
| 6 | Sizes | confirmed | darwin: 74,185,449 B, 264M unpacked (node 199M, lib 65M, include 64M), node binary 122,129,232 B. linux-arm64: 78,612,132 B, about 271 MiB unpacked. |
| 7 | No Node on `PATH`; `--version` prints two lines; links | confirmed | `env -i … PATH=/usr/bin:/bin` → `0.2.0`, `Node.js 24.21.0 (bundled)`. Through absolute, relative and chained relative links, a link through a path with spaces, a bundle in a folder with spaces, a `PATH` lookup, `./rel`. `dist/bin.js --version` alone still prints one line. |
| 8 | 082's probe passes against `bin/rmk-server` | confirmed | 503 before setup, `setup --yes`, 200 with no restart, a token, the port freed (also after the fixes). |
| 9 | linux-arm64 builds in `node:24-bookworm-slim` and runs in `debian:13-slim` without Node | confirmed | 16 s; the SHA matches nodejs.org; no `node` in the image; both versions through a `/usr/local/bin` link; health 503; `argon2-linux-arm64-gnu`. |
| 10 | The notices claim (26 packages, 22 without a text; the app's dependencies compiled into Next's chunks) | confirmed | 26 entries, 22 "No licence file"; no kysely or better-auth folders, but `.next/server/chunks/…better-auth_dist_adapters_kysely-adapter…js`; also `dist-scripts/create-db-*.mjs` (2.3 MB, bundled). |
| 11 | The spec's changes match the code | confirmed | Layout, the HTTPS check and the open question about the signature, links, `RONNE_BUNDLE=1`, about 75 MB. |
| 12 | Fixes after the first round | confirmed | No `rmk-bundle-*` left; no `.package-lock.json` or `.bin` in `lib/`; no build-machine path in `lib/`, `bin/` or the notices except 082's two files; all 8,146 entries owned by root/0; no xattr headers or `._` files; GNU tar 1.35 extracts with no warnings; Windows uses System32's `tar.exe` and the fetches check `response.ok` (read). |

**Found, and fixed in this commit:** the work folder never removed (and then, in the re-check, kept
after a failed build); npm's `.package-lock.json` naming the build machine's path; the builder's
user as the files' owner; macOS extended attributes; a GNU tar from Git chosen on Windows; a failed
fetch reported as a missing checksum. The last fix (`finally`) was checked by the builder: a build
that fails with a 404 and one that works leave no work folder.
**Not checked here:** Windows (the `.cmd` launcher and the zip were read, not run); darwin-x64,
linux-x64; a tampered Node archive (the comparison was read and the hash checked by hand); the
linux-arm64 rebuild after the fixes (the witness's container command was blocked; the builder ran
it: 78.6 MB, owners 0/0).
**Differences from the notes:** linux-arm64 unpacked is 271 MiB and built in 16 s (corrected).
**Recorded for later (in the notes):** a service made from a bundle records its versioned
`node/bin/node` (085, 087); 082's standalone build writes the build machine's path into two files.
**Overall:** met.
