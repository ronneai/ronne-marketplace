# #315 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — The minimum is 22.14

Witnessed: 2026-11-20 15:44 EST, by a fresh agent (blind). Commit: cd426c56 + working tree (`git diff`, 13 files). Machine: macOS 27.2.1 (darwin-arm64), Node v26.13.1 (tests); official Node v22.13.1 and v22.14.0 builds (packed server).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `MIN_NODE` is `22.14.0` | no | confirmed | `packages/server/src/node-version.ts:3`; the built `dist/node-version.js` and the packed tarball's say the same |
| 2 | `node-version.test.ts` checks 22.13.x is too old and 22.14.0 isn't, and fails without the fix | no | confirmed | `node-version.test.ts:8-9`. Scratch copy with `MIN_NODE = "22.12.0"` → 2 failed |
| 3 | The test reads the package's own `engines` and checks it matches `MIN_NODE` | no | confirmed | `node-version.test.ts:12-17`. Scratch copy with `engines` `>=22.12` → `expected '>=22.12' to be '>=22.14'`, 1 failed |
| 4 | `engines` is `>=22.14` in the root and the four packages | no | confirmed | Read with node: root, `@ronneai/core`, `rmk`, `mcp`, `marketplace` → `>=22.14`; `git ls-files` finds no other `engines`. The packed tarball carries it |
| 5 | `rmk-server --help` says 22.14 | no | confirmed | `cli.ts:136`. Packed install on 22.13.1: `--help` first line says "(Node.js 22.14 or later)"; `--help` and `--version` still run before the check |
| 6 | `step1Hint` says 22.14 in en, pt and fr | no | confirmed | `cliAuth.step1Hint` in each `common.json`; the `<readme>` tag kept; used at `CliAuthPanel.tsx:70` |
| 7 | `install.sh` and the release notes' line say 22.14 | no | confirmed | `install.sh:216`, `sh -n` ok; `release.yml:445`. Outside history and lockfiles, 22.12 is left only in task 2's docs |
| 8 | `pnpm --filter @ronneai/marketplace test` passes | no | confirmed | 15 files, 117 tests passed |
| 9 | The web app's message tests pass | no | confirmed | parity, messages and english-fragments tests → 3 files, 60 tests passed |
| 10 | On official 22.13.1, the packed `rmk-server start` prints the message and exits 1, with no crash | no | confirmed | Build checked against SHASUMS256.txt, `napi=9`. npm warns `EBADENGINE`. `start --no-open --port 17913` → "rmk-server: Node.js 22.14.0 or later is needed; this is 22.13.1.", exit 1, data folder empty; `setup --yes` the same. Control with `MIN_NODE` patched to 22.12.0: `setup --yes` → exit 139, no output |
| 11 | The check runs before the web app (and better-sqlite3) loads | no | confirmed | `run.ts:113-114` returns before `runService` and `importScript`; row 10's runs show it |
| 12 | On official 22.14.0, the packed `rmk-server start` answers on its port | no | confirmed | `napi=10`. `start --no-open --port 17914` → `/api/health` 503 `setup_required` after 2 s; stopped by PID. `server-probe.js` → exit 0: 43 migrations on SQLite, 200, token, revoke, rotate, backup, restore |

**Overall:** met: 22.13.1 is refused with the message and exit 1 instead of a segfault, 22.14.0 starts and passes CI's server probe, and the unit test catches drift in `MIN_NODE` or `engines`.

### Adversarial pass

