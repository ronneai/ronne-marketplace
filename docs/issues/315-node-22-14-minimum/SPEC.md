# #315 — The minimum Node.js is 22.14, where rmk-server's database driver loads

> GitHub: [#315](https://github.com/ronneai/ronne-marketplace/issues/315) · Feature:
> [082](../../features/082-server-npm-package/SPEC.md)'s `MIN_NODE`, with
> [001](../../features/001-monorepo-scaffold/SPEC.md)'s `engines` · Reported on: every release
> of the server, 0.3.0–0.7.0, found while building [188](../../features/188-node-26-target/SPEC.md)

## Report

- `rmk-server` crashes on Node.js 22.12 and 22.13 with a segmentation fault (exit 139) and no
  message. Both are versions the packages say they support: `engines` is `>=22.12` in every
  package, and `MIN_NODE` (`packages/server/src/node-version.ts`) is `22.12.0`.
- **Why:** `better-sqlite3` is built for N-API 10 (`NAPI_VERSION=10` in `binding.gyp`): 13.0.3,
  which every release from 0.3.0 to 0.7.0 ships, and 13.2.0 on `main`. Node.js has N-API 10
  only from 22.14.0: `process.versions.napi` is 9 on 22.12.0 and 22.13.1. The `MIN_NODE` check
  passes there, so the server starts, then segfaults when it loads the driver.
- **Measured** on the official `darwin-arm64` builds, each checked against nodejs.org's
  `SHASUMS256.txt` (2026-11-20):
  - 13.2.0: `require("better-sqlite3")` exits 139 on 22.11.0, 22.12.0 and 22.13.1. On 22.14.0
    (N-API 10) it opens a database and `@node-rs/argon2` hashes; 22.23.2 and 26.13.1 work too.
  - 13.0.3, installed with 22.12.0's npm: exits 139 on 22.12.0 and 22.13.1, opens a database on
    22.14.0.
- **Why CI missed it:** `actions/setup-node` with `node-version: 22` installs the newest 22.x, so
  CI never ran the minimum it advertises. Feature 188's task 7 pins the minimum's jobs to
  `MIN_NODE` once this is fixed.

## Goal

The advertised minimum is a version Ronne runs on. Node.js 22.12 and 22.13 get the clear "Node.js
22.14.0 or later is needed" message from `rmk-server`, and an `engines` warning from npm, instead of
a crash.

## Scope

**In:**
- **`MIN_NODE` is `22.14.0`**, and its test says so: 22.13.x is too old, 22.14.0 isn't. The test
  also reads the package's own `engines` and checks it's `>=` `MIN_NODE`'s major and minor, so the
  two can't drift apart again.
- **`engines` is `>=22.14`** in the root `package.json` and in `@ronneai/core`, `@ronneai/rmk`,
  `@ronneai/mcp` and `@ronneai/marketplace` (Decisions 1).
- **Every text that names the minimum** says 22.14:
  - `rmk-server --help`'s first line (`cli.ts`);
  - the web app's sign-in-from-`rmk` hint (`step1Hint`, `common.json`), in en, pt and fr;
  - `install.sh`'s line for systems without a package;
  - the release notes' npm line (`release.yml`);
  - `README.md`, the package READMEs (`core`, `cli`, `mcp`, `server`), `CONTRIBUTING.md`'s
    requirements, and `docs/runbooks/install.md`.
- **The policy names the minimum's version:** `docs/policies/dependencies.md` §2, MVP.md §5
  ("Supported runtimes") and a §15 decision-log row, and `CLAUDE.md`'s dependency line.
- **The website** (ronne-web): every page and message that says 22.12.

**Out:**
- CI running the exact minimum: feature 188's task 7, which waits for this.
- The Node.js 26 target, which is 188's.
- `tsdown`'s `target: "node22"` and `@types/node` 22: the language level and the types are the 22
  line's, and don't change between 22.12 and 22.14.
- Old specs, plans and witness records that say 22.12: history, left as written.

## Behaviour

| Node.js | npm installs a package | `rmk-server` |
|---|---|---|
| 20 or older, 22.0–22.13 | warns `EBADENGINE` (`engines` `>=22.14`) | exits 1: "Node.js 22.14.0 or later is needed; this is 22.13.1." |
| 22.14.0 or later | no warning | starts |

`rmk`, `rmk-mcp` and `@ronneai/core` have no native module and no check of their own; they get the
`engines` warning only, as before.

## Edge cases

- **A person already on 22.12 or 22.13 with an older release installed:** every release since
  0.3.0 crashes there today (13.0.3, measured), so nothing that worked stops working. The next release says why and what to install.
- **The version check runs before the driver loads:** `run.ts` checks `nodeTooOld` before it
  imports the web app, which is what loads `better-sqlite3`. Checked on 22.13.1 with the packed
  server: the message, exit 1, no crash.
- **`--version` and `--help`** run before the check, as they do today, and load nothing native.

## Documentation

- **Website** (ronne-web, branch `bugfix/marketplace-315-node-22-14`), en, pt and fr:
  - `install` (the `npx` section and the Windows terminal section);
  - `rmk` and `mcp` (installing them);
  - the messages that say 22.12 (the home page's "Run it" step and the marketplace facts);
  - `marketplace.ts`'s `nodeRuntime.minimum`.
  No topic or section is added or renamed, so `topics.ts` doesn't change.
- **In-app helpers:** none name a Node.js version. The one screen text that does is the `rmk`
  sign-in hint above.

## Acceptance criteria

- [ ] `MIN_NODE` is `22.14.0`; `nodeTooOld` is true for 22.13.1 and false for 22.14.0; the
  server's `engines` matches it (unit test).
- [ ] Every package's `engines` and every text above says 22.14; a search for `22.12` outside
  history and lockfiles finds nothing.
- [ ] On the official 22.13.1 build, the packed `rmk-server start` prints the message and exits 1;
  on 22.14.0 it starts and answers on its port.
- [ ] The website says 22.14 in en, pt and fr, and ronne-web's checks pass.

## Decisions

1. **One minimum for every package** (Claude): `rmk`, `rmk-mcp` and `@ronneai/core` would run on
   22.12, but the website, the READMEs and the release notes state one version for all of them,
   and 22.14.0 (February 2025) is older than any 22.x a person installs today. Two minimums would
   be one more thing to keep in step.
2. **22.14, not "the newest 22"** (Claude): the minimum is the oldest version that works, measured.
   A later better-sqlite3 that needs more raises it again, and 188's pinned CI job is what will
   notice.

## Open questions

None.
