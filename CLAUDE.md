# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Ronne AI Marketplace is an open-source (MIT), self-hosted, curated registry of AI capabilities: skills,
agents, rules, commands, hooks, MCP servers and more. Items are delivered to AI coding tools such as
Claude Code, Codex and Cursor.

**There is no code yet.** The repo holds only the planning docs:

- `docs/MVP/ideas.txt`: the original requirements, written by the owner.
- `docs/MVP/MVP.md`: the MVP design. It is the source of truth for scope, architecture, the data model, the API, milestones (M0–M6) and the decision log (§15).
- `docs/spec/`: detailed contracts. `manifest.md` and `ronne.schema.json` define `ronne.yaml`; `cli-files.md` defines `rmk.config.json`, `rmk.lock` and `.rmk/state.json`.
- `docs/features/`: the work, one folder per feature (`NNN-slug/SPEC.md` + `PLAN.md`). `docs/features/README.md` is the index and the milestone plan.
- `examples/items/`: one sample item per type. Each must pass `ronne.schema.json`; they are the golden-file inputs for renderers.

To work on a feature, read its `SPEC.md`, follow `PLAN.md` in order, and tick tasks as they land. If the behaviour changes, update `SPEC.md` in the same change; when the feature is finished, set its status in the index.

When a task touches a decision, check `MVP.md` first. If the work changes a decision, update the doc and its decision log in the same change. When the M0 scaffolding lands, replace this section with the real build, lint and test commands.

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
