# 001 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [x] **1. Workspace root.** Root `package.json` (`private`, `packageManager` with the latest stable pnpm, `engines`, scripts),
  `pnpm-workspace.yaml`, `turbo.json` (`build`, `lint`, `typecheck`, `test`, `dev`), `.nvmrc`,
  `.gitignore` additions (`node_modules`, `.next`, `dist`, `.turbo`, `.env*` except `.env.example`, `data/`), `LICENSE`, `README.md`.
  Include the supply-chain settings from the dependency policy (§3) in `pnpm-workspace.yaml` from
  the start, so every later install goes through them.
  *Done when:* `pnpm install` succeeds with an empty workspace, and `pnpm config get minimumReleaseAge` shows `4320`.

- [x] **2. `packages/config`.** `tsconfig.base.json` (strict, ESM, `NodeNext` for libraries, a
  `nextjs` variant for the app), a shared Biome config, and a Vitest preset. Root `biome.json` extends it.
  *Done when:* `pnpm lint` runs and passes on the repo.

- [x] **3. Library skeletons.** `packages/core`, `cli` and `mcp`, each with `src/index.ts`, a build
  step (`tsc` or `tsdown`), and one test. `cli` exposes the `rmk` bin with `--version` only.
  *Done when:* `pnpm build && pnpm test` pass, and `pnpm exec rmk --version` prints the version.

- [x] **4. `apps/web` skeleton.** Next.js App Router with Tailwind, one placeholder page, the empty
  domain and feature folders (each with a `.gitkeep` or a short README), and one component test for the page.
  No `next lint`. Set `images.unoptimized: true` in `next.config` (policy exception E-1).
  *Done when:* `pnpm dev` serves the page, `pnpm test` includes the web test, and `sharp` isn't in `node_modules`.

- [x] **5. Dependency boundaries.** Biome `noRestrictedImports` rules (or TS project references)
  that block `core` → anything, and `web` → `cli` or `mcp`.
  *Done when:* a deliberate bad import fails `pnpm lint` or `pnpm typecheck`, and is then removed.

- [x] **6. Examples check.** A small script (in `packages/core` or `scripts/`) that validates every
  `examples/items/*/ronne.yaml` against `docs/spec/ronne.schema.json` with Ajv. Run it from `pnpm test`.
  *Done when:* it passes now, and breaking one example makes it fail.

- [ ] **7. CI.** `.github/workflows/ci.yml`: Node 22 and 24, `pnpm/action-setup` (not Corepack), pnpm store cache, Turbo cache,
  then lint → typecheck → test → build.
  *Done when:* a pull request shows a green run, and a deliberate lint error turns it red.

- [ ] **8. License check.** A script that reads `pnpm licenses list --json` for the whole tree, and compares it with `license-policy.json` (the allowed list plus the exceptions in policy §5). Wire it into CI.
  *Done when:* it passes on the tree, and fails with a clear message when a GPL fixture package is added.

- [ ] **9. Security CI and repo settings.** Add `pnpm audit --audit-level high`, CodeQL, `.github/dependabot.yml` (npm + Actions, weekly, grouped, 3-day cooldown), pin every Action to a SHA, set minimal `permissions:`, and add `SECURITY.md`. Ask the repo owner to turn on secret scanning, push protection and private vulnerability reporting.
  *Done when:* the jobs run on a pull request, and the repository settings are confirmed in Notes.

- [ ] **10. Update CLAUDE.md.** Replace the "no code yet" note with the real commands from the table in SPEC.md.
  *Done when:* CLAUDE.md lists the build, lint and test commands.

## Notes

- **pnpm and Corepack (2026-09-26).** Corepack 0.32 and 0.36 both fail to start pnpm 12 (they look
  for `bin/pnpm.cjs`, which pnpm 12 no longer ships). Install pnpm directly; it self-switches to
  `packageManager`. CI must use `pnpm/action-setup`.
- **Release-age delay works.** With `minimumReleaseAge: 4320`, `pnpm add` picked turbo 2.11.3 and
  vitest 5.0.1 instead of releases from the previous 1–2 days.
- **Trust policy exception E-3.** `@types/node@22` pins `undici-types@~6.21.0`, which fails
  `trustPolicy: no-downgrade` (published by hand after provenance releases, same maintainer). Excluded
  by exact version and recorded in the dependency policy. `trustPolicyExcludePrune` removes it when unused.
- **`@types/node` follows the minimum runtime (22)**, not the target (24), so code can't use APIs Node 22 lacks.
- **TypeScript 7 works** with Next.js 16.3 (`next build` runs its type check) and with `tsc` for the
  libraries, even though TS 7 has no classic JS API. No fallback needed.
- **Vitest and JSX.** Next.js needs `"jsx": "preserve"`, so `apps/web/vitest.config.ts` sets
  `oxc.jsx.runtime: "automatic"` for tests.
- **Typecheck in `apps/web`** runs `next typegen` first, so `next-env.d.ts` and route types exist.
- **Next.js agent files.** `next dev` writes `apps/web/AGENTS.md` and `CLAUDE.md` pointing agents at
  the docs bundled with this Next.js version, and re-creates them if deleted. They're committed.
- **`poweredByHeader: false`** in `next.config.ts`, so responses don't advertise the framework.
- **Biome preset name.** A file called `biome.json` inside `packages/config` is treated as a nested
  root config and fails. The preset is `biome.shared.json`, exported as `@ronne/config/biome`.
- **Boundaries.** Biome `noRestrictedImports` overrides block package imports across boundaries;
  relative escapes (`../../apps/...`) are caught by `tsc` (`rootDir`, TS6059). Both checked with deliberate bad imports.
- **Turbo cache and the examples test.** `packages/core/turbo.json` adds `docs/spec/**` and
  `examples/**` as test inputs; otherwise editing an example would reuse a cached pass.
- **`rmk` bin.** pnpm links a package's bin into its dependents, not into itself, so the root has
  `@ronne/rmk` as a workspace dev dependency and `pnpm exec rmk` works from the root.

- **New workspace packages and the lockfile.** Adding a package with no dependencies
  (`packages/repo-tools`) left it out of `pnpm-lock.yaml`, so `pnpm install --frozen-lockfile` failed
  with `ERR_PNPM_PACKAGE_MANAGER_NO_IMPORTER`. Plain `pnpm install` and `--lockfile-only` didn't fix
  it; `pnpm install --fix-lockfile` did. After adding a package, always check with `pnpm install --frozen-lockfile`.
