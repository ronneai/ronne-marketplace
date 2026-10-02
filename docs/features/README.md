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
4. **Keep the in-app Documentation current.** Every feature that changes what people see or do
   updates the Documentation topics and inline helpers ([033](./033-in-app-help/SPEC.md)) in the
   same pull request, as its spec's Documentation section lists. A spec with nothing to add says
   "None" and why.
5. **Finish** by setting the status here to `done`.

**Numbering.** IDs are three digits, given in order of creation, and never reused or renamed. The
slug is short and lowercase. The milestone and status live only in this table.

**Status:** `planned` (listed here, no folder yet) → `specified` (`SPEC.md` and `PLAN.md` written)
→ `in progress` → `done`. `dropped` features keep their row and folder, with the reason in `SPEC.md`.
`on hold` features keep their row, folder and spec but aren't picked until the owner takes them off
hold; their `SPEC.md` says since when and why. A spec on hold is re-checked against what was built
since (and, for renderers, the vendors' current docs) before work starts.

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
| [007](./007-audit-log/SPEC.md) | Audit log | 002 | done |
| [008](./008-user-admin/SPEC.md) | User admin: create, disable, change role, reset password | 006, 007, 032 | done |
| [009](./009-access-tokens/SPEC.md) | Personal access tokens: UI, `POST/DELETE /api/v1/auth/token`, `GET /api/v1/me`, bearer guard | 006, 007, 032 | done |

### M2 — Items & submissions

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [010](./010-scopes/SPEC.md) | Scopes (root creates and lists) | 008 | done |
| [011](./011-manifest-core/SPEC.md) | Manifest core: schema, package checks and packer in `packages/core` | 001 | done |
| [012](./012-submission-editor/SPEC.md) | Submission editor: drafts of any type, form + file editor | 010, 011 | done |
| [013](./013-submit-withdraw/SPEC.md) | Submit and withdraw, with registry checks | 012 | done |

### M3 — Review & release

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [014](./014-review-queue/SPEC.md) | Review queue: diff, comments, decisions, root override, risk flags | 013, 007 | done |
| [015](./015-release/SPEC.md) | Release: semver bump, pack, `StorageAdapter`, dist-tags | 014 | done |
| [016](./016-version-management/SPEC.md) | Version management: move tags, deprecate, yank | 015 | done |
| [017](./017-change-proposals/SPEC.md) | Change proposals: diff against base, stale and rebase | 015, 018 | done |
| [018](./018-catalogue/SPEC.md) | Catalogue: search, filters, item page, home page | 015 | done |
| [033](./033-in-app-help/SPEC.md) | In-app help: a Documentation page (how the registry works and is organised: scopes, items and types, the submission lifecycle, versions and dist-tags, `rmk`) and inline helpers in each feature (explanations and examples where people need them) | 012, 013 | done |

### M4 — `rmk` + Claude Code

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [019](./019-registry-read-api/SPEC.md) | Registry read API (`/api/v1` items, versions, tarball with download count, errors, pagination) | 009, 015, 018 | done |
| [020](./020-resolver/SPEC.md) | Resolver in `packages/core`, and `POST /api/v1/resolve` | 011, 019 | done |
| [021](./021-renderer-harness/SPEC.md) | Renderer interface and golden-file test harness | 011 | done |
| [022](./022-rmk-cli/SPEC.md) | `rmk` CLI: login, search, info, install, update, remove, outdated; lockfile and state file | 019, 020, 021 | done |
| [023](./023-claude-code-renderer/SPEC.md) | Claude Code renderer, every item type | 021 | done |

### M5 — Codex, Cursor, MCP

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [024](./024-codex-renderer/SPEC.md) | Codex renderer, and TOML keys in the applier | 021, 022 | done |
| [025](./025-cursor-renderer/SPEC.md) | Cursor renderer | 021, 022 | done |
| [026](./026-support-matrix/SPEC.md) | Per-item support matrix in the web UI, the API and the catalogue filter | 018, 023 | done |
| [027](./027-registry-mcp-server/SPEC.md) | Registry MCP server (`rmk-mcp`) and `rmk mcp-setup` | 022 | done |

### M5b — Tier-2 platforms (on hold)

On hold since 2026-09-30 (owner): not implemented now.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [028](./028-copilot-renderer/SPEC.md) | GitHub Copilot renderer (the CLI and VS Code) | 021, 022, 025 | on hold |
| [029](./029-gemini-antigravity-renderers/SPEC.md) | Antigravity CLI and Gemini CLI renderers | 021, 022, 025 | on hold |
| [030](./030-devin-renderer/SPEC.md) | Devin renderer (Devin Desktop and the Devin CLI) | 021, 022, 025 | on hold |

### M6 — Visual composer and npm

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [031](./031-visual-composer/SPEC.md) | Visual composer (React Flow over `dependencies`) | 012, 013, 018 | done |
| [034](./034-npm-packages/SPEC.md) | Publishing `rmk` and the MCP server to npm (`@ronneai/core`, `rmk`, `mcp`) | 022, 027 | done |
| [035](./035-docker-hub-image/SPEC.md) | Publishing the web app's Docker image to Docker Hub (`ronneai/marketplace`) | 005, 034 | done |
| [036](./036-web-setup/SPEC.md) | Web setup wizard: the first run is set up from the browser, with the installation progress, then sign-in | 003, 005, 006, 032 | done |

### M7 — Export from your tools

An item a person wrote in their AI tool goes to the marketplace as a draft, from `rmk` or from
inside the tool (owner, 2026-09-30). The mapping from a tool's files back to an item is the
contract [`docs/spec/native-readers.md`](../spec/native-readers.md).

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [037](./037-draft-upload-api/SPEC.md) | Draft upload API: `GET /api/v1/scopes`, `POST /api/v1/drafts` (a draft with its files, as the token's user), the audit event, and limits for writes by token | 007, 009, 010, 012, 013, 019 | done |
| [038](./038-rmk-export/SPEC.md) | `rmk export` for skills: the reader in `packages/core`, finding local skills, choosing the scope, the preview, the upload | 037, 011, 022 | done |
| [039](./039-mcp-export-tools/SPEC.md) | MCP export tools: `list_local_items`, `plan_export`, `export_items` | 038, 027 | done |
| [040](./040-export-more-types/SPEC.md) | Export more types: agents, commands, rules and MCP servers from Claude Code's files | 038, 039, 023 | done |
| [041](./041-export-dependencies/SPEC.md) | Dependencies on export: detect what an item uses, ask, recommend exporting it too, upload in order | 040 | done |
| [042](./042-export-change-proposal/SPEC.md) | Export a change as a proposal: an edited install, or a published item of the person's own, merged onto its base version; `POST /api/v1/drafts` with `base` | 041, 017 | done |
| [043](./043-codex-cursor-readers/SPEC.md) | Export from Codex's and Cursor's files: agents, rules, commands and MCP servers, `--from` | 040 | done |
| [051](./051-update-drafts-on-export/SPEC.md) | Update your own drafts on export: exporting an item again updates your draft (or one sent back for changes) instead of making another; one in review is left alone; `GET /api/v1/drafts`, `PUT /api/v1/drafts/{id}`, `--new-draft` | 037, 038, 039, 042 | done |
| [052](./052-bulk-submit/SPEC.md) | Submit drafts in bulk: `rmk submit` (names, ids, `--all`), `check_drafts` / `submit_drafts`, and multi-select on My submissions; only ready drafts go, the others say what's missing; `POST /api/v1/drafts/check` and `/submit` | 013, 014, 037, 038, 039, 051 | done |
| [053](./053-export-descriptions/SPEC.md) | Every exported item has a description: written by the AI tool from the item's content (MCP), or asked in `rmk`, shown before upload, kept when exporting again | 038, 039, 040, 043, 051 | done |
| [054](./054-bulk-approve/SPEC.md) | Approve in bulk: the approval message is optional (the override's too), and the review queue approves several at once with one optional message for all; risk flags listed first, each approved on its own | 014, 017, 052 | done |
| [055](./055-bulk-release/SPEC.md) | Release in bulk: My submissions and the review queue's To release tab release several approved submissions at once, dependencies first, with one set of settings (stable or pre-release, suggested bump for each, tag, notes) | 015, 017, 052, 054, 056 | done |
| [056](./056-pending-dependencies/SPEC.md) | Dependencies on their way: a dependency in review counts at submit (range checked at release); bulk submit and release include dependencies; rejecting a dependency offers to request changes on its dependents; request changes from approved | 013, 014, 015, 041, 052, 054 | done |

### M8 — Catalogue improvements

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [044](./044-item-contents/SPEC.md) | Item contents on the item page: an Overview tab (settings, body file, read-only dependency canvas) and a Files viewer, read from the checked artifact | 018, 026, 031 | done |
| [045](./045-item-overview-dashboard/SPEC.md) | Item overview dashboard from the owner's mockup: stat cards, Install with quick flags, capabilities and guardrails, Used by, maintainers and review, package verification; only what the registry knows | 044 | done |
| [048](./048-runtime-requirements/SPEC.md) | Runtime requirements in the manifest (`requires`: Node.js, git, the `rmk` version…), checked by `rmk install` and shown on the Overview | 011, 022, 045 | on hold |

### M9 — Usage insights

What the item overview mockup shows about usage needs data the registry doesn't collect yet. The
design notes are [MVP §14.6](../MVP/MVP.md#146-usage-telemetry--post-mvp): a policy root sets per
instance (off by default), aggregated, kept on the instance.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [046](./046-usage-telemetry/SPEC.md) | Usage telemetry: root's usage policy (Admin › Settings), `rmk telemetry`, install and remove events, run events from `rmk`-managed hooks where each tool allows, `POST /api/v1/usage`, daily aggregates, an instance switch | 022, 023, 024, 025, 045 | done |
| [047](./047-usage-on-item-page/SPEC.md) | Usage on the item page: installs, harness distribution, invocations and success rate, the daily volume chart, the harness and trigger breakdowns; runs and installs per version | 046 | done |

### Across the app

Work that changes every part of the web app rather than one milestone's features.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [049](./049-local-time/SPEC.md) | Local time: every timestamp in the reader's time zone, UTC on hover; storage, the API and `rmk` stay UTC | 032 | done |
| [050](./050-help-popovers/SPEC.md) | Helpers as popovers: an inline helper's answer floats next to its question (Floating UI) instead of opening inside the page | 033, 032 | done |
