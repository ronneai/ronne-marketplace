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

- [x] **5. The drift guard and the N-API guard.** A `repo-tools` test reads `.nvmrc` and checks
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

  A second test walks `@ronneai/marketplace`'s runtime dependency tree (dependencies, and optional
  and peer ones when installed) and fails on any `.node` file that isn't N-API.
  *Done when:*
  - the repo-tools tests pass;
  - changing any one of the drift guard's places to another major (tried for each, then put back)
    makes it fail with that file's name;
  - the second test finds `better-sqlite3`'s and `@node-rs/argon2`'s binaries in the real tree, and
    fails on a binary without the export, naming the package and the file.

- [x] **6. The documents.**
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

- [x] **7. Pin the minimum's jobs to `MIN_NODE`.** Built on #315 (owner, 2026-11-20): this branch
  is rebased onto `bugfix/315-node-22-14-minimum`, which merges first. The `role: minimum` entries
  in `ci.yml` and `server-checks.yml` name `MIN_NODE`'s exact version, and the drift guard checks
  the exact version and that every package's `engines` is `^MIN_NODE || >=MIN_NODE_23`.
  *Done when:*
  - the drift guard fails if a minimum entry is `22` or any version other than `MIN_NODE`, or a
    package's `engines` differs;
  - on the exact `MIN_NODE` build from nodejs.org, `pnpm install --frozen-lockfile` and
    `pnpm test:runtime` pass, and `better-sqlite3` opens a database;
  - on 22.13.1 opening a database crashes, which shows the pin is what catches it.

- [x] **8. The website.** The Documentation section was wrong: the website names the target. In
  ronne-web, branch `docs/marketplace-315-188-node`, after #315's change (`486a25a`): the stack line on the home
  page, the marketplace facts' `nodeRuntime.target`, the contributor setup step, and
  `docs/product-facts.md`'s runtime row say 26, in en, pt and fr. *Done when:* a search for
  "Node.js 24" and `target: "24"` in `www/src` and `www/messages` finds nothing, and ronne-web's
  checks pass.

