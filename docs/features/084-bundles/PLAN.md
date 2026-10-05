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

- [x] **3. Allowlist and notices.** The archive content check and `THIRD_PARTY_NOTICES` with Node.js.
  *Done when:* the check fails on a stray file.

- [x] **4. Release checklist.** The Node version line in 034's checklist and the release notes
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

### Task 2: the release matrix (2026-10-04)

- **`.github/workflows/bundles.yml`**, reusable (`workflow_call`), so every pull request and the
  release build the bundles the same way. Six jobs, each on a runner of its platform:
  `ubuntu-24.04`, `ubuntu-24.04-arm`, `macos-15-intel`, `macos-15`, `windows-2025`,
  `windows-11-arm` (the plan's `macos-13` is retired; `macos-15-intel` is GitHub's x64 macOS
  now). Each downloads the `server-tarball` artifact, runs `bundle.js`, then `bundle-smoke.js`, and
  uploads `bundle-<platform>-<arch>`.
- **`packages/repo-tools/src/bundle-smoke.js`** unpacks the archive (with System32's `tar.exe` on
  Windows) and takes every folder holding a `node` off `PATH`, then checks `which`/`where node`
  finds nothing. It checks `rmk-server --version` prints the package's version and "Node.js 24.x.y
  (bundled)", and runs 082's `server-probe.js` against the launcher, with the bundle's own Node.
  Passes here on the darwin-arm64 bundle. 2 more unit tests (the `PATH` filter, the folder name).
