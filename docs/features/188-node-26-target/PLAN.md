# 188 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

Probe first, change after. Nothing moves to 26 until everything is shown to work there. The CI split
comes before the version move, so the move's pull request already runs the new jobs.

## Tasks

- [x] **1. Probe Node.js 26 before changing anything.** With the newest Node.js 26 and pnpm
  installed by npm (not Corepack), on a clean `node_modules`, run:
  - `pnpm install --frozen-lockfile`;
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`;
  - `pnpm build:server`, `pnpm packages:check`, `pnpm release:smoke`;
  - `pnpm dev` until the setup screen loads.

  Record in Notes whether `better-sqlite3` got a prebuilt binary or built from source, and how long
  the backup scrypt tests took (`docs/spec/backup-format.md`'s `maxmem` line). If anything fails,
  stop and report to the owner; don't work around it.
  *Done when:* every command above passed on Node.js 26 with no repository change, and Notes record
  the Node.js version, the `better-sqlite3` result and the timings.

- [x] **2. `pnpm test:runtime`.** A root script that runs every package's tests except
  `@ronneai/repo-tools`, leaving out `*.test.tsx`. Measure how the exclusion reaches both `apps/web`
  Vitest projects: Vitest 5's `--exclude` through `turbo run test -- …` first, a setting read by
  `packages/config/vitest.js` if that doesn't work. Add its row to `CONTRIBUTING.md`'s commands.
  *Done when:*
  - on Node.js 22, `pnpm test:runtime` passes;
  - Vitest's file list has no `.test.tsx` and no `repo-tools` file, and every other test file
    (`*.db.test.ts` on SQLite included) is in it;
  - `pnpm docs:check` passes;
  - Notes record its time against `pnpm test` on the same machine.

- [x] **3. The CI split by role.**
  - `ci.yml`'s matrix becomes `include: [{node: 22, role: minimum}, {node: 26, role: target}]`.
    Steps check `matrix.role`, never a number. The target runs what the Node 24 job ran, and the
    minimum runs `pnpm install --frozen-lockfile` and `pnpm test:runtime`. The job names are
    "Lint, typecheck, test, build (target Node.js)" and "Runtime tests (minimum Node.js)".
  - `server-checks.yml`'s install matrix is the minimum and the target on every OS, each entry with
    its role, and no Node.js 24 entry.
  - Keep the turbo cache key per Node.js version, and update the comments.

  This task leaves `.nvmrc` at 24, so the target entry is 24 for now and becomes 26 in task 4.
  *Done when:* both workflows parse (`actionlint` if installed, otherwise a YAML parse), no `if:`
  names a Node.js version, the target job has every step the old Node 24 job had, and the install
  matrix expands to 6 jobs.

- [x] **4. Move the target to 26.**
  - `.nvmrc` becomes `26`.
  - The `Dockerfile` uses `node:26-trixie-slim@sha256:…`: the current multi-arch index digest from
    Docker Hub, with its comment.
  - `bundle.js` sets `NODE_MAJOR = 26`, with its comments. `bundle.test.js` changes only where a
    test depends on the target.
  - `feed-workflow.ts` uses `node-version: 26` and `image: node:26`, with its golden files and
    `feed-workflow.test.ts`.
  - The target entries in `ci.yml` and `server-checks.yml` become 26.
  - The service checks read `.nvmrc`: `setup-node` on Linux, and on macOS Homebrew's `node@N` if
    Homebrew knows that name, else `node`, stopping when the installed major isn't `.nvmrc`'s.
    Today `node@26` is an alias of Homebrew's `node` (26.13.1).
  - `bundles.yml` and `packages.yml` use `node-version-file: .nvmrc`, with `.nvmrc` in their
    sparse checkouts.

  *Done when:*
  - `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass on Node.js 26;
  - `docker build .` succeeds, and `node --version` in the image prints v26;
  - `node packages/repo-tools/src/bundle.js` on a packed tarball fetches a Node.js 26 build that
    matches `SHASUMS256.txt`;
  - the feed workflow golden tests pass.