- [x] **9. Finish.** Set 188's status in `docs/features/README.md`. Check SPEC.md's acceptance
  criteria against what was built, and tick them. Read branch protection's required checks on
  `main` again and confirm none of the renamed jobs is on it (it wasn't on 2026-11-20).

  *Done when:* `pnpm witness:check` and `pnpm docs:check` pass, and every acceptance criterion is
  ticked with a witness pass behind it.

- [ ] **10. libatomic.** [risky] Node.js 26's Linux binary links `libatomic.so.1`, which 24's
  didn't, and #318's `packages.yml` failed on it: in the clean containers `node` doesn't start, so
  the service isn't installed. `packaging/linux/nfpm.yaml` depends on `libatomic1` (deb) and
  `libatomic.so.1()(64bit)` (rpm), `package-linux.test.js` checks both, the release notes name it
  for the Linux archives, and `test-runs.md`'s table has the risk. *Done when:* the repo-tools tests
  pass, `packages.yml`'s x64 and arm64 jobs pass on #318, and the new acceptance criterion is
  ticked.

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

**Task 5, the guards (2026-11-20).**
- `packages/repo-tools/src/node-versions.js` and its test. `repo-tools` is dependency-free, so the
  files are read line by line: trimmed lines, `indexOf` for `node-version`, a whitespace split,
  and only short anchored patterns (`docs/knowledge/codeql-regex.md`). The aim is to catch honest
  drift, and to report the forms it would otherwise miss rather than pass them.
- The drift guard checks the `Dockerfile`:
  - continued lines are joined, and words split on any space;
  - every image it builds or copies from (`FROM`, `--from=`, a mount's `from=`) must be a `node`
    image of `.nvmrc`'s major (a registry prefix and a digest are allowed), an earlier stage,
    `scratch`, or a stage number;
  - anything else, such as `FROM ${IMG}` from an `ARG`, is reported.
- It checks `NODE_MAJOR` and both versions in `feed-workflow.ts` against `.nvmrc`.
- In `ci.yml` and `server-checks.yml`:
  - the role entries are read as `- node: N` with `role:` on the next line: the target against
    `.nvmrc`, the minimum against `MIN_NODE`'s major until task 7;
  - a `node` axis must be `[N, M]` and list exactly the include's versions, or an include entry
    matches no combination and becomes a job of its own (the task 3 witness's remark);
  - any other `node` key is reported, in any case, with spaces before the colon or not: a
    flow-style or JSON-style matrix, an entry without a role or with a line between, a flow-style
    entry. YAML needs a space after an unquoted key's colon, so an image such as `node:26` isn't
    taken for a key (that rule only avoids false alarms);
  - a matrix built from an expression is reported, since its values can't be read: `matrix:
    ${{ … }}`, a line that is only an expression (the value on the next line), and any
    `fromJSON(`.
- In every other workflow under `.github`, any `node:` key or `node-version` value is reported
  (block or flow style, quoted or not, any case). In the two role workflows the only value allowed
  is `${{ matrix.node }}`. That replaces the plan's "Homebrew `node@N`" check: since task 4 the
  macOS step reads `.nvmrc` itself.
- Explicit YAML keys (`?` followed by a space, a tab or the line's end) are reported anywhere in
  the workflows.
- Not read, as nobody writes them by accident and none appears in the repository:
  - escaped characters inside a key (`"node\u002dversion"`), and anchors and aliases;
  - a quoted part of a Dockerfile mount (`"from=…"`);
  - a job's `container: node:N` or a `uses: docker://node:N` step. Neither is how the workflows
    choose Node.js, and the spec doesn't cover them.
- The N-API guard checks the binaries themselves instead of the planned list of known packages.
  Every `.node` file in `@ronneai/marketplace`'s runtime tree must name `napi_register_module_v1`
  (exported) or `napi_module_register` (called from a static constructor, as older N-API modules
  do), and must not name `node_register_module_v`, which a module built for one Node.js ABI
  exports. The names are searched as bytes, which works the same in Mach-O, ELF and PE. The first
  version accepted only `napi_register_module_v1`. The witness showed `@parcel/watcher`'s binary
  (N-API, registering through `napi_module_register`) would have failed, and it isn't in the
  server's tree. It also compiled three addons against Node.js 26's headers (`NODE_MODULE`,
  `NODE_MODULE_INIT`, `NAPI_MODULE`): the guard rejects the first two and accepts the third, which
  is the only one that loads on 22 and 24 too. On this Mac the guard found
  `@node-rs/argon2-darwin-arm64`'s binary and the eight `better-sqlite3` prebuilds, all N-API.
- Packages are found by walking up `node_modules` folders from each package's real path, which
  works for pnpm's layout:
  - dependencies, and optional and peer dependencies when installed, are walked;
    devDependencies never are;
  - a missing required dependency is reported.
- 26 tests: the real repository passes both guards, and each kind of mismatch, including the forms
  the earlier versions missed, is planted in a copy of the real files' text and named in its
  message. The peer and dev-dependency walk rules have a test of their own.

**Task 6, the documents (2026-11-20).**
- Changed:
  - `CLAUDE.md`: the Node.js line, the CI paragraph, and the dependencies bullet, which now names
    the guard;
  - `CONTRIBUTING.md`: develop on 26, the packages run on 22.12 or later, and the CI paragraph;
  - the dependency policy: the §2 table at 26, a line on what CI tests and on the guard, and the
    bundled Node.js row;
  - MVP.md: the Docker and Packages rows, and a "Node.js versions" row at the end of §15;
  - `test-runs.md`: a new section, "Which Node.js version runs what", with the risk table, and
    pointers to it from the CI bullets;
  - `release.md`: the bundles' Node.js check and the server-checks line;
  - `threat-model.md`'s image row;
  - `backup-format.md`'s `maxmem` line, which adds 26: task 1's tests and the task 1 witness's
    scrypt probe measured it.
- `ci.yml`'s comment now points to `test-runs.md`, as task 3 planned.
- Kept as history: `turbo-test-inputs.md`, whose "failed on Node 22 and 24" tells what happened
  on 2026-10-30, and `image-security-updates.md`.
- The search for "Node 24", "Node.js 24", "node:24", "node@24" and "node-version: 24" outside
  old specs, issues and witness records finds:
  - that note;
  - test fixtures (`bundle.test.js`, `node-versions.test.js`);
  - the example Homebrew path in `packages/server/src/service/macos.test.ts`, a fixture. Its
    comment in `macos.ts` now shows `node@26`.
- MVP.md §5's "Supported runtimes" also named 24 as the target, in words the search misses
  ("Active LTS (24 in September 2026)"). The witness found it, and it now says 26, the 22.12
  minimum and the CI split. A wider search (`Active LTS (2N`, `LTS (24`, `24 LTS`, `LTS 24`) finds
  nothing else.
- The 22.13 crash was first claimed from its headers only. Then an official
  `node-v22.13.1-darwin-arm64` build (checked against `SHASUMS256.txt`) reported N-API 9, and
  `require("better-sqlite3")` exited 139, so it's measured now, as 22.12.0 was.

**Task 7, the pinned minimum (2026-11-20).**
- This branch is rebased onto #315's (`bugfix/315-node-22-14-minimum`), which raised `MIN_NODE`
  to 22.14.0 and `engines` to `^22.14.0 || >=23.6.0`. When #315 is squash-merged, rebase with
  `git rebase --onto main bugfix/315-node-22-14-minimum`. The rebase's conflicts (CLAUDE.md,
  CONTRIBUTING.md, MVP.md, dependencies.md) kept 26 as the target and 22.14 as the minimum.
- The entries are `- node: 22.14.0` (a YAML string) in `ci.yml` and `server-checks.yml`, whose
  axis is `[22.14.0, 26]`. The guard reads a major or an exact version, compares the target as a
  major and the minimum exactly, and checks `engines` in the root, `apps/*` and `packages/*`
  `package.json` files: the root and every package that isn't private must have it (the witness
  found a dropped `engines` passed), a private one may leave it out.
- On the official 22.14.0 build, in a scratch worktree: `pnpm install --frozen-lockfile` passes
  (pnpm 12.6.0), and `pnpm test:runtime --force` passes (core 449, marketplace 118, rmk 286, mcp 53,
  web 4700 with 21 skipped).
- The pin caught something on its first run: `telemetry/start.test.ts` › "imports nothing from
  OpenTelemetry without an endpoint" spawns Node with `module.registerHooks`, which is Node.js
  22.15 and 23.5 on. Only that test uses it; the shipped code doesn't. It now skips where
  `registerHooks` is missing (the target's job runs it), and `test-runs.md` has the rule.
- The first 22.14.0 run also failed `health.db.test.ts`' 4.5 s deadline by 16 ms under the full
  parallel load (its log, kept in the session's scratchpad as `188-t7-runtime.log`: "expected
  4516.288042 to be less than 4500"); the file alone passed 3 runs of 3, and the witness's own full
  run on 22.14.0 passed it. A timing margin, not the version.
- **Correction to task 1's notes:** `require("better-sqlite3")` doesn't crash on 22.11–22.13; the
  binary loads on the first `new Database()`, and that exits 139 (re-measured: `require` exit 0,
  opening a database exit 139 on 22.11.0, 22.12.0 and 22.13.1; both 0 on 22.14.0). #315's spec and
  the GitHub issue's repro say so too.

**Task 8, the website (2026-11-20).**

- ronne-web's `main` pinned Next.js 16.4.2, which has seven moderate advisories fixed in 16.4.5;
  its build stopped on the notice. The owner chose to upgrade first: ronne-web `59b0b10` (16.4.6,
  its own change), then #315's `bbf572c`, then this task's `486a25a`. They were written on three branches and ship in one,
  `docs/marketplace-315-188-node`, at the owner's request.
- `docs/product-facts.md` keeps "24 before it" in the runtime row. It doesn't say 24 is tested:
  no CI job runs it (the owner's decision above).

**Task 9, finishing (2026-11-20).**

- Branch protection on `main`, read with `gh api …/branches/main/protection/required_status_checks`:
  "Licenses and known vulnerabilities", "Analyze (actions)", "Analyze (javascript-typescript)",
  "check" (`pr-title.yml`), "Database tests (mysql)", "Database tests (mariadb)",
  "Database tests (postgres)", "Docker image (build, run, scan)", "End-to-end (Chromium)". The
  rulesets (`…/rules/branches/main`) require none. No job this feature renames is on the list.
