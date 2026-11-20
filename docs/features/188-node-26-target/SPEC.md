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
  - the Homebrew service check (`node@26`);
  - the bundle and package jobs (`bundles.yml` and `packages.yml`, which read `.nvmrc` instead
    of naming a number).
- **The minimum stays 22.12.** `engines`, `MIN_NODE` (`packages/server/src/node-version.ts`),
  `tsdown`'s `target: "node22"`, `@types/node` 22, and every "Node.js 22.12 or later" a person
  reads (the READMEs, `install.md`, the setup screen's `step1Hint`) stay as they are.
- **Each version is tested for what can differ on it** (the table below):
  - `ci.yml` has one job for the target and one for the minimum, and none for 24;
  - the minimum's job runs a new root script, `pnpm test:runtime`: the tests of the code that runs
    on a person's Node.js, without the component tests and the repository's own tooling;
  - `server-checks.yml` installs and runs the packed server on 22 and 26 on Linux, macOS and
    Windows, and on 24 on Linux.
- **Role-based job names**, so the next LTS move doesn't change the required checks again:
  "Lint, typecheck, test, build (target Node.js)" and "Runtime tests (minimum Node.js)". The matrix
  carries the version and its role (`role: target` / `role: minimum`), and the steps check the
  role, never a number.
- **A guard against drift:** a `repo-tools` test reads `.nvmrc` and fails when another place that
  names the target gives a different major. Those places are the `Dockerfile`'s base image,
  `NODE_MAJOR`, the feed workflow, the Homebrew formula, and the `role: target` entries in
  `ci.yml` and `server-checks.yml`.
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
- Moving `@types/node` or `lib` (ES2023): they follow the minimum.
- The database, end-to-end, Windows client and image suites: they already run once, on `.nvmrc`'s
  version, and simply move to 26 with it.
- Old specs, witness records and knowledge notes that record what happened on Node 24: history,
  left as written.
- Branch protection's list of required checks: the owner changes it in GitHub's settings (the
  names are below). This feature only says what to change.

## Behaviour

### Which version runs what

The rule: **test the ends of the supported range, 22 and 26, and the middle only where native
code makes each version different.** JavaScript that runs on 22 and on 26 runs on 24. A native
module's prebuilt binary is the exception, because it is built per Node.js ABI, OS and
architecture.

| What can differ between Node.js versions | What catches it | Runs on |
|---|---|---|
| Code uses a JavaScript or Node.js API that 22 lacks | `pnpm typecheck` (`lib: ES2023`, `@types/node` 22), then `pnpm test:runtime` for what types can't see (a dependency that needs a newer Node.js, a changed default) | Typecheck on 26; `test:runtime` on **22** |
| Newer Node.js removed or changed something | `pnpm test` | **26** |
| `better-sqlite3` has no prebuilt binary for a version's ABI on an OS (`@node-rs/argon2` is N-API, one binary for all) | `server-checks.yml`: install the packed server with npm, start it, set it up, sign in (`server-probe.js`) | 22 and 26 on Linux, macOS and Windows; **24 on Linux** |
| Component tests (`*.test.tsx`) | Their subject is markup, and its JavaScript is held to ES2023 by typecheck; the server probe renders real pages on 22 | **26** |
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
| `ci.yml` | 22: test, build. 24: lint, typecheck, test, build, `build:server`, `packages:check`, `release:smoke` | **Target (26):** everything 24 ran. **Minimum (22):** `pnpm install`, `pnpm test:runtime` |
| `server-checks.yml` install | {22, 24} × {Linux, macOS, Windows}: 6 jobs | {22, 26} × {Linux, macOS, Windows} + 24 on Linux: 7 jobs |
| `server-checks.yml` services | Homebrew `node@24` | Homebrew `node@26` |
| `bundles.yml`, `packages.yml` | `node-version: 24` | `node-version-file: .nvmrc` |
| `database.yml`, `e2e.yml`, `clients-windows.yml`, `image.yml`, `release.yml`, `nightly.yml` | `.nvmrc` (24) | `.nvmrc` (26), unchanged otherwise |

Nightly and release runs call the same workflows, so they get the same split.

### Required checks

Branch protection on `main` today requires "Lint, typecheck, test, build (Node 22)" and
"Lint, typecheck, test, build (Node 24)". After this feature they are "Lint, typecheck, test, build
(target Node.js)" and "Runtime tests (minimum Node.js)". The owner swaps them in GitHub's settings
when the pull request opens. Until then the old names never report, and the pull request waits.
Later LTS moves keep these names.

## Edge cases

- **A native module has no Node.js 26 binary yet.** `pnpm install` builds it from source (needs a
  C++ toolchain) or fails. The plan's first task installs and runs everything on 26 before anything
  changes. If that fails, the move waits, as the policy says ("once CI passes on it").
- **Intl or ICU output differs between versions** (a date or number formatted differently): only
  the minimum's runtime tests and the target's full tests see it. A test that pins such output must
  pass on both; the component tests, which print most formatted values, run on 26 only.
- **`.nvmrc` changes:** `ci-scope.js` already runs every suite when it changes, so the move's own
  pull request runs the image, the server package and the install scripts.
- **Someone develops on 22 or 24:** it works (`engines` allows it), but `pnpm test` there is
  untested in CI beyond `test:runtime`. `CONTRIBUTING.md` says to develop on `.nvmrc`'s version.
- **The guard and history:** it reads only the files listed under Scope, so specs and witness
  records that mention 24 don't fail it.
- **Node.js 22's end of life (April 2027):** the minimum role moves to 24 (`role: minimum`,
  `MIN_NODE`, `engines`, `@types/node`, the 22.12 texts), and the install matrix's middle entry goes
  away until the next LTS. The policy and `test-runs.md` say so.

