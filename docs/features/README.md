# Features

Each feature has its own folder, `NNN-slug/`, which is the unit of work:

- **`SPEC.md`**: what the feature does and why. Scope, behaviour, edge cases and acceptance
  criteria. It is kept up to date for as long as the feature exists.
- **`PLAN.md`**: how it gets built. Ordered tasks, each small enough for one working session and
  each with the check that proves it's done. Tasks are ticked off as they land.

This page is the index, and it replaces a separate milestone plan: a milestone is the set of
features listed under it. Specs don't repeat the shared contracts in [`docs/spec/`](../spec/) or
the design in [`MVP.md`](../MVP/MVP.md). They link to them.

## How to use it

1. **Pick** the lowest-numbered feature in the current milestone whose dependencies are `done`.
2. **Read** its `SPEC.md`, then work through `PLAN.md` in order. Any new package, tool, action or
   image must pass the [dependency policy](../policies/dependencies.md) checklist.
3. **Keep the docs honest.** If the work changes the behaviour, update `SPEC.md` in the same
   change. If it changes a decision, also update MVP.md and its decision log (§15).
4. **Finish** by setting the status here to `done`.

**Numbering.** IDs are three digits, given in order of creation, and never reused or renamed. The
slug is short and lowercase. The milestone and status live only in this table.

**Status:** `planned` (listed here, no folder yet) → `specified` (`SPEC.md` and `PLAN.md` written)
→ `in progress` → `done`. `dropped` features keep their row and folder, with the reason in `SPEC.md`.

**When to write a spec.** Only for the current milestone and the next one. Later features stay
`planned` until then, so their specs are based on what has actually been built.

New folders start from [`_template/`](./_template/).

## Index

### M0 — Scaffolding & install

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [001](./001-monorepo-scaffold/SPEC.md) | Monorepo scaffold, tooling and CI | — | done |
| [002](./002-db-layer/SPEC.md) | Database layer and first migration | 001 | done |
| [003](./003-setup-installer/SPEC.md) | `pnpm run setup` installer and root account | 002 | done |
| [004](./004-ci-db-matrix/SPEC.md) | CI against SQLite, MySQL and PostgreSQL | 002, 003 | done |
| [005](./005-docker/SPEC.md) | Docker image and compose | 003 | done |

### M1 — Auth & users

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [032](./032-design-system/SPEC.md) | Design system and app shell (brand, fonts, light and dark themes, `components/ui`) | 001 | done |
| [006](./006-web-sign-in/SPEC.md) | Web sign-in, sign-out, change password; Playwright end-to-end tests | 003, 032 | done |
| [007](./007-audit-log/SPEC.md) | Audit log | 002 | in progress |
| [008](./008-user-admin/SPEC.md) | User admin: create, disable, change role, reset password | 006, 007, 032 | specified |
| [009](./009-access-tokens/SPEC.md) | Personal access tokens: UI, `POST/DELETE /api/v1/auth/token`, `GET /api/v1/me`, bearer guard | 006, 007, 032 | specified |

### M2 — Items & submissions

| ID | Feature | Depends on | Status |
|---|---|---|---|
| 010 | Scopes (root creates and lists) | 008 | planned |
| 011 | Manifest core: schema, package checks and packer in `packages/core` | 001 | planned |
| 012 | Submission editor: drafts of any type, form + file editor | 010, 011 | planned |
| 013 | Submit and withdraw, with registry checks | 012 | planned |

### M3 — Review & release

| ID | Feature | Depends on | Status |
|---|---|---|---|
| 014 | Review queue: diff, comments, decisions, root override, risk flags | 013, 007 | planned |
| 015 | Release: semver bump, pack, `StorageAdapter`, dist-tags | 014 | planned |
| 016 | Version management: move tags, deprecate, yank | 015 | planned |
| 017 | Change proposals: diff against base, stale and rebase | 015 | planned |
| 018 | Catalogue: search, filters, item page | 015 | planned |

### M4 — `rmk` + Claude Code

| ID | Feature | Depends on | Status |
|---|---|---|---|
| 019 | Registry read API (`/api/v1` items, tarball, errors, pagination) | 009, 015 | planned |
| 020 | Resolver in `packages/core` | 011 | planned |
| 021 | Renderer interface and golden-file test harness | 011 | planned |
| 022 | `rmk` CLI: login, search, info, install, update, remove, outdated; lockfile and state file | 019, 020, 021 | planned |
| 023 | Claude Code renderer, every item type | 021 | planned |

### M5 — Codex, Cursor, MCP

| ID | Feature | Depends on | Status |
|---|---|---|---|
| 024 | Codex renderer | 021 | planned |
| 025 | Cursor renderer | 021 | planned |
| 026 | Per-item support matrix in the web UI | 018, 023 | planned |
| 027 | Registry MCP server and `rmk mcp-setup` | 022 | planned |

### M5b — Tier-2 platforms (right after the MVP)

| ID | Feature | Depends on | Status |
|---|---|---|---|
| 028 | GitHub Copilot renderer | 021 | planned |
| 029 | Gemini CLI / Antigravity CLI renderer | 021 | planned |
| 030 | Devin Desktop renderer | 021 | planned |

### M6 — Visual composer

| ID | Feature | Depends on | Status |
|---|---|---|---|
| 031 | Visual composer (React Flow over `dependencies`) | 012 | planned |
