# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Ronne AI Marketplace is an open-source (MIT), self-hosted, curated registry of AI capabilities: skills,
agents, rules, commands, hooks, MCP servers and more. Items are delivered to AI coding tools such as
Claude Code, Codex and Cursor.

**There is no code yet.** The repo holds only the planning docs:

- `docs/MVP/ideas.txt`: the original requirements, written by the owner.
- `docs/MVP/MVP.md`: the MVP design. It is the source of truth for scope, architecture, the data model, the API, milestones (M0–M6) and the decision log (§15).

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
  - SSO (OIDC first) comes after the MVP.
- **Items:** one canonical `ronne.yaml` manifest per item, rendered to each AI tool's native files by a `PlatformRenderer` module.
  - Prefer cross-tool formats: Agent Skills `SKILL.md`, `.agents/skills/`, `AGENTS.md`, MCP.
  - If a tool doesn't support an item type, warn and skip it; don't fail the install.
  - Generated files carry an rmk "managed" marker. Never overwrite unmanaged content.
  - Platform file paths change often. Check them against current vendor docs before building a renderer (the table in MVP.md §3.3 is from September 2026).
- **Workflow:**
  - An item or change goes from draft → submitted → approved, with one approval from a moderator or root who isn't the author (root can override, and the override is audited).
  - Releasing is a separate step: semver bump plus a dist-tag, `latest` by default.
  - Published versions are immutable `.tgz` files with a sha256 checksum, stored through a `StorageAdapter` (local disk only for now).
- **Out of scope for the MVP:**
  - importing from external marketplaces;
  - S3 storage;
  - notifications;
  - linking Ronne instances and release signing (designed in §14, not built yet).