## Documentation

None on the website or in the in-app helpers. They give only the minimum (Node.js 22.12), which
doesn't change. The website never names the target, and the bundles print their Node.js version
when they run. The repository's own documents change as listed under Scope.

## Acceptance criteria

- [ ] On Node.js 26, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm build`, `pnpm build:server`, `pnpm packages:check` and `pnpm release:smoke` pass, and
  `pnpm dev` starts.
- [ ] `pnpm test:runtime` runs no `*.test.tsx` file and no `repo-tools` test, runs every other
  test file (the SQLite database tests included), and passes on Node.js 22. It has a row in
  `CONTRIBUTING.md`'s commands.
- [ ] `ci.yml` has two check jobs, named by role: the target runs everything the Node 24 job ran,
  and the minimum runs only `pnpm install` and `pnpm test:runtime`. No step condition names a
  version number.
- [ ] `server-checks.yml` installs and runs the packed server on 22 and 26 on all three OSes and on
  24 on Linux. The service check uses Homebrew's `node@26`.
- [ ] `.nvmrc` is `26`. The `Dockerfile` uses `node:26-trixie-slim` pinned by digest, and the
  image's `node --version` prints v26. `NODE_MAJOR` is 26, and `bundle.js` fetches and verifies a
  Node.js 26 build. The feed workflow `rmk` writes uses Node.js 26, and its golden files match.
- [ ] `bundles.yml` and `packages.yml` read `.nvmrc`.
- [ ] The guard test passes, and fails when any one of the places it checks names a different
  major than `.nvmrc`.
- [ ] `engines`, `MIN_NODE`, `tsdown`'s target, `@types/node` and the "22.12 or later" texts are
  unchanged.
- [ ] `CLAUDE.md`, `CONTRIBUTING.md`, the dependency policy, MVP.md (with a §15 entry),
  `test-runs.md`, `turbo-test-inputs.md`, `release.md` and `threat-model.md` state the 26 target
  and the CI split as built, and nothing outside history still calls 24 the target.
- [ ] The pull request's description lists the old and new required check names for the owner to
  swap.

## Open questions

- None.
