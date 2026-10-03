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
- `THIRD_PARTY_NOTICES` inside, with Node.js's licence.

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
  bin/rmk-server          launcher: exec "$(dirname "$0")/../node/bin/node" "$(dirname "$0")/../lib/cli.mjs" "$@"
  node/                   the official Node.js 24 build for this platform, unmodified
  lib/                    @ronneai/marketplace with its node_modules (better-sqlite3 for this platform)
  THIRD_PARTY_NOTICES
  LICENSE
```

- The Node.js download is checked against nodejs.org's signed `SHASUMS256.txt` during the build.
- The bundled Node is used only by the launcher; it's never put on `PATH`.
- `rmk-server --version` prints Ronne's and the bundled Node's versions.
- Expected size: about 45 MB for Node plus the app (measured in task 1).

**Updating Node.js.** Each release takes the latest Node 24 patch at build time; Dependabot can't see
it, so the release checklist (034) gains "the bundles' Node version is current", and the build
prints it.

## Edge cases

- **Windows on arm64**: Node.js and `better-sqlite3` both publish arm64 Windows builds; if the
  native module's prebuilt is missing for a release, that one archive is skipped with a warning in
  the release notes, not the whole release.
- **musl Linux (Alpine)**: not built; Alpine users use Docker. The Linux archives need glibc 2.28+,
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

- None.
