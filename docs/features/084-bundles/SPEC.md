# 084 — Self-contained bundles

> Milestone: M12 · Depends on: 082 · Design: [MVP §5](../../MVP/MVP.md#5-installation--bootstrap) · Guide: [`docs/runbooks/install.md`](../../runbooks/install.md)

## Goal

Each release ships Ronne as one archive per system and processor, with Node.js inside, so the
packages (085, 087) install it on a machine that has neither Docker nor Node.js.

## Scope

**In:**
- Six archives per release: `rmk-server-X.Y.Z-{linux,darwin}-{x64,arm64}.tar.gz` and
  `rmk-server-X.Y.Z-win32-{x64,arm64}.zip`, attached to the GitHub release with `checksums.txt`.
- Inside each: the official Node.js 24 binary for that platform, the 082 package installed with
  its native module for that platform, and a launcher `bin/rmk-server` (`.cmd` on Windows) that
  runs the bundled Node.
- Built in `release.yml`, natively per platform (no cross-compiling the native module), smoke-tested
  per platform before upload.
- `THIRD_PARTY_NOTICES` inside, with Node.js's licence, and in the npm package (082) too.

**Out** (and where it goes instead):
- Installing them as a service → 085 and 087, and `rmk-server service install` (083, 086).
- A single-file executable (Node.js SEA): the standalone server is a folder of files plus a native
  module, which SEA doesn't fit well yet; revisit if a bundle's size or file count becomes a problem.
- Signing the binaries: post-MVP with release signing (MVP §14.2). Unsigned archives fetched by
  `curl`, Homebrew or winget aren't blocked by Gatekeeper; see 087 for Windows.

## Behaviour

**Layout:**

```
rmk-server-0.4.0-linux-x64/
  bin/rmk-server          launcher (rmk-server.cmd on Windows): the bundled node runs
                          lib/node_modules/@ronneai/marketplace/dist/bin.js
  node/                   the official Node.js 24 build for this platform, unmodified
  lib/node_modules/       @ronneai/marketplace and its dependencies, installed by the bundled
                          Node's npm (better-sqlite3 and argon2 for this platform)
  THIRD_PARTY_NOTICES
  LICENSE
```

- The Node.js download is checked against nodejs.org's `SHASUMS256.txt`, fetched over HTTPS, during
  the build (see Open questions for its signature).
- The launcher finds its folder through symbolic links (Homebrew and the packages link it from
  elsewhere). The bundled Node is used only by the launcher; it's never put on `PATH`.
- `rmk-server --version` prints Ronne's version, and in a bundle a second line with the bundled
  Node's (the launcher sets `RONNE_BUNDLE=1`).
- Size: about 75 MB per archive (74 MB darwin-arm64, 79 MB linux-arm64), 260 MB unpacked, measured
  in task 1. Node itself is most of it (its binary is 122 MB on macOS arm64).

**`THIRD_PARTY_NOTICES`.** Most of the web app's dependencies are compiled into Next's server
chunks, so they can't be read from any `node_modules`. When `@ronneai/marketplace` is packed, its
assembler writes `THIRD_PARTY_NOTICES` from the repository's dependency tree: every production
dependency of `@ronneai/web`, `@ronneai/marketplace` and `@ronneai/core` (`pnpm licenses list
--prod`, which doesn't follow workspace links), plus every package really in its `app/node_modules`
(optional dependencies the list leaves out), each with its licence text (MIT's standard text for the
few MIT packages that ship none). A bundle's own notices
are Node.js's licence, then the packages npm installed beside it that those don't list (the native
modules for that platform), then the package's.

**What an archive may hold** is checked when it's built and again when it's smoke-tested: `bin/`
with only the launcher, `node/`, `lib/node_modules/`, the two licence files; the package's own
files by `packages:check`'s rules for it; only the packages its dependencies reach, resolved as
Node resolves them, at any depth; and every package in the server's `app/` listed in its notices.
No settings, key or git files, no web app source, and none of npm's records (`.package-lock.json`,
`.bin`).

**Updating Node.js.** Each release takes the latest Node 24 patch at build time; Dependabot can't see
it, so the release checklist (034) gains "the bundles' Node version is current", and the build
prints it.

## Edge cases

- **Windows on arm64**: Node.js and `better-sqlite3` both publish arm64 Windows builds. A release
  needs all six archives: if one platform's build or smoke test fails (a missing prebuild
  included), there's no release, as below.
- **musl Linux (Alpine)**: not built; Alpine users use Docker. The Linux archives need glibc 2.34+
  (Debian 12, Ubuntu 22.04, RHEL 9): Node.js 24 needs 2.28, but better-sqlite3's prebuilt module,
  which has no fallback to compiling, needs 2.34 and libstdc++ from GCC 11 (`GLIBCXX_3.4.29`),
  stated in the release notes.
- **A release where one platform's smoke test fails**: no archive is uploaded for any platform, so
  the packages never point at a partial release.

## Documentation

- None in the app: people don't download archives directly; 085 and 087 document the packages.
- The release notes template lists the archives and their glibc requirement.

## Acceptance criteria

- [ ] Each release has six archives and `checksums.txt`; each archive's Node download was verified.
- [ ] On each platform's CI runner, the extracted archive runs `bin/rmk-server --version` and
      starts to a health answer, with no Node.js installed on `PATH` (removed in the job).
- [ ] The archives contain no dev dependencies or sources (an allowlist like `packages:check`).
- [ ] `THIRD_PARTY_NOTICES` includes Node.js and every runtime dependency.

## Open questions

- **The signature of `SHASUMS256.txt`.** nodejs.org signs it with OpenPGP (`SHASUMS256.txt.asc`),
  but the usual tool, GnuPG, is GPL-3.0, which the dependency policy forbids even in CI, and the
  JavaScript OpenPGP library is LGPL. Task 1 checks the archive against `SHASUMS256.txt` fetched over
  HTTPS from nodejs.org. Options for the owner: keep that; or verify the signature in our own
  dependency-free code against Node's release keys pinned from `nodejs/release-keys`; or pin each
  release's checksums in the repository, updated by hand.