Witnessed: 2026-11-20 15:39 EST, by a fresh agent (adversarial). Commit: cd426c56 + working tree (13 files). Machine: macOS 27 (Darwin 27.2.0, arm64), Node v26.13.1 for the tests; official Node.js 22.12.0, 22.13.1, 22.14.0, 23.5.0 and 23.6.0 darwin-arm64 builds for the packed server.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `MIN_NODE` is `22.14.0` | no | confirmed | `node-version.ts:3`; the packed `dist/node-version.js` the same |
| 2 | The test checks 22.13.x too old, 22.14.0 not, and fails without the fix | no | confirmed | Scratch copy with `MIN_NODE = "22.12.0"` → 2 failed; unmutated → 2 passed |
| 3 | The test checks `engines` matches | no | confirmed | Scratch copy with `>=22.12` → 1 failed |
| 4 | `engines` is `>=22.14` in five places, and npm enforces it | no | confirmed | 22.13.1's npm → `EBADENGINE` for core and marketplace; 22.14.0's npm → none |
| 5 | `--help` says 22.14; `--help` and `--version` work on old Node | no | confirmed | On 22.13.1 and 22.12.0: exit 0 for both |
| 6 | `step1Hint` says 22.14 in three languages | no | confirmed | `common.json:126` in en, pt, fr, placeholders unchanged |
| 7 | `install.sh` and the release notes say 22.14 | no | confirmed | `install.sh:216` (`bash -n` ok), `release.yml:445`; the release run itself not run |
| 8 | The server tests pass | no | confirmed | 15 files, 117 tests |
| 9 | The web app's message tests pass | no | confirmed | `vitest run src/i18n` → 20 files, 403 tests |
| 10 | On 22.13.1 the packed `start` prints the message and exits 1, no crash | no | confirmed | `start`, no arguments, `start --port 7999 --no-open` → exit 1 with the message; same on 22.12.0. Control: loading the driver on 22.13.1 → exit 139 |
| 11 | No other command loads native code before the check | no | confirmed | On 22.13.1 and 22.12.0, `service status/install/--help`, `migrate`, `backup`, `restore`, `setup`, `setup-code`, `reset-root-password` → exit 1 with the message. `dist/run.js` imports only builtins and local modules |
| 12 | On 22.14.0 the packed `start` answers on its port | no | confirmed | `server-probe.js` → exit 0, every step |
| 13 | 22.14.0 covers every native module and dependency the server loads | no | confirmed | Only argon2's and better-sqlite3's `.node` files; both work on 22.14.0. 22 `engines.node` ranges in the tree, none excludes 22.14.0. No post-22.14 JS API found. Only the darwin-arm64 prebuild was run |
| 14 | `nodeTooOld` is right at the 22.x edges | no | confirmed | 22.13.99, 22.13, 22, 21.99.0 → true; 22.14.0, 22.14, pre-release and nightly 22.14.0 → false; `"v22.13.1"` and `""` → false, harmless since `process.versions.node` has no `v` |
| 15 | Every Node.js the check and `engines` accept runs the server instead of crashing | no | not met | Node 23.0.0–23.5.0 have N-API 9 (23.6.0 has 10). Official 23.5.0: `nodeTooOld("23.5.0")` false, no `EBADENGINE`, `rmk-server setup --yes` → exit 139, no message |
| 16 | Nothing else states or enforces a 22.12 minimum in code, workflows, scripts or messages | no | confirmed | `git grep -E "22\.12\|22\.13"` outside history → only task 2's docs and the new comment and test |

**Overall:** not met: 22.12, 22.13 and 22.14 behave as the spec says, but Node 23.0.0–23.5.0 pass the check and `engines`, then crash with exit 139 and no message.

Fixed after this pass: `nodeTooOld` also refuses 23.x below 23.6.0 (`MIN_NODE_23`), with a message naming 23.6.0 there; `engines` is `^22.14.0 || >=23.6.0` (`ENGINES_NODE`) in all five places; the test covers both and the message; the spec's Report, Goal, Scope, Behaviour, acceptance criteria and Decisions 3 say so.

### Re-check — the whole task, after the 23.x fix

