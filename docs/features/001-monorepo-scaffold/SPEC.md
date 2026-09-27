# 001 — Monorepo scaffold, tooling and CI

> Milestone: M0 · Depends on: — · Design: [MVP §9.1](../../MVP/MVP.md#91-monorepo-pnpm--turborepo), [§9.3](../../MVP/MVP.md#93-frontend-feature-first)

## Goal

An empty but working monorepo. Every later feature adds code to a place that already builds,
lints, type-checks and runs tests locally and in CI, so no feature has to set up tooling first.

## Scope

**In:**
- pnpm workspace and Turborepo pipeline.
- `packages/config` with shared presets for TypeScript, Biome and Vitest.
- Skeletons for `apps/web`, `packages/core`, `packages/cli` and `packages/mcp`. Each builds, and each has one passing test.
- `apps/web`: Next.js (App Router) with Tailwind CSS, one placeholder page, and the empty folders
  from MVP §9.2 and §9.3 (`src/server/domains/`, `src/server/db/`, `src/server/http/`,
  `src/features/`, `src/components/ui/`).
- GitHub Actions CI: install, lint, type-check, test and build.
- Repo basics: `LICENSE` (MIT), a short `README.md`, `.nvmrc`, and ignore rules for build output, `.env` and `data/`.
- CI check that every `examples/items/*/ronne.yaml` passes `docs/spec/ronne.schema.json`.
- The enforcement from the [dependency policy](../../policies/dependencies.md): pnpm install
  protections, the license check, `pnpm audit`, Dependabot, pinned Actions, CodeQL, and `SECURITY.md`.

**Out:**
- Database code → [002](../002-db-layer/SPEC.md).
- Real CLI commands → 022. Real MCP tools → 027.
- Playwright end-to-end tests → 006, with the first real UI flow.
- Publishing packages to npm → before M4, once the `@ronne` scope is confirmed.

## Behaviour

**Layout** (MVP §9.1):

```
apps/web/            @ronne/web          private, not published
packages/core/       @ronne/core
packages/cli/        @ronne/rmk          bin: rmk
packages/mcp/        @ronne/mcp
packages/config/     @ronne/config       private
```

**Root scripts** (all go through Turborepo, so only changed packages rerun):

| Script | Does |
|---|---|
| `pnpm dev` | Runs `apps/web` in development mode |
| `pnpm build` | Builds every package and the app |
| `pnpm lint` | `biome check` on the whole repo |
| `pnpm format` | `biome check --write` |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm test` | Vitest in every package |

**Versions** follow the [dependency policy](../../policies/dependencies.md#2-versions):
- Node.js 24 LTS is the target: `.nvmrc`, and the version used in development.
- `engines` allows `>=22.12` (Vitest's minimum on the 22 line).
- `packageManager` pins the latest stable pnpm. CI installs it with `pnpm/action-setup`, which reads
  that field. Corepack isn't used: current releases (0.36) can't start pnpm 12, and Node.js stopped
  bundling Corepack from version 25.
- Every tool starts on its current stable release. `apps/web` and dev dependencies use exact versions.

**Supply-chain settings** in `pnpm-workspace.yaml`, exactly as listed in the policy (§3):
`minimumReleaseAge`, `strictDepBuilds`, `allowBuilds`, `trustPolicy`, `blockExoticSubdeps` and
`ignoredOptionalDependencies: [sharp]`. `next.config` sets `images.unoptimized: true` (exception E-1).

**Package rules:**
- Packages are ESM (`"type": "module"`) and TypeScript `strict`.
- `packages/core` doesn't import anything from `apps/` or the other packages. `cli` and `mcp` import only from `core`.
- `apps/web` may import `core`, never `cli` or `mcp`.

**CI** runs on every push and pull request to `main`, on Node 22 and 24, in the order install
(`--frozen-lockfile`) → lint → typecheck → test → build, plus the examples check. Turborepo's local
cache is kept between runs with the Actions cache.

**Security jobs** (policy §3):
- **License check:** `pnpm licenses list --json` against `license-policy.json`, for the whole install tree.
- **`pnpm audit --audit-level high`**.
- **CodeQL** for JavaScript and TypeScript.

Every action is pinned to a commit SHA, and every workflow declares minimal `permissions:`.
`.github/dependabot.yml` covers npm and `github-actions`: weekly, grouped, with a 3-day cooldown,
and `commit-message.prefix: "[chore]"` so its pull request titles pass the PR title check
(Dependabot adds the colon, giving `[chore]: Bump …`). Its long grouped titles skip only the
length rule.

## Edge cases

- **Biome and Next.js.** Biome replaces ESLint. `apps/web` must not install or run `next lint`.
- **Native modules.** `better-sqlite3` arrives in 002, which adds it to `allowBuilds`. Nothing here needs a build script.
- **A dependency of a dependency fails the license check.** Replace the direct dependency, or record an exception in the policy. Never disable the check.
- **TypeScript major versions.** If the newest major isn't yet supported by Next.js or Vitest, use
  the latest version they support and note it in `PLAN.md`.

## Acceptance criteria

- [x] A fresh clone runs `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` with no errors.
- [x] `pnpm dev` serves a placeholder page at `http://localhost:3000` styled with Tailwind.
- [x] `pnpm exec rmk --version` (from the repo root, which has `@ronne/rmk` as a workspace dev dependency) prints the package version.
- [x] Each package has at least one Vitest test, and it runs through `pnpm test`.
- [x] A Biome error, a type error or a failing test makes CI fail.
- [x] The examples check passes on the current `examples/items/` and fails when a manifest is broken.
- [x] Importing `apps/web` code from `packages/core` fails lint or type-check.
- [x] `LICENSE`, `README.md`, `.nvmrc` (24) and `SECURITY.md` exist.
- [x] `pnpm-workspace.yaml` has every supply-chain setting from the policy, and `sharp` isn't installed.
- [x] The license check passes on the current tree, and fails when a package with a disallowed license (a GPL test fixture) is added.
- [x] `pnpm audit --audit-level high` runs in CI and fails the build on a high advisory.
- [x] All Actions are pinned to SHAs, Dependabot is configured for npm and Actions, and CodeQL runs on pull requests.

## Open questions

- Is the `@ronne` npm scope ours? It affects package names only when publishing, so it doesn't block this feature.