- [ ] **5. The drift guard and the N-API guard.** A `repo-tools` test reads `.nvmrc` and checks
  that these name the same major:
  - the `Dockerfile`'s `FROM node:N-…`;
  - `NODE_MAJOR` in `bundle.js`;
  - `feed-workflow.ts`'s `node-version` and `image`;
  - every `setup-node` outside the two role matrices uses `node-version-file: .nvmrc`, not a
    number;
  - the `role: target` entries in `ci.yml` and `server-checks.yml`.

  It also checks the `role: minimum` entries in `ci.yml` and `server-checks.yml` against
  `MIN_NODE`: the same major until task 7, then exactly the same version. Each mismatch names the
  file and both versions.

  A second test lists the native packages in `@ronneai/marketplace`'s runtime dependency tree
  (`binding.gyp`, `"gypfile": true`, a `.node` file, or napi-rs's `"napi"` field) and fails on one
  that isn't in its list of N-API modules. Each entry says how it was checked: `better-sqlite3`
  has `NAPI_VERSION` in `binding.gyp` and `prebuilds/<platform>.node`, and `@node-rs/argon2` is
  napi-rs.
  *Done when:*
  - the repo-tools tests pass;
  - changing any one of the drift guard's places to another major (tried for each, then put back)
    makes it fail with that file's name;
  - removing `better-sqlite3` from the N-API list makes the second test fail, naming it.

- [ ] **6. The documents.**
  - `CLAUDE.md`'s Commands (the Node.js line and the CI paragraph) and the dependencies bullet.
  - `CONTRIBUTING.md`'s requirements (develop on `.nvmrc`'s version; the packages run on 22.12 or
    later) and its CI paragraph.
  - The dependency policy §2: target 26; after 22's end of life the minimum moves to 24; a line
    pointing to `test-runs.md` for what each version runs. Also its bundled-Node.js row.
  - MVP.md: the Docker and Packages rows, and a §15 entry dated 2026-11-20.
  - `docs/knowledge/test-runs.md`: a section, "Which Node.js version runs what", with SPEC.md's
    table and rule, replacing the Node 22/24 bullets.
  - `turbo-test-inputs.md`'s "Node 22 and 24" line, if it states the current CI rather than history.
  - `docs/runbooks/release.md`'s bundle Node.js check and install line.
  - `docs/security/threat-model.md`'s image row.
  - `backup-format.md`'s `maxmem` line, if task 1 measured 26.

  *Done when:* `pnpm docs:check` passes. The `git grep` for "Node 24", "Node.js 24", "node:24",
  "node@24" and "node-version: 24" turns up only history (old specs, witness records, dated
  knowledge notes), test fixtures, and the "then the minimum moves to 24" line. Every changed
  statement matches the workflows and files from tasks 3–5.

- [ ] **7. Pin the minimum's jobs to `MIN_NODE`.** Waits for the issue that raises the minimum to
  22.14 (owner, 2026-11-20). Once it has landed, the `role: minimum` entries in `ci.yml` and
  `server-checks.yml` name `MIN_NODE`'s exact version, and the drift guard checks the exact version.
  *Done when:*
  - the drift guard fails if a minimum entry is `22` or any version other than `MIN_NODE`;
  - on the exact `MIN_NODE` build from nodejs.org, `pnpm test:runtime` passes and
    `require("better-sqlite3")` opens a database;
  - on 22.13.1 the same `require` crashes, which shows the pin is what catches it.

- [ ] **8. Finish.** Set 188's status in `docs/features/README.md`. Check SPEC.md's acceptance
  criteria against what was built, and tick them. Write in the pull request's description the
  required checks to swap:
  - remove "Lint, typecheck, test, build (Node 22)" and "(Node 24)";
  - add "Lint, typecheck, test, build (target Node.js)" and "Runtime tests (minimum Node.js)".

  *Done when:* `pnpm witness:check` and `pnpm docs:check` pass, every acceptance criterion is
  ticked with a witness pass behind it, and the description text is in Notes for the owner.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

**Task 1, the probe (2026-11-20, macOS 27.2 on Apple silicon, Node.js v26.13.1, the newest 26
LTS; pnpm 12.21.0 installed with npm, which runs the pinned 12.6.0).**
- Every `node_modules` was deleted, then `pnpm install --frozen-lockfile` ran in 4.7 s.
- On Node.js 26 with no repository change, and with Turbo's `--force` so nothing came from the
  cache:
  - `pnpm lint` passed (Biome takes no `--force`, so it ran without it);
  - `pnpm typecheck --force` passed (2 s);
  - `pnpm test --force` passed (79 s, 629 test files across six packages; `crypto.test.ts`, the
    scrypt `maxmem` tests, 9 passed in 14 s);
  - `pnpm build --force` passed (6 s);
  - `pnpm build:server`, `pnpm packages:check` and `pnpm release:smoke` passed;
  - `next dev -p 3188`, run from `apps/web`, answered 200 within 4 s (this clone is set up, so the
    sign-in page loaded). `pnpm dev` runs the same through Turbo, which doesn't pass `PORT` on,
    so it always binds 3000; `next dev -p` is the way to choose a port.
  - `next dev` rewrote `apps/web/AGENTS.md`, Next.js's managed agent-rules block: its first heading
    went from `#` to `##`. That isn't part of any task, so it was reverted. Check `git status`
    after running the dev server.
- `better-sqlite3` 13.2.0 is N-API (`NAPI_VERSION=10`, `napi_register_module_v1`), and its
  `prebuilds/<platform>.node` serves every Node.js version. There is no per-ABI binary, and
  GitHub's release has none for ABI 147. `@node-rs/argon2` is napi-rs. So there is no per-version
  native risk, and Node.js 24 needs no job (the spec changed; owner, 2026-11-20).
- **Found:** `require("better-sqlite3")` segfaults (exit 139) on Node.js 22.11.0 and on the
  official 22.12.0 build (checked against `SHASUMS256.txt`); 22.23.2 works. Node.js has N-API 10
  only from 22.14.0, according to `NODE_API_SUPPORTED_VERSION_MAX` in the 22.12.0, 22.13.1 and
  22.14.0 headers. The advertised minimum, 22.12, is wrong for rmk-server. It's a separate issue
  (owner); task 7 waits on it.
