# 188 — Node.js 26 as the target, each version tested once per risk

> Milestone: none (the runtime and CI, not a product feature) · Depends on: 001, 005, 034, 082, 084, 112 · Design: none · Contracts: none

## Goal

Node.js 26 has been Active LTS since October 2026. The [dependency policy](../../policies/dependencies.md)
§2 says the target moves to a new LTS "in its own pull request once CI passes on it". This feature
makes that move. Supported versions are then 22 (the minimum, until its end of life in April 2027),
24 and 26 (owner, 2026-11-20).

Adding a third version to CI the way 22 and 24 run today would mean three full test runs. `pnpm test`
takes 4–7 minutes per version on CI, measured on November's `ci.yml` runs, and most of that work
gives the same answer on every version. The owner wants no redundant runs across 22, 24 and 26
(2026-11-20). So this feature also says what each version is tested for, and runs only that.

The move also fixes a local trap. `.nvmrc` says `24`, and `nvm use` picks the newest installed 24.x.
That version may have no pnpm at all, or only Corepack's shim, which can't start pnpm 12. The
owner's `pnpm dev` failed this way on 2026-11-20. The setup steps in `CONTRIBUTING.md` already say
to install pnpm with npm for the Node version in use. Nothing changes there beyond the version.

## Scope

**In:**

- **The target moves to 26** everywhere the repository names it:
  - `.nvmrc`, and through it every workflow that reads `node-version-file: .nvmrc`;
  - the Docker base image (`node:26-trixie-slim`, pinned by digest);
  - the self-contained bundles' Node.js (`NODE_MAJOR` in `packages/repo-tools/src/bundle.js`, so
    the `.deb` and `.rpm` too);
  - the workflow that `rmk` writes for mirroring plugin feeds (`packages/cli/src/feed-workflow.ts`:
    `node-version: 26` on GitHub, `image: node:26` on GitLab);
  - the service checks on Linux (`setup-node` from `.nvmrc`) and macOS (Homebrew's Node.js of
    `.nvmrc`'s major: `node@N` when Homebrew knows that name, plain `node` otherwise, and the job
    stops when the installed major isn't `.nvmrc`'s; on 2026-11-20 `node@26` was an alias of
    Homebrew's `node`, 26.13.1);
  - the bundle and package jobs (`bundles.yml` and `packages.yml`, which read `.nvmrc` instead
    of naming a number).
- **The minimum isn't this feature's to change.** `engines`, `MIN_NODE`
  (`packages/server/src/node-version.ts`) and every "Node.js 22.14 or later" a person reads come
  from #315, which raised them from 22.12; `tsdown`'s `target: "node22"` and `@types/node` 22 stay
  as they are.
- **Each version is tested for what can differ on it** (the table below):
  - `ci.yml` has one job for the target and one for the minimum, and none for 24;
  - the minimum's job runs a new root script, `pnpm test:runtime`: the tests of the code that runs
    on a person's Node.js, without the component tests and the repository's own tooling;
  - the minimum's job runs exactly the version `MIN_NODE` names, not the newest 22.x: the newest
    hid that 22.12 and 22.13 can't open a database with `better-sqlite3` (below);
  - `server-checks.yml` installs and runs the packed server on the minimum and the target on Linux,
    macOS and Windows. Node.js 24 gets no job of its own (owner, 2026-11-20).
- **Role-based job names**, so the next LTS move changes only the versions, never the job names:
  "Lint, typecheck, test, build (target Node.js)" and "Runtime tests (minimum Node.js)". The matrix
  carries the version and its role (`role: target` / `role: minimum`), and the steps check the
  role, never a number.
- **A guard against drift:** a `repo-tools` test reads `.nvmrc` and fails when another place that
  names the target gives a different major. Those places are the `Dockerfile`'s base image,
  `NODE_MAJOR`, the feed workflow, and the `role: target` entries in `ci.yml` and
  `server-checks.yml`. Only those two workflows may test by version: any other `node-version`
  value or `node` matrix axis in `.github` fails it, so the rest read `.nvmrc`. It also fails when
  a `role: minimum` entry isn't exactly `MIN_NODE` (`22.14.0`, not `22`; task 7), and when a
  package's `engines` isn't `^MIN_NODE || >=MIN_NODE_23`, so npm warns where `rmk-server` refuses
  (the root and every published package must have it; a private one may leave it out).
  A form it can't read, such as a block-style axis, fails rather than passing.
- **A guard on native modules:** skipping 24 is safe only while every native module the server
  loads is N-API, one binary for every Node.js version. A `repo-tools` test walks
  `@ronneai/marketplace`'s runtime dependencies (dependencies, and optional and peer ones when
  installed) and fails on any `.node` file that doesn't register as an N-API module, by
  `napi_register_module_v1` or `napi_module_register`, or that registers per Node.js version
  (`node_register_module_v<ABI>`). It reads the symbol names in the binaries themselves, so it
  needs no list to keep up to date. Today they are `better-sqlite3`'s
  `prebuilds/<platform>.node` (13.x, `NAPI_VERSION=10`) and `@node-rs/argon2`'s platform package
  (napi-rs).
