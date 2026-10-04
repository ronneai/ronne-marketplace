# 084 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Build script.** `scripts/bundle.mjs <platform> <arch>`: download and verify Node.js,
  install the packed 082 tarball into `lib/` with npm for that platform, write the launcher and the
  notices, archive.
  *Done when:* it builds and runs the bundle for this machine; size recorded in the notes.

- [ ] **2. Release matrix.** In `release.yml`, a job per platform on native runners (ubuntu, ubuntu
  arm, macos-13 for x64, macos-latest for arm64, windows, windows arm if available): build, smoke
  test without Node on `PATH`, upload as a workflow artifact; a final job attaches all six only if
  all passed.
  *Done when:* a dry-run release produces six checked archives.

- [ ] **3. Allowlist and notices.** The archive content check and `THIRD_PARTY_NOTICES` with Node.js.
  *Done when:* the check fails on a stray file.

- [ ] **4. Release checklist.** The Node version line in 034's checklist and the release notes
  template.
  *Done when:* both are updated.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

### Task 1: the build script (2026-10-04)

- **`packages/repo-tools/src/bundle.js`** (`pnpm bundle <tarball> [--platform P --arch A --node V
  --out DIR]`), in repo-tools with the other release scripts rather than `scripts/bundle.mjs`:
  1. the newest Node.js 24 from nodejs.org's `index.json` (or `--node`), its archive checked against
     `SHASUMS256.txt` (fetched over HTTPS; the signature is an open question in the spec);
  2. the archive unpacked, unmodified, into `node/`;
  3. the packed `@ronneai/marketplace` installed into `lib/` by the bundled Node's own npm
     (`--omit=dev`, its own cache), so the native modules are that Node's and this machine's;
  4. `bin/rmk-server` (or `rmk-server.cmd`), `THIRD_PARTY_NOTICES` and `LICENSE`;
  5. a `.tar.gz` (a `.zip` on Windows, written by its bsdtar `tar -a`).

  It refuses to build for another platform: npm installs the native modules of the machine it runs
  on.
- **The launcher** resolves symbolic links itself (a POSIX loop over `readlink`, since `readlink -f`
  isn't on every macOS) and runs `node/bin/node lib/node_modules/@ronneai/marketplace/dist/bin.js`
  with `RONNE_BUNDLE=1`. `rmk-server --version` then adds "Node.js 24.21.0 (bundled)" (082's
  output is unchanged elsewhere).
- **Measured** (Node 24.21.0, the 0.2.0 package from this branch):

  | | darwin-arm64 | linux-arm64 |
  |---|---|---|
  | Archive | 74.2 MB | 78.6 MB |
  | Unpacked | 264 MB (node 199, lib 65) | 271 MiB (node 204, lib 67) |
  | Build | 15 s | 16 s in a container |

  The spec's 45 MB couldn't hold: the Node binary alone is 122 MB on macOS arm64. Leaving out
  `node/include` (C headers, 64 MB unpacked) would give 63 MB, and npm and corepack too 60 MB, but
  the spec keeps Node unmodified; the spec now says about 75 MB.
- **Run:**
  - this Mac (darwin-arm64), from the archive, with `PATH=/usr/bin:/bin` (no Node there):
    `--version` prints both lines, also through a symbolic link from another folder; 082's
    `server-probe.js` passes against `bin/rmk-server` (503 before setup, `setup --yes`, 200 with no
    restart, a token, the port freed);
  - linux-arm64: built in `node:24-bookworm-slim`, run in `debian:13-slim` with no Node installed:
    both versions, health 503, npm chose `argon2-linux-arm64-gnu`.
- **The notices fall short, for task 3:** collected from the bundle's `node_modules`, they list 26
  packages, 22 without a licence text. Next's standalone build copies only the files the server
  traces (no licences), and most of the app's own dependencies (Kysely, Better Auth, Zod…) are
  compiled into Next's server chunks, so they aren't packages there at all. "Every runtime
  dependency" needs the repository's dependency tree at pack time (`pnpm licenses list --prod`, with
  texts from the store); task 3 does it.
- 8 unit tests: the Node download names, `index.json`, `SHASUMS256.txt`, the launcher run for real
  through a link, the Windows launcher, the package walk (scoped, nested, a package's own
  `node_modules`, duplicates, a stray `package.json`), and the notices' layout.
- **Fixed after the witness:**
  - the work folder (about 336 MB) is removed after each build; `--keep` keeps it for a look;
  - npm's `lib/node_modules/.package-lock.json` (it named the tarball's path on the build machine)
    and `.bin` (links nothing uses) are left out;
  - files are owned by root in the archive, not by the builder (`--owner=0` with GNU tar, `--uid 0
    --uname root` with bsdtar), and on macOS without its extended attributes (`--no-xattrs
    --no-mac-metadata`, `COPYFILE_DISABLE=1`), which GNU tar warned about;
  - on Windows the script runs System32's `tar.exe` (bsdtar, which writes zip), not a GNU tar from
    Git that may come first on `PATH`;
  - a failed download of `index.json` or `SHASUMS256.txt` names the URL and status.

  Rebuilt on darwin-arm64 (73.4 MB) and linux-arm64 (78.6 MB); the probe passes again. Then (the
  re-check): the work folder is removed in a `finally`, so also after a failed build (checked
  with `--node 24.99.0`, a 404, and with a good build: none left).
- **For later:**
  - *085 and 087:* 083's `service install` records `process.execPath`, which for a bundle is its
    `node/bin/node`, under a folder named for the version. A service made from a bundle so skips
    the launcher (`RONNE_BUNDLE` is only for `--version`) and points at a versioned path that an
    upgrade replaces. The packages should install the service from a stable path (Homebrew's `opt`,
    `/usr/lib/rmk-server`), or run the launcher.
  - *082, not this task:* the standalone build writes the build machine's absolute path into
    `app/apps/web/server.js` and `required-server-files.json`. It's not a secret, but it's in
    every package.