Witnessed: 2026-11-20 15:50 EST, by a fresh agent (adversarial). Commit: cd426c56 + working tree (16 files). Machine: macOS 27.2.1 (arm64), Node v26.13.1 (repo tools); official darwin-arm64 builds of v22.13.1, v22.14.0, v23.5.0 and v23.6.0 under test.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `MIN_NODE` is `22.14.0` and `MIN_NODE_23` is `23.6.0` | yes | confirmed | `node-version.ts:4,6`; the packed `dist/node-version.js` the same |
| 2 | `nodeTooOld` refuses 22.13.x and 23.0–23.5, accepts 22.14.0, 23.6.0 and later | yes | confirmed | `edges2.mjs` → true for 20.18.0, 21.0.0, 21.99.0, 22.0.0, 22.12.0, 22.13.1, 22.13.99, 23.0.0, 23.5.0, 23.5.99; false for 22.14.0, 22.23.2, 23.6.0, 23.11.1, 24, 25, 26.13.1, 27.0.0, 27.0.0-pre, 100.0.0. Malformed strings give false; `process.versions.node` never is one |
| 3 | The test checks the versions, the message and `engines`, and each check fails without its fix | no | confirmed | `mutate.sh` on a scratch copy: baseline 3 passed; no 23 branch → 1 failed; `MIN_NODE` 22.13 → 3; `MIN_NODE_23` 23.5 → 3; `engines` `>=22.14` → 1; one message for all → 1 |
| 4 | The server tests and the web app's message tests pass | no | confirmed | 15 files, 118 tests; apps/web parity, messages and english-fragments → 3 files, 60 tests |
| 5 | `engines` is `^22.14.0 \|\| >=23.6.0` in the root and the four packages | yes | confirmed | Every workspace `package.json`: those five have it, config, repo-tools and web have none; the packed tarballs carry it |
| 6 | npm's `engines` verdict matches the Behaviour table and `nodeTooOld` | yes | confirmed | Installs with each build's npm 10.9.2: 22.13.1 and 23.5.0 → 2 `Unsupported engine` warnings each; 22.14.0 and 23.6.0 → 0. npm's semver agrees with `nodeTooOld` on every release version; only RCs at the boundary (`22.14.0-rc.1`) differ |
| 7 | The 23.0–23.5 crash is closed: on 23.5.0 the packed `rmk-server` prints the 23 message and exits 1 | yes | confirmed | `old-node-cmds.sh` on 23.5.0: `start`, no command, `--port`, `migrate`, `backup`, `restore`, `setup`, `setup-code`, `reset-root-password` and every `service` form → exit 1, "Node.js 22.14.0 or later is needed, and on Node.js 23, 23.6.0 or later; this is 23.5.0.", data folder empty. Control: the driver load on 23.5.0 → exit 139 |
| 8 | On 22.13.1 the packed `start` prints "Node.js 22.14.0 or later is needed; this is 22.13.1." and exits 1 | yes | confirmed | Every command form above, exact text, exit 1; also on an instance set up by 22.14.0 (`start`, `migrate`, `setup-code`); `setup --yes` writes 0 files. Guard disabled in a scratch install → exit 139 |
| 9 | No command loads native code before the check; `--help` and `--version` load nothing native | no | confirmed | `run.ts:96-113`: platform, arguments, help, version, then `nodeTooOld`, then service and scripts. No better-sqlite3 or argon2 in the static imports; on 22.13.1 and 23.5.0 `--help` and `--version` exit 0 |
| 10 | On official 22.14.0 and 23.6.0 the packed `start` answers on its port | yes | confirmed | `server-probe.js` → exit 0 on both, 18 ✓ and 0 ✗ each; N-API 10, sqlite 3.54.1, argon2 verify true |
| 11 | `rmk-server --help` says 22.14 | no | confirmed | `cli.ts:136`; the packed `--help` first line |
| 12 | `step1Hint` says 22.14 in en, pt and fr | no | confirmed | `common.json:126` in each; parity tests pass |
| 13 | `install.sh` and the release notes' line say 22.14 | no | confirmed | `install.sh:216`, `release.yml:445`; elsewhere in code 22.12/22.13 appear only as test inputs and the comment |
| 14 | The builds are official and have the N-API levels the spec says | yes | confirmed | 22.13.1 and 23.5.0 tarballs match SHASUMS256.txt; `napi` 9, 10, 9, 10 for 22.13.1, 22.14.0, 23.5.0, 23.6.0 |
| 15 | (notes) Without the check, 22.13 starts in setup mode and crashes at setup | yes | confirmed | Guard disabled: `start --port 7961` answers 503 and stays up; `setup --yes` → exit 139, no output |
| 16 | (notes) `pnpm pack` refreshes `app/` and `THIRD_PARTY_NOTICES`, neither tracked | yes | confirmed | `git check-ignore -v` → `packages/server/.gitignore:2,4`; `git ls-files` lists neither; `git status` unchanged after packing |

**Overall:** met: 23.0–23.5 are refused before the driver loads, on every command, with a message naming 23.6.0; 22.13.1 gets the exact message; npm's `engines` warning matches the check on every release version; 22.14.0 and 23.6.0 pass CI's full server probe.
