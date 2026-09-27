# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Ronne AI Marketplace is an open-source (MIT), self-hosted, curated registry of AI capabilities: skills,
agents, rules, commands, hooks, MCP servers and more. Items are delivered to AI coding tools such as
Claude Code, Codex and Cursor.

The monorepo is scaffolded (feature 001); the product features start with 002. Where things are:

- `docs/MVP/ideas.txt`: the original requirements, written by the owner.
- `docs/MVP/MVP.md`: the MVP design. It is the source of truth for scope, architecture, the data model, the API, milestones (M0–M6) and the decision log (§15).
- `docs/spec/`: detailed contracts. `manifest.md` and `ronne.schema.json` define `ronne.yaml`; `cli-files.md` defines `rmk.config.json`, `rmk.lock` and `.rmk/state.json`.
- `docs/features/`: the work, one folder per feature (`NNN-slug/SPEC.md` + `PLAN.md`). `docs/features/README.md` is the index and the milestone plan.
- `docs/policies/dependencies.md`: the rules for every dependency (below).
- `docs/UI-Mocks-Materials/` (**git-ignored, kept only on the owner's machine; never commit or publish it**): the brand files, the Manrope font, the Stitch mocks and the two `DESIGN.md` notes. Feature 032 turns them into the design system and copies only what the app serves into `apps/web`; UI work follows it (flat, no shadows, teal as the single accent, no red, yellow or green, Manrope and IBM Plex Mono).
- `examples/items/`: one sample item per type. Each must pass `ronne.schema.json` (checked by a test in `packages/core`); they are the golden-file inputs for renderers.

To work on a feature, read its `SPEC.md`, follow `PLAN.md` in order, and tick tasks as they land. If the behaviour changes, update `SPEC.md` in the same change; when the feature is finished, set its status in the index.

When a task touches a decision, check `MVP.md` first. If the work changes a decision, update the doc and its decision log in the same change.

## Commands

Use Node.js 24 (`.nvmrc`) and pnpm installed directly (`npm install --global pnpm`), not through Corepack, which can't start pnpm 12.

| Command | Does |
|---|---|
| `pnpm install` | Installs dependencies through the supply-chain checks in `pnpm-workspace.yaml` |
| `pnpm dev` | Runs the web app at http://localhost:3000 |
| `pnpm build` | Builds every package and the web app (Turborepo) |
| `pnpm lint` / `pnpm format` | Biome check / Biome fix |
| `pnpm typecheck` | Type-checks every package |
| `pnpm test` | Runs every Vitest suite; `pnpm --filter @ronne/core test` for one package |
| `pnpm test:db` | Only the database tests (`*.db.test.ts`, the `db` Vitest project) |
| `pnpm test:db:up` then `pnpm test:db:postgres` / `:mysql` / `:mariadb` | Database tests against local Docker servers at the minimum versions; `pnpm test:db:down` stops them |
| `pnpm licenses:check` | Checks every installed package's license against `license-policy.json` |
| `pnpm audit --audit-level high` | Fails on known high or critical vulnerabilities |
| `pnpm run setup` | Configures an instance (interactive, or `--yes` with env vars). Never `pnpm setup`: that's a pnpm built-in |
| `pnpm run reset-root-password` | New root password; ends root's sessions and revokes its tokens |
| `pnpm db:migrate` | Applies pending migrations to `DATABASE_URL` |
| `pnpm hooks:install` | Turns on the local `pre-commit` checks and the commit-message check (once per clone) |

CI (`.github/workflows/`) runs lint, typecheck, test and build on Node 22 and 24, the database tests on PostgreSQL 15, MySQL 8.4 and MariaDB 10.11 (`database.yml`, plus a weekly run on the latest versions), the license and audit checks, CodeQL, and the PR title check.

Pull requests that only change documentation (`.md`, `.mdx`, `.txt`, the pre-commit hook's rule) skip the heavy CI steps: the reusable `changes.yml` workflow detects them, and the required checks still report success. Pushes to `main`, and the scheduled and manual runs, always run everything.

A test that needs a database is named `*.db.test.ts` and gets one from `createTestDb()`. Before committing database code, run it against the servers too (`pnpm test:db:up`): SQLite is lenient where PostgreSQL and MySQL aren't.

After adding a workspace package, run `pnpm install --frozen-lockfile` to confirm the lockfile has it; if not, `pnpm install --fix-lockfile`.

## Commits and pull requests

**Rules for every change (mandatory):**

1. **Before any commit**, run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build`. Also run
   `pnpm install --frozen-lockfile` and `pnpm licenses:check` when dependencies or workspace packages
   changed. Commit only when all pass. The `pre-commit` hook runs exactly these, and skips them when
   every staged file is documentation (`.md`, `.mdx` or `.txt`). Never bypass it with `--no-verify`.
2. **If a check fails**, don't fix it on your own and don't commit. Explain what failed and why, propose
   actions, and let the owner decide the next step.
3. **Never push or open a pull request** unless the owner asks for that specific change.

Commit messages and pull request titles use the same format:

```
[type] NNN: Description      when the change belongs to a feature in docs/features
[type]: Description          otherwise
```

- `type` is one of `docs`, `feat`, `chore` or `bugfix`.
- `NNN` is the 3-digit feature ID, such as `001`.
- The description is imperative, starts with a capital letter, has no full stop at the end, and the whole line is at most 72 characters.
- Examples: `[feat] 001: Add CI workflow on Node 22 and 24`, `[bugfix] 003: Keep AUTH_SECRET when setup reruns`, `[docs]: Add dependency policy`.

Pull requests are squash-merged, so the PR title becomes the commit on `main`. CI checks every PR title (`.github/workflows/pr-title.yml`), and a local `commit-msg` hook checks commits (`pnpm hooks:install`). The rules live in `packages/repo-tools/src/commit-message.js`; the `pre-commit` hook's rules are in `packages/repo-tools/src/pre-commit.js`.

## Fixed decisions (see MVP.md §15)

- **CLI name: `rmk`.** Never use `ronne` or `ronneai` as a command or binary name; they are reserved for something else.
- **Monorepo:** pnpm + Turborepo.
  - `apps/web`: Next.js monolith. Serves the UI, server actions, and `/api/v1` for the CLI and MCP server.
  - `packages/core`: the manifest schema, resolver, packer and platform renderers. Shared by everything else.
  - `packages/cli`: the `rmk` CLI.
  - `packages/mcp`: the registry MCP server.
  - `packages/config`: shared config presets.
- **Tooling:** TypeScript, React, Tailwind CSS, Biome (lint and format), Vitest.
- **Frontend is feature-first.**
  - Each feature has one folder with its component, `hooks.ts`, `types.ts`, tests and sub-components.
  - Shared UI primitives (buttons, tables, modals, tabs, inputs) live in `components/ui`.
  - Code used by more than one feature moves to shared.
- **Backend is domain-first clean architecture** in `apps/web/src/server/domains/<domain>/{actions,services,models,repositories,exceptions}`.
  - Dependencies point inward.
  - Services depend on repository interfaces, not on Kysely.
  - Server actions and API routes are thin adapters over the same `actions`.
- **Database:** Kysely, with the dialect chosen at runtime.
  - SQLite (default), MySQL/MariaDB or PostgreSQL.
  - One migration set shared by all three. Use only features they all support, and keep dialect differences in small helpers in `db/`.
  - Ronne never installs a database server. Setup validates the connection the user provides.
- **Auth:** Better Auth, wrapped by the `identity` domain.
  - Sessions for the web app; personal access tokens for `rmk` and the MCP server.
  - Users are created only in the web app. The CLI never registers users.
  - Better Auth owns `user`, `session`, `account` and `verification`. Access tokens are our own `access_tokens` table, stored as sha256 hashes.
  - SSO (OIDC first) comes after the MVP.
- **Items:** one canonical `ronne.yaml` manifest per item, rendered to each AI tool's native files by a `PlatformRenderer` module.
  - Every item is scoped (`@scope/name`). Root creates scopes; anyone may propose in any scope.
  - Prefer cross-tool formats: Agent Skills `SKILL.md`, `.agents/skills/`, `AGENTS.md`, MCP.
  - If a tool doesn't support an item type, warn and skip it; don't fail the install.
  - Generated files carry an rmk "managed" marker where comments are allowed. JSON and TOML keys are tracked with hashes in `.rmk/state.json`. Never overwrite unmanaged or user-edited content.
  - rmk never stores secret values. MCP configs reference env vars.
  - Platform file paths change often. Check them against current vendor docs before building a renderer (the table in MVP.md §3.3 is from September 2026).
- **Workflow:**
  - An item or change goes from draft → submitted → approved, with one approval from a moderator or root who isn't the author (root can override, and the override is audited).
  - Releasing is a separate step: semver bump plus a dist-tag, `latest` by default.
  - Published versions are immutable `.tgz` files with a sha256 checksum, stored through a `StorageAdapter` (local disk only for now).
- **Dependencies** follow `docs/policies/dependencies.md`. Check it before adding any package, tool, action or image.
  - Only licenses that allow free use and redistribution (MIT, ISC, BSD, Apache-2.0, …). Never GPL, AGPL, SSPL, BUSL, non-commercial or unlicensed, even as a dev dependency. No tools that need a paid plan.
  - Use the latest stable version, and LTS where there is one (Node.js 24 LTS target, 22 minimum).
  - Don't add anything with known high or critical vulnerabilities. Keep the pnpm protections (`minimumReleaseAge`, `allowBuilds`, `trustPolicy`, `blockExoticSubdeps`) intact.
- **Out of scope for the MVP:**
  - importing from external marketplaces;
  - S3 storage;
  - notifications;
  - linking Ronne instances and release signing (designed in §14, not built yet).