- **`server-package.yml`** calls it after its pack job; the *Server package* check needs it.
- **`release.yml`:**
  - the release job uploads the packed server as `server-tarball` (also on a dry run);
  - `bundles` calls the reusable workflow after it;
  - `github-release` needs `bundles` too, downloads the six, fails unless there are six, adds
    their SHA-256 to `checksums.txt` (with the install scripts'), checks them all, and attaches
    them. So one failed platform means no release at all, as the spec says.
- **Still open:** the *Done when* (a dry-run release with six checked archives) needs this branch
  on GitHub. Its pull request runs the six jobs first; then a dry run dispatched from the branch
  (`gh workflow run release.yml --ref feat/084-bundles -f tag=v0.2.0 -f dry_run=true`) waits for the
  owner's approval of the "npm" environment.
- **Fixed after the witness:** the bundle uploads replace an earlier one (`overwrite: true`), so the
  release can be re-run, as its other uploads can; the smoke test fails, with a message, when the
  archive unpacks to a folder other than its own name (so a version mismatch between the name and
  the package can't pass); and its cleanup retries and only warns (a file Windows still holds
  must not fail a good run). Known and left: a system folder that held a `node` (none on GitHub's
  images) would leave `PATH` with it, and the launcher would fail loudly, not pass wrongly.

### Task 3: allowlist and notices (2026-10-04)

- **`packages/repo-tools/src/notices.js`** writes `THIRD_PARTY_NOTICES` from `pnpm licenses list
  --prod --json` for the given workspace packages: one section per name@version, with the
  licence files of that version's folder in the store. The licence-file pattern takes `LICENSE`,
  `LICENCE.md`, `COPYING`, `NOTICE`, `LICENSE-MIT` and the like, never a source file such as
  `license.js`.
- **The npm package carries it.** `packages/server/scripts/assemble.mjs` (082's `prepack`) runs
  it for `@ronneai/web` and `@ronneai/marketplace`; `files` and `packs.js` add it (required, and
  allowed), and it's git-ignored like `app/`. 131 packages, 217 kB. 5 MIT packages ship no
  licence file (`@better-auth/utils`, `@next/env`, `client-only`, `pg-types`, `pgpass`); they get
  MIT's standard text with a note. Licences: MIT, Apache-2.0, ISC, BSD-3-Clause, 0BSD and
  CC-BY-4.0 (caniuse-lite's data, allowed by policy exception E-2).
- **The bundle's notices** (`bundle.js`): Node.js's licence first, then each package npm put in
  `lib/` (not the marketplace itself) that the package's notices don't already list, then those
  notices. For darwin-arm64: 133 sections, with `@node-rs/argon2-darwin-arm64` and
  `node-addon-api` from npm's install.
- **`packages/repo-tools/src/bundle-check.js`** checks an unpacked bundle: the top holds only
  `bin`, `node`, `lib`, `THIRD_PARTY_NOTICES`, `LICENSE`; `bin/` only the launcher; `node/` has
  Node's `LICENSE`; nothing in `lib/` outside `node_modules/`; the package's files pass
  `packages:check`'s rules for `@ronneai/marketplace`; every other package is one the
  marketplace's dependencies (and optional dependencies present for this platform) pull in; and no
  `.env`, `.npmrc`, lockfile, `.bin`, `.tgz`, key or `.DS_Store` in `lib/`. `bundle.js` runs it
  before archiving and `bundle-smoke.js` after unpacking, so every CI and release job checks it.
- **Done when met:** the check fails on a stray file: tests put one at the top, in `bin/`, in
  `lib/` outside `node_modules`, a package nobody depends on, and a source file in the package; and
  settings, a key and npm's records. The real darwin-arm64 bundle passes, built from a freshly
  packed tarball (the one packed before this task failed: "@ronneai/marketplace is missing
  THIRD_PARTY_NOTICES"). `packages:check` passes (1,797 files). 8 new tests (4 for the check, 4
  for the notices), and 082's pack test lists the notices as required.
- **Fixed after the witness** (it confirmed the *Done when* on a real bundle, with 13 kinds of stray
  file, and a repacked archive with an `app/.env` failing the smoke test):
  - *Missing from the notices:* `@ronneai/core`'s own dependencies (ajv, ajv-formats, semver,
    fast-uri, fast-deep-equal, json-schema-traverse, require-from-string), compiled into Next's
    chunks, because `pnpm licenses` doesn't follow `workspace:` links; and `pg-cloudflare`, an
    optional dependency of `pg` that `--prod` leaves out but the standalone build ships. The
    assembler now adds `--filter @ronneai/core` and `--scan app/`, which adds every package really
    in `app/node_modules` that the list lacks. 139 packages now. 7 sections ship no licence file
    and get MIT's text (6 in the package: `@better-auth/utils` twice, 0.4.2 and 0.5.0, and the
    bundle's `@node-rs/argon2-<platform>`).
  - *Gaps in the check:* a stray package nested inside a dependency passed (only top-level folders
    were looked at). Now every package folder at any depth must be reached by resolving the
    dependencies as Node does (a folder's own `node_modules`, then its parents'). Every package in
    the server's `app/` must be in its notices, which also proves the notices complete. `.git/`
    anywhere and the web app's `src/` are refused. Source files inside dependencies stay allowed
    (real packages ship them), and `node/` stays unread (it's the official build, compared in task 1).
  - The package walk moved from `bundle.js` to `notices.js` (the assembler uses it too), and
    `bundle.js`'s imports are at the top again.
  - 3 more tests (nested resolution, `app/` against the notices, `.git` and source); 97 in
    repo-tools. The real darwin-arm64 bundle passes the stricter check and the smoke test.
- **Fixed after the re-check:** a folder in the server's `app/node_modules` without a `package.json`
  naming it and its version passed, since `app/` is matched against the notices by name and
  version. Every folder there must now be such a package (checked with a loose `index.js` and an
  empty `package.json`).

### Task 4: release checklist (2026-10-04)

- **There was no release checklist** (the plan's "034's checklist"), so **`docs/runbooks/release.md`**
  is one: before the version (main green, Dependabot, **the bundles' Node.js current**: compare
  nodejs.org's newest v24 with what the last *Bundle* jobs printed, and wait for an announced
  security release), the version (`pnpm release:version`), a dry run from `main` and what its log
  must show (the six *Bundle* jobs included), the tag, what the release must hold, a package's
  first publish, and re-running.
- **The release notes** (`release.yml`'s `github-release`): written to a file, then `gh release
  create --notes-file` (with GitHub's generated notes after it). They name the six archives, the
  bundled Node.js version (read by running the Linux x64 bundle's `node --version` on the runner),
  how to start one, the glibc 2.34 requirement (Debian 12, Ubuntu 22.04, RHEL 9 and newer; Alpine
  and older systems use Docker; first written as 2.28, see below), THIRD_PARTY_NOTICES, the npm commands and `checksums.txt`. The block renders as
  expected here with stand-in values.
- **The command tables:** README gains `build:server` and `pnpm bundle` and now names the four
  packages (`packages:check`, `release:smoke` and `release:version` still said three); CLAUDE.md
  gains `pnpm bundle`, and both point to the checklist.
- **Fixed after the witness: glibc 2.34, not 2.28.** Node.js 24 alone needs glibc 2.28, but the
  bundle loads better-sqlite3 13.0.3's prebuilt `linux-x64.node` and `linux-arm64.node` directly
  (no install script, so nothing compiles it instead), and those need `GLIBC_2.34` and
  `GLIBCXX_3.4.29`. Checked here (`strings` on the linux-arm64 bundle: node 2.28, better-sqlite3
  2.34, argon2's gnu build 2.17), then for real: SQLite loads on Ubuntu 22.04 (glibc 2.35), not on
  Ubuntu 20.04 or Debian 11 (2.31). The smoke tests run on Ubuntu 24.04 (2.39), so they can't
  catch it. Corrected in the release notes, the checklist, the spec's edge case and these notes.
  The same holds for the npm package (082): README's native-modules note said npm compiles
  better-sqlite3 elsewhere, which it doesn't (no install script, as 082's spike recorded), and now
  gives the glibc 2.34 floor and Docker for older systems. Building the Linux bundles against an
  older glibc would need better-sqlite3 built from source on an old base: a design choice for
  later, not taken here.
- Also from the witness: the spec's Windows arm64 edge case said a missing prebuild skips that one
  archive, but a release needs all six (the workflow counts them); reworded. The notes now write
  each archive's full name. And 085's spec, which cited 084's floor as 2.28, says 2.34 (found by the
  re-check).
