# 188 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

Probe first, change after. Nothing moves to 26 until everything is shown to work there. The CI split
comes before the version move, so the move's pull request already runs the new jobs.

## Tasks

- [ ] **1. Probe Node.js 26 before changing anything.** With the newest Node.js 26 and pnpm
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

- [ ] **2. `pnpm test:runtime`.** A root script that runs every package's tests except
  `@ronneai/repo-tools`, leaving out `*.test.tsx`. Measure how the exclusion reaches both `apps/web`
  Vitest projects: Vitest 5's `--exclude` through `turbo run test -- …` first, a setting read by
  `packages/config/vitest.js` if that doesn't work. Add its row to `CONTRIBUTING.md`'s commands.
  *Done when:*
  - on Node.js 22, `pnpm test:runtime` passes;
  - Vitest's file list has no `.test.tsx` and no `repo-tools` file, and every other test file
    (`*.db.test.ts` on SQLite included) is in it;
  - `pnpm docs:check` passes;
  - Notes record its time against `pnpm test` on the same machine.

- [ ] **3. The CI split by role.**
  - `ci.yml`'s matrix becomes `include: [{node: 22, role: minimum}, {node: 26, role: target}]`.
    Steps check `matrix.role`, never a number. The target runs what the Node 24 job ran, and the
    minimum runs `pnpm install --frozen-lockfile` and `pnpm test:runtime`. The job names are
    "Lint, typecheck, test, build (target Node.js)" and "Runtime tests (minimum Node.js)".
  - `server-checks.yml`'s install matrix is 22 and 26 on every OS plus 24 on `ubuntu-latest`, each
    entry with its role.
  - Keep the turbo cache key per Node.js version, and update the comments.

  This task leaves `.nvmrc` at 24, so the target entry is 24 for now and becomes 26 in task 4.
  *Done when:* both workflows parse (`actionlint` if installed, otherwise a YAML parse), no `if:`
  names a Node.js version, the target job has every step the old Node 24 job had, and the install
  matrix expands to 7 jobs.

- [ ] **4. Move the target to 26.**
  - `.nvmrc` becomes `26`.
  - The `Dockerfile` uses `node:26-trixie-slim@sha256:…`: the current multi-arch index digest from
    Docker Hub, with its comment.
  - `bundle.js` sets `NODE_MAJOR = 26`, with its comments. `bundle.test.js` changes only where a
    test depends on the target.
  - `feed-workflow.ts` uses `node-version: 26` and `image: node:26`, with its golden files and
    `feed-workflow.test.ts`.
  - The target entries in `ci.yml` and `server-checks.yml` become 26.
  - The Homebrew service step uses `node@26`.
  - `bundles.yml` and `packages.yml` use `node-version-file: .nvmrc`, with `.nvmrc` in their
    sparse checkouts.

  *Done when:*
  - `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass on Node.js 26;
  - `docker build .` succeeds, and `node --version` in the image prints v26;
  - `node packages/repo-tools/src/bundle.js` on a packed tarball fetches a Node.js 26 build that
    matches `SHASUMS256.txt`;
  - the feed workflow golden tests pass.

- [ ] **5. The drift guard.** A `repo-tools` test reads `.nvmrc` and checks that these name the
  same major:
  - the `Dockerfile`'s `FROM node:N-…`;
  - `NODE_MAJOR` in `bundle.js`;
  - `feed-workflow.ts`'s `node-version` and `image`;
  - the Homebrew `node@N` in `server-checks.yml`;
  - the `role: target` entries in `ci.yml` and `server-checks.yml`.

  It also checks that `role: minimum` in `ci.yml` matches `MIN_NODE`'s major. Each mismatch names
  the file and both versions.
  *Done when:* the repo-tools tests pass; changing any one of those places to another major (tried
  for each, then put back) makes the guard fail with that file's name.

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

- [ ] **7. Finish.** Set 188's status in `docs/features/README.md`. Check SPEC.md's acceptance
  criteria against what was built, and tick them. Write in the pull request's description the
  required checks to swap:
  - remove "Lint, typecheck, test, build (Node 22)" and "(Node 24)";
  - add "Lint, typecheck, test, build (target Node.js)" and "Runtime tests (minimum Node.js)".

  *Done when:* `pnpm witness:check` and `pnpm docs:check` pass, every acceptance criterion is
  ticked with a witness pass behind it, and the description text is in Notes for the owner.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
