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
3. **Witness each task.** Before a task is ticked, the
   [state witness](../knowledge/state-witness.md) checks it and its pass goes in `WITNESS.md`, in
   the same commit; `[risky]` tasks get an adversarial pass too. `pnpm witness:check` (run by the
   pre-commit hook and CI) fails a ticked task whose latest pass isn't met.
4. **Keep the docs honest.** If the work changes the behaviour, update `SPEC.md` in the same
   change. If it changes a decision, also update MVP.md and its decision log (§15).
5. **Keep the Documentation current.** Every feature that changes what people see or do
   updates the inline helpers ([033](./033-in-app-help/SPEC.md)) in the same pull request, and the
   Documentation on the website ([088](./088-docs-on-website/SPEC.md): `../ronne-web`, in a branch
   that goes live with the release), as its spec's Documentation section lists. A spec with nothing
   to add says "None" and why.
6. **Finish** by setting the status here to `done`.

**Numbering.** IDs are three digits, given in order of creation, and never reused or renamed. The
slug is short and lowercase. The milestone and status live only in this table.

**Status:** `planned` (listed here, no folder yet) → `specified` (`SPEC.md` and `PLAN.md` written)
→ `in progress` → `done`. `dropped` features keep their row and folder, with the reason in `SPEC.md`.
`on hold` features keep their row, folder and spec but aren't picked until the owner takes them off
hold; their `SPEC.md` says since when and why. A spec on hold is re-checked against what was built
since (and, for renderers, the vendors' current docs) before work starts.

**When to write a spec.** Only for the current milestone and the next one. Later features stay
`planned` until then, so their specs are based on what has actually been built.

New folders start from [`_template/`](./_template/) (`SPEC.md`, `PLAN.md`, `WITNESS.md`).

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
| [059](./059-multiple-roots/SPEC.md) | More than one root: root makes other accounts root and changes any role but their own; roots manage each other; at least one active root always remains; `reset-root-password --email` | 003, 006, 007, 008 | done |

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
| [057](./057-withdraw-archive-delete/SPEC.md) | Withdraw: archive or delete. Withdrawing asks: archive (out of the list, private, restorable as a draft) or delete for good (only if nobody has reviewed it); `submission.deleted` and `submission.restored` | 012, 013, 014, 052, 056 | done |
| [058](./058-review-decisions-everywhere/SPEC.md) | Reject and request changes from the queue and the page: per-row actions with a required reason, the decisions always visible on the review page (disabled with the reason on your own), and the reviewer's message at the top of the author's page | 014, 054, 055, 056 | done |

### M8 — Catalogue improvements

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [044](./044-item-contents/SPEC.md) | Item contents on the item page: an Overview tab (settings, body file, read-only dependency canvas) and a Files viewer, read from the checked artifact | 018, 026, 031 | done |
| [045](./045-item-overview-dashboard/SPEC.md) | Item overview dashboard from the owner's mockup: stat cards, Install with quick flags, capabilities and guardrails, Used by, maintainers and review, package verification; only what the registry knows | 044 | done |
| [048](./048-runtime-requirements/SPEC.md) | Runtime requirements in the manifest (`requires`: Node.js, git, the `rmk` version…), checked by `rmk install` and shown on the Overview | 011, 022, 045 | dropped |

### M9 — Usage insights

What the item overview mockup shows about usage needs data the registry doesn't collect yet. The
design notes are [MVP §14.6](../MVP/MVP.md#146-usage-telemetry--post-mvp): a policy root sets per
instance (off by default), aggregated, kept on the instance.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [046](./046-usage-telemetry/SPEC.md) | Usage telemetry: root's usage policy (Admin › Settings), `rmk telemetry`, install and remove events, run events from `rmk`-managed hooks where each tool allows, `POST /api/v1/usage`, daily aggregates, an instance switch | 022, 023, 024, 025, 045 | done |
| [047](./047-usage-on-item-page/SPEC.md) | Usage on the item page: installs, harness distribution, invocations and success rate, the daily volume chart, the harness and trigger breakdowns; runs and installs per version | 046 | done |

### M10 — Mobile friendly

Every page works on a phone and a tablet (owner, 2026-10-02): reading and finding items, writing
and submitting drafts, reviewing and releasing, tokens and admin. The rules (widths from 360px, no
sideways page scroll, 44px touch targets and 16px fields on a coarse pointer, nothing only on
hover) are set by 065 and kept in [032's spec](./032-design-system/SPEC.md). A phone sweep in the
end-to-end tests checks every page for every role. Build order follows the dependencies: 065,
then 067, then the rest.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [065](./065-mobile-foundations/SPEC.md) | Mobile foundations and phone tests: the mobile rules, viewport and theme colour, safe areas, `dvh`; Playwright `phone` (Pixel 7), `phone-webkit` (iPhone 15) and `tablet` projects; a sweep of every page per role that fails on sideways scroll; a tap-target report | 032, 006 | done |
| [066](./066-mobile-navigation/SPEC.md) | Navigation on phones: a Menu side sheet below `lg` (links with counts, account, appearance, sign out; `/menu` without JavaScript); the account menu closes on an outside click; a shared `ScrollStrip` for tab strips (active tab in view, edge fades) | 065, 067, 032, 033 | done |
| [067](./067-touch-primitives/SPEC.md) | Touch-ready primitives: 16px fields on a coarse pointer (no iOS zoom), 44px tap areas, full-screen dialogs below `sm` with fixed title and footer, a side sheet, `BottomBar`, wrapping copy commands, copy that works over plain http | 065, 032 | done |
| [068](./068-no-hover-only/SPEC.md) | Nothing behind hover: disabled buttons' reasons, UTC times, full hashes, truncated text and badge explanations reachable by tap and keyboard; a scan that fails on new `title=` | 065, 067, 049, 050 | specified |
| [069](./069-mobile-data-tables/SPEC.md) | Tables on phones: `DataTable` rows stack into cards below `sm` (primary heading, meta line, labelled lines, actions), the main column never starves from `sm` up, a Sort select; versions, tokens and bulk lists too | 065, 067, 068, 060, 061, 062, 063 | specified |
| [070](./070-mobile-files-diffs/SPEC.md) | Files, code and diffs on phones: the file tree behind a Files bar, no nested scroll, the tree sticky below the header from `md`, compact diffs, wrapping paths | 065, 067, 068, 044, 014 | specified |
| [071](./071-mobile-catalogue-item/SPEC.md) | Catalogue, item page and Documentation on phones: the Filters panel and Sort menu checked on a phone, wrapping install commands and risk flags, the dependency canvas as a list plus "View as graph" on phones and without a scroll trap on touch and trackpads, "On this page" in long topics | 066, 067, 068, 069, 070, 018, 044, 045, 047 | specified |
| [072](./072-mobile-authoring/SPEC.md) | Writing items on a phone: Create draft and Save/Submit in a bottom bar, Form view first, stacking form and dependency rows, the composer as a list with Add (graph read-only), a local recovery copy of unsaved changes | 067, 068, 070, 071, 012, 031, 052, 057 | specified |
| [073](./073-mobile-review-release/SPEC.md) | Reviewing and releasing on a phone: a bottom decision bar, comments and decision dialogs with the keyboard open, bulk approve and bulk release with their settings collapsed so the list has room | 067, 068, 069, 070, 014, 015, 054, 055, 058 | specified |
| [074](./074-mobile-account-admin/SPEC.md) | Account, Admin, sign-in and setup on phones: autocomplete and input modes, the setup wizard on a phone, whole tokens, Users and Scopes as cards, the audit log's Filters disclosure | 066, 067, 068, 069, 006, 008, 009, 036, 046, 060 | specified |
| [075](./075-mobile-sign-off/SPEC.md) | Mobile sign-off: the sweep and tap-target checks become permanent CI failures, a pass on real iPhone, Android and iPad, screen readers and text size, Lighthouse mobile, "Using Ronne on a phone" in the Documentation, the decision log | 065–074 | specified |

### M11 — Native plugin feeds

A Ronne instance offers its released items as plugin marketplaces that Claude Code, Codex and
Cursor add as a source (owner, 2026-10-03). Claude Code reads one live from the instance with a
token; Codex and Cursor only add git repositories, so `rmk` builds a mirror. The contract is
[`docs/spec/plugin-feeds.md`](../spec/plugin-feeds.md).

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [076](./076-plugin-builders/SPEC.md) | Plugin builders in `@ronneai/core/plugins`: an item and its dependencies (a bundle and its members) as a Claude Code, Codex or Cursor plugin through the renderers; deterministic zips; each tool's marketplace file | 020, 021, 023, 024, 025, 026 | done |
| [077](./077-claude-code-marketplace/SPEC.md) | Claude Code marketplace from the instance: `GET /api/v1/feeds/claude-code/marketplace.json` and plugin zips behind a token, built once per version and cached; `rmk plugin-setup claude-code` with `headersHelper: rmk auth headers`; the Plugin marketplaces topic | 076, 009, 019, 022, 027 | done |
| [078](./078-plugin-feed-mirror/SPEC.md) | Git mirror for Codex and Cursor: the feeds for both tools, `rmk feed build --out <dir>` (deterministic, touches only what it wrote), a scheduled CI workflow to keep the repository current | 076, 077 | in progress (tasks 1–5 built; task 6, the check by hand, is done in 153) |
| [079](./079-plugin-feeds-at-scale/SPEC.md) | Plugin feeds at scale: a benchmark of the marketplaces at 1,000–10,000 items, a catalogue revision and an in-memory marketplace cache, build stats with warnings past 80% of Claude Code's limits (log and Admin › Settings), the 5 MiB cap only for Claude Code with the git mirror as the fallback; per-scope marketplaces wait for a measured trigger | 077, 078 | done |

### Across the app

Work that changes every part of the web app rather than one milestone's features.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [049](./049-local-time/SPEC.md) | Local time: every timestamp in the reader's time zone, UTC on hover; storage, the API and `rmk` stay UTC | 032 | done |
| [050](./050-help-popovers/SPEC.md) | Helpers as popovers: an inline helper's answer floats next to its question (Floating UI) instead of opening inside the page | 033, 032 | done |
| [060](./060-server-data-table/SPEC.md) | Server data table, first on the audit log: a shared `DataTable` with sorting, keyset pagination and filters on the server, all in the URL; the audit log as one line per event, a summary per action, and the details in a dialog (`?event=`) | 007, 032, 049, 050 | done |
| [061](./061-users-scopes-data-table/SPEC.md) | Users and Scopes on the server data table: `/admin/users` (sort by email, name, created) and both scope pages (sort by name, created) move to `DataTable`; `GET /api/v1/scopes` unchanged | 008, 010, 059, 060 | done |
| [062](./062-review-queue-data-table/SPEC.md) | The review queue on the server data table: every tab paged (no more 200-row cut-off), sorted by time or name, searched and filtered by type; bulk approve and release on the page; `fixed` list parameters, date sort keys and `srHeader` added to the shared table | 014, 054, 055, 056, 058, 060 | done |
| [063](./063-my-submissions-data-table/SPEC.md) | My submissions on the server data table: paged instead of loading everything, status links counted by one query, sorted by last change or name, searched and filtered by type | 012, 013, 052, 055, 056, 057, 058, 060, 062 | done |
| [064](./064-remove-scopes-page/SPEC.md) | Remove the Scopes page: `/scopes` and its nav entry go (404), links point to the Documentation; Admin › Scopes and `GET /api/v1/scopes` stay | 010, 061 | done |
| [088](./088-docs-on-website/SPEC.md) | Documentation on the website: Docs and every helper's Learn more open `www.ronne.ai/marketplace/docs` in a new tab; the app's `/docs` pages go (their addresses redirect); the install scripts move to `www.ronne.ai/marketplace/install.sh` and `.ps1` | 033, 050 | done |
| [089](./089-dependency-picker-rule/SPEC.md) | Who can be picked as a dependency: your own items in any state (draft, in review, approved, published), others' only once published, in the form, `@` and the canvas alike; another author's unreleased item no longer counts at submit | 031, 056 | done |
| [096](./096-any-dependency/SPEC.md) | Any item may depend on any other: no type rule on dependencies (the schema, the checks, the pickers, export), the form, `@` and the Canvas view on every type; cycles and self-dependencies still refused, a bundle lists at least one (`bundle_empty`) | 011, 013, 031, 041, 056, 089 | done |
| [097](./097-frontmatter-references/SPEC.md) | Agents and skills named in frontmatter: `agent: @scope/name` in a skill's `SKILL.md` sets the dependency (unquoted accepted, saved quoted; real YAML errors); Claude Code gets the installed name and `context: fork`, its agents `skills:` from their skill dependencies; the `.agents/skills/` copy drops both; export finds a skill's `agent:` | 011, 021, 023, 024, 025, 038, 040, 056, 076, 096 | done |
| [112](./112-dependency-cycles/SPEC.md) | Submitted and released together: Submit on an item submits it with the author's own dependency drafts, Release releases it with its unreleased dependencies, in one transaction, all or none (bulk too); cycles allowed, the resolver installs them, keeping only what the requests reach; `dependency_draft` and a cycle warning instead of errors | 013, 015, 020, 052, 055, 056, 089, 096, #142 | done |
| [119](./119-sidebar-navigation/SPEC.md) | Sidebar navigation: the header's links move to a left sidebar in three groups (Discover, Governance & reviews, Tools), with a workspace switcher that opens a workspace, + Propose item, the person and appearance at its foot; it folds into an icon rail (a cookie keeps it); root's Admin pages as three links (their tabs removed); the Menu sheet below `lg` lists the same | 032, 065, 066, 088, 094, 114, 115 | done |
| [120](./120-workspace-filter/SPEC.md) | Working in one workspace: the sidebar's switcher sets a current workspace (a cookie; `?workspace=` in the URL is the truth) that filters the Catalogue, Reviews and My submissions and preselects New item's scope, with a "Showing … only · Show all" line; members' workspaces only; never a permission boundary; counts unfiltered; web only | 119, 090, 091, 093, 094, 113, 114, 062, 063, 018 | done |

### M12 — Easy install

Ronne installs in one command, with Docker or without it, on a laptop or on a server with a domain
and HTTPS, on macOS and Linux (owner, 2026-10-03; Windows through WSL 2 or a Linux VM since 121, 2026-10-14, and in a terminal with `npx` since #222, 2026-10-22). The user's guide is
[`docs/runbooks/install.md`](../runbooks/install.md), a draft for the website that each feature
makes true. Build order: 080 → 081 (Docker path done); 082 → 083 → 084 → 085 (macOS and Linux
without Docker); 086 → 087 (Windows without Docker; both withdrawn by 121).

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [080](./080-docker-https/SPEC.md) | Docker with a domain and HTTPS: a Caddy proxy in `compose.yaml` on ports 80/443 inside, published on 7650/7651 by default (80/443 for a public domain); `RONNE_DOMAIN` for automatic certificates, own certificate files or an internal CA; the app's port no longer published | 005, 035, 036 | in progress |
| [081](./081-install-script/SPEC.md) | Install script: `curl … \| sh` and `irm … \| iex` from each release; checks Docker, asks "this computer or a server with a domain", writes `~/ronne-marketplace`, starts, opens the browser; rerun to upgrade; `--yes` for scripts | 080, 035 | in progress |
| [082](./082-server-npm-package/SPEC.md) | The server as an npm package: `npx @ronneai/marketplace`, command `rmk-server` (`start`, `setup`, `migrate`, `reset-root-password`), a data folder per system, `127.0.0.1:7650` by default | 034, 035, 036 | done |
| [083](./083-service-unix/SPEC.md) | Service on Linux and macOS: `rmk-server service install \| status \| logs \| uninstall …` with systemd and launchd, a system user, `--domain` with Caddy from the same Caddyfile as 080 | 082, 080 | done |
| [084](./084-bundles/SPEC.md) | Self-contained bundles: six archives per release (Linux, macOS, Windows × x64, arm64) with Node.js inside, smoke-tested per platform | 082 | done |
| [085](./085-unix-packages/SPEC.md) | Homebrew tap, `.deb` and `.rpm`: `brew install ronneai/tap/rmk-server`, packages that install the service; the install script's no-Docker path on macOS and Linux | 083, 084, 081 | done (Homebrew tap: later work) |
| [086](./086-service-windows/SPEC.md) | Service on Windows: the same `service` subcommands through WinSW, `C:\ProgramData`, a virtual account, firewall rules, Caddy for `--domain` | 083, 084 | withdrawn (121) |
| [087](./087-windows-package/SPEC.md) | Windows installer and winget: `winget install RonneAI.Marketplace`, Inno Setup installer per architecture, the install script's no-Docker path on Windows; unsigned until SignPath Foundation signs it | 086, 084, 081 | withdrawn (121) |
| [121](./121-no-windows-server/SPEC.md) | No Windows server: `rmk-server` runs on Linux and macOS only (npm's `os` field and a one-line refusal), Windows people use WSL 2 or a Linux VM; the Windows service (086), bundles, `install.ps1` and their CI go; `rmk` and `rmk-mcp` stay on Windows, with a Windows CI job of their own; in the next release, with 099 (nobody installs the server on Windows: no migration) | 081, 082, 084, 086 | done (partly reversed by [#222](../issues/222-windows-foreground/SPEC.md): `rmk-server` runs in a Windows terminal again) |

### M13 — Workspaces

A level above scopes: **workspace › scope › item** (owner, 2026-10-05). A workspace has members,
roles per workspace (moderator, user; root stays instance-wide) and a visibility, public or private.
Every instance has `global` (public, reserved, can't be edited or removed), and every user is in it.
Item names stay `@scope/name`: scope names stay unique across the instance, so `rmk`, lockfiles and
plugin feeds don't change (until 118: scope names unique per workspace, items named
`@workspace/scope/name`, `@scope/name` for `global`; owner, 2026-10-09). Build order: 090 → 091 → 092 → 093 → 094 → 095, then 118 → 113 → 114 → 115
(owner, 2026-10-09). 116 and 117 stay planned; 134 moves single items between scopes (owner, 2026-10-27). Inviting people by email isn't planned (owner,
2026-10-09).

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [090](./090-workspaces/SPEC.md) | Workspaces and the global workspace: `workspaces`, `scopes.workspace_id` (every scope in `global`), Admin › Workspaces, the workspace when creating a scope, the catalogue's Workspace filter | 010, 059, 061 | done |
| [091](./091-workspace-roles/SPEC.md) | Roles per workspace: `workspace_members`; moderator and user per workspace, root instance-wide; today's moderators become `global` moderators; every check made in the item's workspace; the review queue per workspace; submitting needs membership | 090, 014, 016, 059 | done |
| [092](./092-workspace-members/SPEC.md) | Workspace members and the admin role: admin per workspace (a moderator's permissions plus its members, scopes and description), new users in `global` as users, a user's Workspaces dialog, a workspace's Members tab (for root and its admins); nobody leaves `global`; audited | 090, 091, 008, 061 | done |
| [093](./093-private-workspaces/SPEC.md) | Private workspaces: seen only by members and root everywhere (not found to others), dependable only inside their workspace, turning private refused while outside items depend on it, plugin feeds per visibility key, `rmk feed build --workspace` | 090, 091, 092, 089, 018, 019, 020, 027, 077, 079 | done |
| [094](./094-workspace-access-requests/SPEC.md) | Asking to join: the Workspaces page, a join link for private ones, requests answered by root or the workspace's moderators and admins, a Requests page and a nav count, audited | 090, 091, 092, 093, 007 | done |
| [095](./095-workspaces-cli-api/SPEC.md) | Workspaces in `rmk`, MCP and the API: `GET /api/v1/workspaces`, `workspace` on items and `me`, `rmk workspaces`, `search --workspace`, export grouped by workspace, MCP `list_workspaces` | 090, 091, 093, 094, 019, 022, 027, 038 | done |
| [113](./113-rename-workspaces/SPEC.md) | Renaming a workspace: root and the workspace's admins; `global` can't be; its items take the new name, old names kept as aliases; the workspace's old name answers as unknown (no redirect); audited | 090, 092, 093, 094, 095, 118 | done |
| [114](./114-personal-workspaces/SPEC.md) | Personal workspaces: one per user (roots too), private always, only its owner (as admin) and root; submitted items approved at once and marked not reviewed; left out of root's lists unless named; `personal` in the API, `rmk` and MCP | 090–095, 118, 113, 008, 059, 077, 079 | done |
| [115](./115-move-scopes/SPEC.md) | Moving a scope to another workspace: asked by the source's admins (a personal workspace's owner) or root; at once for root and `global`'s admins (two confirmations) and admins of the target, otherwise a request to its admins or root (root only for `global`); items renamed, old names kept as aliases; a scope-name clash renames the scope; not-reviewed versions need someone else; refused while a dependency would break; audited | 090–094, 118, 113, 114, 014, 015, 077, 079 | done |
| [118](./118-workspace-in-names/SPEC.md) | The workspace in item names: scope names unique per workspace; `@workspace/scope/name`, `@scope/name` meaning `global`; old names kept as aliases that reserve their name; the manifest, API, resolver, `rmk` (lockfile rewritten to the new name), MCP, feeds and URLs; `client_too_old` for older `rmk` | 090–095, 011, 015, 019, 020, 022, 027, 037, 077, 097 | done |
| 116 | Per-workspace tokens: a personal access token limited to some of its user's workspaces, for `rmk`, MCP and the feeds | 009, 093, 095 | planned |
| 117 | Asking for a role: a member asks to be a workspace's moderator (or admin), answered by its admins or root, like a request to join | 092, 094 | planned |
| [134](./134-move-items/SPEC.md) | Moving an item to another scope in the same workspace: any member asks, the workspace's moderators, admins or root move at once or answer; versions unchanged, the old name kept as an alias; a History tab with every name change (134, 115, 113, 118) | 091, 092, 094, 113, 115, 118, 017, 044 | done (the Documentation in ronne-web `feat/134-move-items`) |

### M14 — Run it safely

What a company checks before it runs Ronne (owner, 2026-10-06, from an evaluator's feedback): how
to back it up and restore it, what it logs, what threats it faces and what to do in an incident.
After M13. Build order: 098 → 099 → 100 → 101.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [098](./098-threat-model/SPEC.md) | Threat model and incident response: the threat model (items run on developers' machines, review as the boundary, tokens, plugin feeds, export, our supply chain) and an incident runbook (yank a version, revoke tokens in bulk, rotate `AUTH_SECRET`, read the audit log, tell users); `rmk-server revoke-access` and `rotate-secret`; `SECURITY.md` links both | 007, 016, 009 | done (the yank wording's fix in ronne-web `fix/marketplace-098-yank-locks`) |
| [099](./099-backup-restore/SPEC.md) | Backup and restore: `rmk-server backup` and `restore` (the database, storage and the settings file in one portable archive, made while running, restorable into any of the three database kinds; native dumps left to operators), the Docker volumes, encrypted backups, a backup runbook and a restore test in CI; encryption at rest is the disk's or the database's, documented | 082, 005 | done |
| [100](./100-structured-logs/SPEC.md) | Structured logs: JSON lines with a level, time and request ID, `LOG_LEVEL`, the same fields in every domain, no secrets or tokens in any line | 001 | done |
| [101](./101-metrics-traces/SPEC.md) | Metrics and traces: OpenTelemetry, off unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set (requests, database time, sign-ins, releases, feed builds); the health endpoint reports the database and storage | 100 | done |

### M15 — Privacy and data lifecycle

Personal data (emails, names, IP addresses) is kept only as long as needed, and a person can see
it and have it erased, as Quebec's Law 25, PIPEDA and the GDPR expect (owner, 2026-10-06). The
audit log stays whole: an erased person becomes a pseudonym, never a gap. Build order: 102 → 103 →
104.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [102](./102-retention/SPEC.md) | Retention: root sets how long IP addresses (audit log, sessions, device grants) and expired sessions are kept, 90 days by default, on a Privacy tab of Settings; a scheduled purge in the server under a lease in a `jobs` table, and `rmk-server purge` for cron; the Privacy topic in the Documentation | 007, 006, 099 | done (the Documentation in ronne-web `docs/marketplace-102-retention`) |
| [103](./103-erase-user/SPEC.md) | Erase a user: root anonymises an account (email and name become `deleted-user-<id>`; sessions, accounts and tokens deleted; SCIM links (108) deleted, tombstones included, so no `externalId` links it again; IPs cleared), published items and audit events kept under the pseudonym; the last root can't be erased; audited | 008, 059, 102 | done |
| [104](./104-your-data/SPEC.md) | Your data: a person downloads what the instance holds about them (account, tokens' names, submissions, comments, audit events) as JSON, and root can do it for them | 102, 103 | done (the Documentation in ronne-web `docs/marketplace-104-your-data`) |

### M16 — Company sign-in

SSO, MFA and SCIM (owner, 2026-10-06; design in [MVP §14.3](../MVP/MVP.md#143-sso--planned-as-m16)).
Through Better Auth's plugins, checked against its current docs before each spec. Email and
password stay, at least for root, so a broken identity provider can't lock everyone out. Root
manages it all on a new Authentication tab in Admin › Settings, with setup instructions for each
provider (owner, 2026-10-15). Build order: 122 → 105 → 106 → 107 → 108.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [122](./122-settings-tabs/SPEC.md) | Settings in tabs (`?tab=`): Usage, Plugin feeds and a new Authentication tab with its Sign-in methods panel; a shared link-tab strip the workspace page uses too | 046, 079, 006 | done (the Documentation in ronne-web `docs/marketplace-122-settings-tabs`) |
| [105](./105-two-factor-sign-in/SPEC.md) | Two-factor sign-in: TOTP and backup codes on Account, root can require it for everyone or for roots and moderators; `reset-root-password` also resets it; audited | 122, 006, 008, 059 | done (the Documentation in ronne-web `docs/105-two-factor`) |
| [106](./106-oidc-sign-in/SPEC.md) | Identity providers and OIDC sign-in: an abstract provider type (OpenID Connect first) with presets and setup instructions, set up by root on the Authentication tab; accounts linked by verified email, or created on first sign-in for chosen domains with the role `user`; IdP groups mapped to workspace roles; a password policy and `rmk-server disable-sso` so nobody is locked out | 122, 006, 008, 091, 092, 105, 114 | done (the Documentation in ronne-web `docs/106-oidc-sign-in`) |
| [107](./107-rmk-login-device-flow/SPEC.md) | `rmk login --web` for SSO and two-factor users: the OAuth device flow (a code and a URL, approved in the browser, a personal access token back); the MCP setup uses it too | 106, 009, 022, 027 | in progress |
| [108](./108-scim-provisioning/SPEC.md) | SCIM provisioning: `/api/v1/scim/v2` Users and Groups, a token per identity provider; deprovisioning disables the account and revokes its tokens and sessions; groups set workspace membership | 106, 092, 103 | done (the Documentation in ronne-web `docs/108-scim-provisioning`) |
| [123](./123-user-profile-page/SPEC.md) | A page for each user, `/admin/users/<id>` (root only), holding every action the Users list's rows carry today (role, password, two-factor, disable, download, erase) and the account's state; the list loses its buttons and gains a Last sign-in column, which overprint the Status and Created columns | 008, 059, 092, 103, 104, 105, 108 | done (the Documentation in ronne-web `docs/marketplace-123-user-page`) |

### M17 — More than one replica

Ronne runs behind a load balancer on several replicas (owner, 2026-10-06). Nothing that has to be
shared lives in one process's memory or on one machine's disk. Build order: 109 → 110 → 111.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| 109 | Shared rate limits: sign-in, draft upload and usage limits counted in the database (one table, upsert on all three dialects) instead of in memory; same limits and messages | 006, 037, 046 | planned |
| 110 | S3-compatible storage: a `StorageAdapter` for S3 (AWS, MinIO, R2 and the like), chosen in setup or by environment; server-side encryption; tests against MinIO; a command that copies local storage into a bucket | 015, 099 | planned |
| 111 | Replicas checked: every remaining in-memory state found and made shared or safe to repeat (the marketplace cache by catalogue revision, scheduled jobs under a lock, the per-person two-factor queue of 105); a compose example with two replicas, and an end-to-end run against it | 109, 110, 079, 102 | planned |

### M18 — Home, onboarding and feedback

Everyone lands on Home, so it gets an order, an instance notice root can set, shelves of pinned items
(root's for the instance, a workspace admin's for the workspace) and each person's favorites, and a
getting-started checklist; people can send feedback to the instance's administrators, and accounts
root creates ask for a new password at first sign-in (owner, 2026-10-20). Written for any instance,
a demo being one use. Build order: 129 first (M19), so these are written with messages from the
start; then 124 → 125 → 126; 127 and 128 are independent of those.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [124](./124-home-page-rework/SPEC.md) | Home page rework and the instance notice: the page's order with empty sections hidden, a first screen for an empty instance, type links beside the search, and a notice root sets in Admin › Settings (one message with links written inline, tone, dismissible with an icon, returns when changed) | 018, 119, 120, 122, 129 | done |
| [125](./125-pins-and-favorites/SPEC.md) | Pinned items and favorites: root pins for the instance (Start here), a workspace's admins pin for the workspace, anyone keeps private favorites (a star, Home shelf, catalogue filter); visibility checked at read, audited pins, in the data download and erased with the account | 018, 090, 091, 093, 120, 124, 129 | done (the Documentation in ronne-web `docs/marketplace-pins-favorites`) |
| [126](./126-getting-started/SPEC.md) | Getting started checklist on Home: create a token, connect `rmk`, install a first item, start a draft; ticks itself from existing data, can be hidden and brought back | 009, 107, 124, 129 | done |
| [127](./127-send-feedback/SPEC.md) | Send feedback to this instance's administrators from the sidebar, and Admin › Feedback for root (server data table, handled, bulk, count, retention, erased with the account) | 060, 007, 103, 104, 119, 129 | done (the Documentation in ronne-web `docs/marketplace-feedback`) |
| [128](./128-change-password-first-sign-in/SPEC.md) | Change the password at first sign-in: root can require it when creating a user or resetting a password; a hold on every page and the API until it's changed | 006, 008, 105, 129 | done |

### M19 — Languages

The screens speak the person's language: English (the default), Portuguese and French, chosen on
the profile (owner, 2026-10-20). Platform labels only: item content, what people write, `rmk`, the
MCP server and the API stay as they are. 129 builds the machinery and translates what every page
shares; 130–133 move the rest, area by area, and stay `planned` until 129 is built, so their specs
use what it taught. From 129 on every new screen is written with messages.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [129](./129-languages-foundation/SPEC.md) | Languages, the foundation: `user.locale`, how the language is chosen (profile, cookie, browser, English), message files with parity and raw-text tests, the shell, Account, sign-in and shared UI in three languages | 006, 032, 049, 088, 104, 123 | done |
| [130](./130-languages-browse/SPEC.md) | Languages: browse. Catalogue, item page, workspaces pages (members, requests, moves), the words they share (item types, roles), what their actions say, and the inline helpers that sit on them | 129 | done (the Documentation in ronne-web `docs/marketplace-languages-browse`) |
| [131](./131-languages-author/SPEC.md) | Languages: author and review. Draft editor, composer, submissions, reviews, versions, releases and their error messages | 129, 130 | done |
| [132](./132-languages-admin/SPEC.md) | Languages: admin and setup. Admin pages, settings tabs, audit log labels, the setup wizard, SSO and SCIM screens; an instance default language if wanted | 129 | done (the Documentation in ronne-web `feat/132-languages-admin`; the instance default language was not built) |
| [133](./133-languages-signoff/SPEC.md) | Languages: sign-off. The raw-text scan covers the whole app, a language review of Portuguese and French (by agents, owner 2026-10-27) (with 131's follow-up: « revue » and "proposta de mudança" on the website), the phone sweep in each language, Documentation links checked | 130, 131, 132 | done (reviewed by agents; the Documentation in ronne-web `feat/133-languages-signoff`) |
| [141](./141-language-settings/SPEC.md) | Languages on and off, and the instance default: Admin › Settings › Languages sets the default, whether people may choose and which languages are offered; with choosing off everyone sees the default and the switches hide; the default replaces English as the last fallback; people's choices are kept; audited | 129, 132, 122, 007 | specified |

### M20 — Security scan

Moderators get a second opinion on what an item says and does (owner, 2026-10-28): NVIDIA's
SkillSpector, installed by the operator, scans each submission revision, statically by default and
with semantic (LLM) analysis when a provider is set up (by the operator; by root too once 136
lands) and root chooses it, and its
findings show on the review page. Advisory by default: it never blocks a submit or a release, and
once 137 lands, blocks an approval only when root sets a threshold score.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [135](./135-skill-scanner/SPEC.md) | Security scan of submissions: the operator installs SkillSpector at a pinned version (`RONNE_SKILL_SCANNER`), root turns it on and picks the item types; each revision is scanned statically (`--no-llm`) by default, or with semantic analysis when the operator sets up a provider (`RONNE_SKILL_SCANNER_ENV_*`) and root chooses it, in a private folder with a short environment allowlist and a timeout; a Security scan panel on the review page | 013, 014, 015, 060, 129 | done (the Documentation in ronne-web `feat/135-skill-scanner`) |
| [136](./136-scanner-settings-in-web/SPEC.md) | Scanner settings in Admin › Settings: root sets the provider, model, endpoint, timeout and a write-only API key (encrypted at rest as identity providers' secrets, re-keyed by `rotate-secret`, never shown or logged); endpoints `https://` and not internal unless the operator allows the host; root picks the command from the operator's `RONNE_SKILL_SCANNERS` list; environment variables still win | 135, 106, 098, 099 | done (the Documentation in ronne-web `feat/136-scanner-settings-in-web`) |
| [137](./137-scan-gate-and-panel/SPEC.md) | Security scan redesign and gate: a summary card with the score, recommendation and findings by category, and a dialog with every finding (category tabs, jump to code, remediation, mark false positive, JSON export); authors see their own scan; root sets a threshold score that blocks approval, failing closed on a pending, failed or missing scan, with root's audited override | 135, 136, 014, 054, 058 | in progress |

## Planned on 2026-10-29

The owner's next features (owner, 2026-10-29), built in this order: M21, then 141 (in M19), M22,
M23, M24, M25 and M26, after 137 (M20, in progress on its own branch). Each row's "Depends on"
names what must be `done` first. They were all specified at once, ahead of the usual "current
and next milestone" rule, at the owner's request: a spec is re-checked against what was built
since (and the vendors' current docs) before its work starts, as for one on hold.

### M21 — Feedback in the app

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [138](./138-toasts/SPEC.md) | Toasts for the results of actions, with Sonner unstyled behind our own wrapper (our own component if it can't be translated or placed): bottom right from `sm`, across the bottom above `BottomBar` on phones; ok and info go after 5 s (paused on hover, focus and a hidden tab), warnings and errors stay until closed; `status`/`alert` regions that never take focus; `flashToast` after a redirect (a cookie with a message key, never text); field errors and one-time secrets stay inline | 032, 065, 067, 129 | specified |
| [139](./139-notification-center/SPEC.md) | Notification center in the app: a bell with the unread count in the sidebar and Menu, the ten latest in a popover, `/notifications` on the server data table; written with the audit event in the same transaction (decisions, comments and releases on your submission, answers to your requests, requests you must answer, root's feedback), never to the actor; in the reader's language; hidden once you can't see the subject; polled every minute; kept 90 days; email and webhooks out | 007, 060, 102, 103, 104, 119, 129 | specified |
| [140](./140-upgrade-check/SPEC.md) | Upgrade check for root: a daily request for the latest GitHub release, sending nothing about the instance, under the scheduler's lease; one notification per new version to each active root; Settings › Updates with the versions, Check now and this instance's update commands; "Update available" at the sidebar's foot; a switch and `RONNE_UPDATE_CHECK=off`; quiet when offline | 139, 122, 102, 005, 035, 082, 085 | specified |

### M22 — Global search

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [142](./142-search-index/SPEC.md) | Search index in the server: Orama inside the web app's process (no new image or service) over each item's listed version (full name, old names, type, description, keywords); rebuilt in the background per catalogue revision, by each replica; filtered by the workspaces the reader sees and every hit checked again; today's `LIKE` until the first build; `GET /api/v1/search` and `searchEverywhere` | 018, 019, 079, 093, 114, 118 | specified |
| [143](./143-search-everywhere/SPEC.md) | Search on every page: Search in the sidebar and an icon in the phone header, ⌘K/Ctrl+K; a dialog with items as you type, limited to the current workspace if wanted, and Go to entries for the pages the reader can open; a `/search` results page that works without JavaScript | 142, 119, 120, 066, 067, 129 | specified |
| [144](./144-search-file-contents/SPEC.md) | File contents in search, at scale: `search_texts` holds each version's text files (64 KiB each), written at publish and backfilled; snippets with the file path; `rmk search` and MCP `search_items` move to `/api/v1/search` (older servers fall back); `RONNE_SEARCH_CONTENTS`; `bench:search` at 1k, 5k and 10k items | 142, 143, 044, 015, 022, 027 | specified |

### M23 — MCP servers in items

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [145](./145-mcp-server-references/SPEC.md) | Reference MCP servers from items: an MCP servers field on skills, agents and commands (a picker of `mcp-server` items that adds the dependency), `mcp:<server>` in agents' tools; checks that tool references match a dependency and that two servers don't share a short name; Claude Code agents get `mcpServers`; the Overview lists "Uses MCP servers" | 096, 097, 089, 012, 031, 023, 024, 025 | specified |
| [146](./146-mcp-server-setup/SPEC.md) | Install referenced MCP servers, with set-up steps: an optional `mcp-server.setup` file in the manifest; after install or update `rmk` lists each server's variables as set or not (never a value); `rmk mcp check` and MCP `check_mcp_servers`; "Set up on your machine" on the item page, per tool and system; the Documentation topic MCP servers | 145, 022, 027, 044, 045, 076, 077 | specified |

### M24 — AI providers and triage

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [147](./147-ai-providers/SPEC.md) | AI providers, set up once and shared: Admin › Settings › AI providers lists named providers (135's six kinds, keys sealed and write-only, 136's endpoint checks, Test connection), the environment's read-only and winning; the security scan and triage each pick one and a model; 136's settings move over at start-up; Ronne's own model client (no tools, no SDK); one Allow AI providers switch per private or personal workspace, for the semantic scan and triage alike (without it the scan runs static) | 136, 122, 106, 098, 099, 092, 093, 114 | specified |
| [148](./148-ai-triage/SPEC.md) | AI triage of submissions: advice on improving each submitted revision, and a draft on request; advisory, never a gate; root turns it on and picks types; private workspaces need their admins' consent, personal ones the owner's; files sent as untrusted data, fixed-shape answers shown as text; a Triage tab and card on the review page, the submission page and the editor; daily limits | 147, 135, 137, 014, 093, 114 | specified |
| [149](./149-triage-overlap/SPEC.md) | Triage overlap: candidates from the search index, the model judging duplicate, overlaps or related, and recommending depend on it, propose a change, keep both or merge; compared only with what the revision's workspace may see | 148, 142, 144 | specified |
| [150](./150-triage-guidance/SPEC.md) | Triage guidance, scanned before it's used: root for the instance and a workspace's admins for theirs, by item type and topic; each entry scanned by SkillSpector when the scan is on and used only under 137's threshold (fails closed, root may override); the last passing text stays in use while an edit is scanned | 148, 137, 135, 092 | specified |
| [151](./151-triage-report/SPEC.md) | Triage report for a workspace and the instance: duplicates, items to retire, items to improve and gaps; on request once a day and an optional weekly instance report; six kept; private workspaces only with their consent | 149, 150, 090 | specified |

### M25 — Git export

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [152](./152-git-repositories/SPEC.md) | Git repositories in Admin › Settings (root): an HTTPS URL, a branch, a use (push, read or both) and a write-only token encrypted and bound to the URL's origin, re-keyed by `rotate-secret`; 136's URL checks plus `RONNE_GIT_HOSTS`; Test connection; `isomorphic-git` | 136, 122, 090, 093, 098, 099 | specified |
| [153](./153-git-push-feeds/SPEC.md) | Push the plugin marketplaces to git on every catalogue change: 078's tree (from `@ronneai/core/plugins`, as `rmk feed build` writes it) plus a `skills/` tree for other tools, in an optional folder; never a force push, a conflict stops it; a private workspace only when its admins turn it on, personal ones never; 078's check by hand in each tool | 152, 076, 077, 079, 093, 114 | specified |

### M26 — Import

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [154](./154-import-from-marketplaces/SPEC.md) | Import from other marketplaces: skills, agents, commands, rules and MCP servers from a git repository, with skills.sh (Vercel's directory) search as a finder; drafts, reviewed and scanned like any other, with an Imported risk flag; source, commit and licence recorded, the licence file kept, nothing without a licence on root's list unless root records a permission note (flagged, kept out of git pushes until root allows); off by default, root says who and which hosts | 152, 037, 038, 040, 043, 051, 010, 135, 137, 014 | specified |
| [155](./155-follow-upstream/SPEC.md) | Follow an imported item's source: a daily check and Check now bring changes in as an updated draft or a change proposal onto `latest` and notify its maintainers; never submits or releases on its own; the licence checked again; stopped states shown with reasons | 154, 017, 042, 051, 102, 139 | specified |
