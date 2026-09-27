# 001 — Plan

> Spec: [SPEC.md](./SPEC.md)

## Tasks

- [ ] **1. Workspace root.** Root `package.json` (`private`, `packageManager` with the latest stable pnpm, `engines`, scripts),
  `pnpm-workspace.yaml`, `turbo.json` (`build`, `lint`, `typecheck`, `test`, `dev`), `.nvmrc`,
  `.gitignore` additions (`node_modules`, `.next`, `dist`, `.turbo`, `.env*` except `.env.example`, `data/`), `LICENSE`, `README.md`.
  Include the supply-chain settings from the dependency policy (§3) in `pnpm-workspace.yaml` from
  the start, so every later install goes through them.
  *Done when:* `pnpm install` succeeds with an empty workspace, and `pnpm config get minimumReleaseAge` shows `4320`.

- [ ] **2. `packages/config`.** `tsconfig.base.json` (strict, ESM, `NodeNext` for libraries, a
  `nextjs` variant for the app), a shared Biome config, and a Vitest preset. Root `biome.json` extends it.
  *Done when:* `pnpm lint` runs and passes on the repo.

- [ ] **3. Library skeletons.** `packages/core`, `cli` and `mcp`, each with `src/index.ts`, a build
  step (`tsc` or `tsdown`), and one test. `cli` exposes the `rmk` bin with `--version` only.
  *Done when:* `pnpm build && pnpm test` pass, and `rmk --version` prints the version.

- [ ] **4. `apps/web` skeleton.** Next.js App Router with Tailwind, one placeholder page, the empty
  domain and feature folders (each with a `.gitkeep` or a short README), and one component test for the page.
  No `next lint`. Set `images.unoptimized: true` in `next.config` (policy exception E-1).
  *Done when:* `pnpm dev` serves the page, `pnpm test` includes the web test, and `sharp` isn't in `node_modules`.

- [ ] **5. Dependency boundaries.** Biome `noRestrictedImports` rules (or TS project references)
  that block `core` → anything, and `web` → `cli` or `mcp`.
  *Done when:* a deliberate bad import fails `pnpm lint` or `pnpm typecheck`, and is then removed.

- [ ] **6. Examples check.** A small script (in `packages/core` or `scripts/`) that validates every
  `examples/items/*/ronne.yaml` against `docs/spec/ronne.schema.json` with Ajv. Run it from `pnpm test`.
  *Done when:* it passes now, and breaking one example makes it fail.

- [ ] **7. CI.** `.github/workflows/ci.yml`: Node 22 and 24, Corepack, pnpm store cache, Turbo cache,
  then lint → typecheck → test → build.
  *Done when:* a pull request shows a green run, and a deliberate lint error turns it red.

- [ ] **8. License check.** A script that reads `pnpm licenses list --json` for the whole tree, and compares it with `license-policy.json` (the allowed list plus the exceptions in policy §5). Wire it into CI.
  *Done when:* it passes on the tree, and fails with a clear message when a GPL fixture package is added.

- [ ] **9. Security CI and repo settings.** Add `pnpm audit --audit-level high`, CodeQL, `.github/dependabot.yml` (npm + Actions, weekly, grouped, 3-day cooldown), pin every Action to a SHA, set minimal `permissions:`, and add `SECURITY.md`. Ask the repo owner to turn on secret scanning, push protection and private vulnerability reporting.
  *Done when:* the jobs run on a pull request, and the repository settings are confirmed in Notes.

- [ ] **10. Update CLAUDE.md.** Replace the "no code yet" note with the real commands from the table in SPEC.md.
  *Done when:* CLAUDE.md lists the build, lint and test commands.

## Notes