- **The documents that state the target or the CI split:**
  - `CLAUDE.md`, `CONTRIBUTING.md`, the dependency policy, MVP.md (Docker and Packages rows, and
    a §15 entry);
  - `docs/knowledge/test-runs.md` (a section on which Node.js version runs what) and
    `turbo-test-inputs.md`;
  - `docs/runbooks/release.md` and `docs/security/threat-model.md`;
  - `docs/spec/backup-format.md`'s scrypt `maxmem` line, if Node.js 26 is measured.

**Out:**

- Raising the minimum to 24: that happens when 22 reaches its end of life (April 2027), in its own
  change, as the policy says.
- Raising the minimum from 22.12 to 22.14, the fix for the crash below: a GitHub issue of its own
  (#315, `docs/issues/`), since it changes what released versions claim (owner, 2026-11-20). The
  minimum's job is pinned to `MIN_NODE` only after that fix (task 7), or it would fail on 22.12.
- Moving `@types/node` or `lib` (ES2023): they follow the minimum.
- The database, end-to-end, Windows client and image suites: they already run once, on `.nvmrc`'s
  version, and simply move to 26 with it.
- Old specs, witness records and knowledge notes that record what happened on Node 24: history,
  left as written.
- Branch protection's list of required checks: none of the jobs this feature renames is on it
  (below), so it doesn't change.

## Behaviour

### Which version runs what

The rule: **test the ends of the supported range, the minimum and 26, and nothing in between.**
JavaScript that runs on the minimum and on 26 runs on 24. A native module built per Node.js ABI
would be the exception, but the server's two native modules are N-API, one binary per platform for
every version (the probe, 2026-11-20), and a guard keeps it that way.

**The minimum is a version, not a line.** On 2026-11-20 the probe found that rmk-server crashes
(segfault, exit 139) on Node.js 22.12.0, the advertised minimum, and on 22.13, when it opens its
database: `better-sqlite3` 13.2.0 is built for N-API 10 (`NAPI_VERSION=10` in its `binding.gyp`), which Node.js has only from
22.14.0 (`NODE_API_SUPPORTED_VERSION_MAX` in 22.12.0's and 22.13.1's headers is 9). CI ran the
newest 22.x, so it never saw it. Testing "22" proves only the newest 22; the minimum's job runs
`MIN_NODE` itself.

| What can differ between Node.js versions | What catches it | Runs on |
|---|---|---|
| Code uses a JavaScript or Node.js API that `MIN_NODE` lacks | `pnpm typecheck` (`lib: ES2023`, `@types/node` 22), then `pnpm test:runtime` for what types can't see (a dependency that needs a newer Node.js, a changed default) | Typecheck on 26; `test:runtime` on **`MIN_NODE`** |
| Newer Node.js removed or changed something | `pnpm test` | **26** |
| A native module needs a newer N-API than the minimum has, or has no binary for an OS | `server-checks.yml`: install the packed server with npm, start it, set it up, sign in (`server-probe.js`) | **`MIN_NODE`** and **26**, on Linux, macOS and Windows |
| A native module built per ABI, so that 24 could differ | The N-API guard: none is allowed without a decision | The guard runs with the repo-tools tests, on 26 |
| The Node.js the server package carries links a system library a minimal Linux lacks (26's links `libatomic.so.1`, 24's didn't) | `packages.yml`: install the `.deb` and `.rpm` in clean Ubuntu 24.04, Debian 13 and Fedora 42 containers, which have only what the packages declare | **26** (the bundles carry the target), on x64 and arm64 |
| Component tests (`*.test.tsx`) | Their subject is markup, and its JavaScript is held to ES2023 by typecheck; the server probe renders real pages on `MIN_NODE` | **26** |
| The repository's own guards (`packages/repo-tools`), lint, typecheck, packing (`packages:check`, `release:smoke`) | They run in CI and development, never on a person's Node.js | **26** |
| Build output (`pnpm build`, `build:server`) | The same JavaScript whichever Node.js built it (`tsdown` targets node22); the packed server is then run on every version by `server-checks.yml` | **26** |

### `pnpm test:runtime`

Runs `turbo run test` for every package except `@ronneai/repo-tools`, and leaves out
`*.test.tsx`. The SQLite database tests stay in: they load `better-sqlite3` on that Node.js. The
script goes in `CONTRIBUTING.md`'s commands table. Locally it answers "does this still work on
22?" without the full suite. How the `.tsx` exclusion reaches both of `apps/web`'s Vitest projects
(`unit` and `db`) is the plan's first measurement: Vitest 5's `--exclude`, or a setting read by
`packages/config/vitest.js`.

### The CI jobs

| Workflow | Before | After |
|---|---|---|
| `ci.yml` | 22: test, build. 24: lint, typecheck, test, build, `build:server`, `packages:check`, `release:smoke` | **Target (26):** everything 24 ran. **Minimum (`MIN_NODE`):** `pnpm install`, `pnpm test:runtime` |
| `server-checks.yml` install | {22, 24} × {Linux, macOS, Windows}: 6 jobs | {`MIN_NODE`, 26} × {Linux, macOS, Windows}: 6 jobs |
| `server-checks.yml` services | Linux `node-version: 24`; macOS Homebrew `node@24` | Linux `.nvmrc`; macOS Homebrew's Node.js of `.nvmrc`'s major, checked |
| `bundles.yml`, `packages.yml` | `node-version: 24` | `node-version-file: .nvmrc` |
| `database.yml`, `e2e.yml`, `clients-windows.yml`, `image.yml`, `release.yml`, `nightly.yml` | `.nvmrc` (24) | `.nvmrc` (26), unchanged otherwise |

Nightly and release runs call the same workflows, so they get the same split.

### Required checks

Branch protection on `main` (read 2026-11-20) requires "Licenses and known vulnerabilities", the
two CodeQL "Analyze" jobs, the PR title's "check", the three "Database tests", "Docker image (build,
run, scan)" and "End-to-end (Chromium)". The `ci.yml` and `server-checks.yml` jobs this feature
renames aren't on the list, before or after, so nothing changes in GitHub's settings. If the owner
adds them later, the role-based names stay the same across LTS moves.

## Edge cases

- **A native module has no Node.js 26 binary yet.** `pnpm install` builds it from source (needs a
  C++ toolchain) or fails. The plan's first task installs and runs everything on 26 before anything
  changes. If that fails, the move waits, as the policy says ("once CI passes on it").
- **Intl or ICU output differs between versions** (a date or number formatted differently): only
  the minimum's runtime tests and the target's full tests see it. A test that pins such output must
  pass on both; the component tests, which print most formatted values, run on 26 only.
- **The new Node.js needs a system library the old one didn't.** Node.js 26's Linux binary links
  `libatomic.so.1`; 24's didn't, and a clean Ubuntu doesn't have it. The packages declare it
  (`libatomic1`, `libatomic.so.1()(64bit)`), so apt and dnf install it; the release notes name it for
  the Linux archives, which have no package manager behind them. #318's first CI run found it.
- **`.nvmrc` changes:** `ci-scope.js` already runs every suite when it changes, so the move's own
  pull request runs the image, the server package and the install scripts.
- **Someone develops on 22 or 24:** it works (`engines` allows it), but `pnpm test` there is
  untested in CI beyond `test:runtime`. `CONTRIBUTING.md` says to develop on `.nvmrc`'s version.
- **The guard and history:** it reads only the files listed under Scope, so specs and witness
  records that mention 24 don't fail it.
- **Node.js 22's end of life (April 2027):** the minimum role moves to 24 (`role: minimum`,
  `MIN_NODE`, `engines`, `@types/node`, the minimum's texts). The policy and `test-runs.md` say so.
- **A dependency raises its own floor** (a newer N-API, a newer `engines`): the minimum's jobs, on
  `MIN_NODE` itself, fail on the Dependabot pull request instead of on a person's machine.
- **A new native dependency** that isn't N-API: the N-API guard fails, naming the package and the
  file. The owner then decides how the versions between the minimum and the target get tested
  again.

## Documentation

- **Website** (ronne-web, branch `docs/marketplace-315-188-node`, shared with #315), en, pt and fr: it names the
  target in the home page's stack line ("Node.js 24"), the marketplace facts (`nodeRuntime.target`,
  shown as "Node.js 24 (22.14+ works)") and the contributor setup step ("You need Node.js 24 …");
  they say 26. `docs/product-facts.md`'s runtime row too. No topic changes, so `topics.ts` doesn't.
  (The first version of this spec said "None": the website never names the target. It does.)
- **In-app helpers:** none name a Node.js version.
- The bundles print their Node.js version when they run. The repository's own documents change as
  listed under Scope.

## Acceptance criteria

- [x] On Node.js 26, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm build`, `pnpm build:server`, `pnpm packages:check` and `pnpm release:smoke` pass, and
  `pnpm dev` starts.
- [x] `pnpm test:runtime` runs no `*.test.tsx` file and no `repo-tools` test, runs every other
  test file (the SQLite database tests included), and passes on `MIN_NODE` (22.14.0). It has a row in
  `CONTRIBUTING.md`'s commands.
- [x] `ci.yml` has two check jobs, named by role: the target runs everything the Node 24 job ran,
  and the minimum runs only `pnpm install` and `pnpm test:runtime`. No step condition names a
  version number.
- [x] `server-checks.yml` installs and runs the packed server on the minimum and 26 on all three
  OSes (6 jobs), with no Node.js 24 job. The service checks take the target from `.nvmrc`: Linux through `setup-node`, macOS through Homebrew, failing when Homebrew's major differs.
- [x] After the issue that raises the minimum to 22.14 (#315) lands, the minimum's entries in `ci.yml` and
  `server-checks.yml` are exactly `MIN_NODE`.
- [x] `.nvmrc` is `26`. The `Dockerfile` uses `node:26-trixie-slim` pinned by digest, and the
  image's `node --version` prints v26. `NODE_MAJOR` is 26, and `bundle.js` fetches and verifies a
  Node.js 26 build. The feed workflow `rmk` writes uses Node.js 26, and its golden files match.
- [x] `bundles.yml` and `packages.yml` read `.nvmrc`.
- [x] The drift guard passes, and fails when any one of the places it checks names a different
  major than `.nvmrc`, a minimum entry isn't exactly `MIN_NODE`, or a package's `engines` isn't
  `MIN_NODE` and `MIN_NODE_23`.
- [x] The N-API guard passes, finds both of the server's native modules, and fails on a `.node`
  file that doesn't register as N-API or that registers per Node.js version.
- [x] `tsdown`'s target and `@types/node` are unchanged; `engines`, `MIN_NODE` and the "22.14 or
  later" texts are #315's.
- [x] `CLAUDE.md`, `CONTRIBUTING.md`, the dependency policy, MVP.md (with a §15 entry),
  `release.md` and `threat-model.md` state the 26 target and the CI split as built, `test-runs.md`
  states the split and takes the target from `.nvmrc`, `turbo-test-inputs.md` keeps its dated
  history, and nothing outside history still calls 24 the target.
- [x] The website says Node.js 26 wherever it named 24 as the target, in en, pt and fr.
- [x] No required check on `main` changes name: the renamed jobs aren't on branch protection's
  list.
- [ ] The `.deb` and `.rpm` depend on libatomic (`libatomic1`, `libatomic.so.1()(64bit)`), the
  release notes name it for the Linux archives, and `packages.yml` installs both packages on x64
  and arm64, after checking that each newly built package declares exactly glibc 2.34, GCC 11's libstdc++
  and libatomic, and provides nothing but itself.

## Open questions

- None.