- The pnpm under every installed Node.js was Corepack's shim, which can't start pnpm 12. That's
  the cause of the `pnpm dev` failure that started this feature. `corepack disable pnpm`, then
  `npm install --global pnpm`, fixed it under 26.

**Task 2, `pnpm test:runtime` (2026-11-20).**
- Vitest 5's CLI `--exclude` doesn't reach `apps/web`'s projects: `vitest list --filesOnly`
  gave the same 523 files with and without `--exclude '**/*.test.tsx'`. Instead,
  `apps/web/vitest.config.ts` reads `RONNE_TEST_SCOPE=runtime` and adds `**/*.test.tsx` to both
  projects' `exclude`. The db project gets it too, so a future `*.db.test.tsx` can't slip in.
  `turbo.json` lists the variable in the test task's `env`, so a runtime run and a full run never
  share a cached result.
- `vitest list --filesOnly` with the variable lists 383 files: exactly the full 523 less the 140
  `.tsx` files. All 199 `*.db.test.ts` and 184 unit `.ts` files stay in.
- On Node.js 22.23.2 (M-series Mac, `--force`), `pnpm test:runtime` passed in 74 s (7 tasks,
  web 383 files) and `pnpm test` in 83 s (8 tasks, web 523 files). The trim saves only about
  10%: the component tests are cheap, and the time is in the database and server tests, which the
  minimum has to run. The minimum job's real saving is everything else it no longer runs (lint,
  typecheck, `pnpm build`), and there's no third version's job at all.

**Task 3, the CI split (2026-11-20).**
- `ci.yml`'s matrix is two `include` entries, each with `node`, `role` and `name`. The job's
  name is `${{ matrix.name }}`, which is why the name lives in the matrix: an expression choosing
  it from the role would work too, but would put the check names in an expression.
- `server-checks.yml` keeps `node: [22, 24]` crossed with the OSes, and `include` adds `role` to
  the combinations that match. That's 6 jobs. Two lists name the versions, the matrix and the
  include, and task 5's guard checks they agree.
- `actionlint` isn't installed here. The workflows were parsed with the repository's `yaml` package,
  and the matrices expanded as GitHub does (an `include` entry matches only the original
  combinations, else it becomes a job of its own):
  - `ci.yml` → minimum 22 and target 24;
  - `server-checks.yml` → {ubuntu, macos, windows} × {22 minimum, 24 target}.
  - No step `if:` names a version. The old Node 24 job ran lint, typecheck, test, build,
    `build:server`, `packages:check` and `release:smoke`, and the target job runs the same.
- The target stays 24 until task 4 moves it.

**Task 4, the move to 26 (2026-11-20).**
- The Docker base is `node:26-trixie-slim` at the multi-arch index digest
  `sha256:e6bedef2…20bc` (`docker buildx imagetools inspect`, built 2026-11-11).
  `docker build .` passed, and in the image `node --version` → v26.13.1, with `better-sqlite3`
  loading (SQLite 3.54.1).
- `bundle.js` on a freshly packed `@ronneai/marketplace` 0.8.0 fetched
  `node-v26.13.1-darwin-arm64.tar.gz`, and it matched `SHASUMS256.txt`.
- `bundle-smoke.js` first failed: its `--version` check had `Node\.js 24` in a regular expression,
  which the plan's search (`Node.js 24`, `node:24`, `node@24`, `node-version: 24`) didn't match. It
  now builds the expression from `bundle.js`'s `NODE_MAJOR`. The smoke test then passed: no Node
  on PATH, `--version`, setup, sign-in, revoke, rotate, backup, restore.
- Homebrew's `node` is 26.13.1, and `node@26` is an alias of it (`brew info --formula node@26` →
  "Aliases: node.js, node@26, nodejs, npm"). formulae.brew.sh's API has no page for an alias,
  which first made it look missing: the witness found the alias. When Node.js 27 becomes `node`,
  `node@26` will be a formula of its own. So the macOS service step reads `.nvmrc`, installs
  `node@N` when Homebrew knows the name and `node` otherwise, and stops when the installed major
  isn't `.nvmrc`'s. It strips whitespace and CR from `.nvmrc`, so a stray CR can't make the error
  read "Node.js 26, but .nvmrc says 26". With real Homebrew today, `.nvmrc` at 26 installs
  `node@26`, the alias, and at 24 installs `node@24` (24.22.3, its own formula); both pass the
  check. The fallback and the stop were tried in a dry run with `brew info` made to fail: plain
  `node` was installed, and with `.nvmrc` at 24 the step stopped with "Homebrew's node is Node.js
  26, but .nvmrc says 24." The witness's fake-brew probe covers every branch.
  The Linux service job reads `.nvmrc` through `setup-node`; a cone-mode sparse checkout always has
  the root's files.
- `bundles.yml` and `packages.yml` read `.nvmrc`, added to their non-cone sparse checkouts as
  `/.nvmrc`.
- `bundle.test.js`'s fixtures pass 24 to `latestOf` themselves and don't depend on the target, so
  they stay.

