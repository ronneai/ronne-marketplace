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
| [048](./048-runtime-requirements/SPEC.md) | Runtime requirements in the manifest (`requires`: Node.js, git, the `rmk` version…), checked by `rmk install` and shown on the Overview | 011, 022, 045 | on hold |

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
| [078](./078-plugin-feed-mirror/SPEC.md) | Git mirror for Codex and Cursor: the feeds for both tools, `rmk feed build --out <dir>` (deterministic, touches only what it wrote), a scheduled CI workflow to keep the repository current | 076, 077 | specified |
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

### M12 — Easy install

Ronne installs in one command, with Docker or without it, on a laptop or on a server with a domain
and HTTPS, on macOS, Linux and Windows (owner, 2026-10-03). The user's guide is
[`docs/runbooks/install.md`](../runbooks/install.md), a draft for the website that each feature
makes true. Build order: 080 → 081 (Docker path done); 082 → 083 → 084 → 085 (macOS and Linux
without Docker); 086 → 087 (Windows without Docker).

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [080](./080-docker-https/SPEC.md) | Docker with a domain and HTTPS: a Caddy proxy in `compose.yaml` on ports 80/443 inside, published on 7650/7651 by default (80/443 for a public domain); `RONNE_DOMAIN` for automatic certificates, own certificate files or an internal CA; the app's port no longer published | 005, 035, 036 | in progress |
| [081](./081-install-script/SPEC.md) | Install script: `curl … \| sh` and `irm … \| iex` from each release; checks Docker, asks "this computer or a server with a domain", writes `~/ronne-marketplace`, starts, opens the browser; rerun to upgrade; `--yes` for scripts | 080, 035 | in progress |
| [082](./082-server-npm-package/SPEC.md) | The server as an npm package: `npx @ronneai/marketplace`, command `rmk-server` (`start`, `setup`, `migrate`, `reset-root-password`), a data folder per system, `127.0.0.1:7650` by default | 034, 035, 036 | done |
| [083](./083-service-unix/SPEC.md) | Service on Linux and macOS: `rmk-server service install \| status \| logs \| uninstall …` with systemd and launchd, a system user, `--domain` with Caddy from the same Caddyfile as 080 | 082, 080 | done |
| [084](./084-bundles/SPEC.md) | Self-contained bundles: six archives per release (Linux, macOS, Windows × x64, arm64) with Node.js inside, smoke-tested per platform | 082 | done |
| [085](./085-unix-packages/SPEC.md) | Homebrew tap, `.deb` and `.rpm`: `brew install ronneai/tap/rmk-server`, packages that install the service; the install script's no-Docker path on macOS and Linux | 083, 084, 081 | done (Homebrew tap: later work) |
| [086](./086-service-windows/SPEC.md) | Service on Windows: the same `service` subcommands through WinSW, `C:\ProgramData`, a virtual account, firewall rules, Caddy for `--domain` | 083, 084 | done (the owner's Windows 11 test later) |
| [087](./087-windows-package/SPEC.md) | Windows installer and winget: `winget install RonneAI.Marketplace`, Inno Setup installer per architecture, the install script's no-Docker path on Windows; unsigned until SignPath Foundation signs it | 086, 084, 081 | specified |

### M13 — Workspaces

A level above scopes: **workspace › scope › item** (owner, 2026-10-05). A workspace has members,
roles per workspace (moderator, user; root stays instance-wide) and a visibility, public or private.
Every instance has `global` (public, reserved, can't be edited or removed), and every user is in it.
Item names stay `@scope/name`: scope names stay unique across the instance, so `rmk`, lockfiles and
plugin feeds don't change (until 118: scope names unique per workspace, items named
`@workspace/scope/name`, `@scope/name` for `global`; owner, 2026-10-09). Build order: 090 → 091 → 092 → 093 → 094 → 095, then 118 → 113 → 114 → 115
(owner, 2026-10-09). 116 and 117 stay planned. Inviting people by email isn't planned (owner,
2026-10-09).

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [090](./090-workspaces/SPEC.md) | Workspaces and the global workspace: `workspaces`, `scopes.workspace_id` (every scope in `global`), Admin › Workspaces, the workspace when creating a scope, the catalogue's Workspace filter | 010, 059, 061 | done |
| [091](./091-workspace-roles/SPEC.md) | Roles per workspace: `workspace_members`; moderator and user per workspace, root instance-wide; today's moderators become `global` moderators; every check made in the item's workspace; the review queue per workspace; submitting needs membership | 090, 014, 016, 059 | done |
| [092](./092-workspace-members/SPEC.md) | Workspace members and the admin role: admin per workspace (a moderator's permissions plus its members, scopes and description), new users in `global` as users, a user's Workspaces dialog, a workspace's Members tab (for root and its admins); nobody leaves `global`; audited | 090, 091, 008, 061 | done |
| [093](./093-private-workspaces/SPEC.md) | Private workspaces: seen only by members and root everywhere (not found to others), dependable only inside their workspace, turning private refused while outside items depend on it, plugin feeds per visibility key, `rmk feed build --workspace` | 090, 091, 092, 089, 018, 019, 020, 027, 077, 079 | done |
| [094](./094-workspace-access-requests/SPEC.md) | Asking to join: the Workspaces page, a join link for private ones, requests answered by root or the workspace's moderators and admins, a Requests page and a nav count, audited | 090, 091, 092, 093, 007 | done |
| [095](./095-workspaces-cli-api/SPEC.md) | Workspaces in `rmk`, MCP and the API: `GET /api/v1/workspaces`, `workspace` on items and `me`, `rmk workspaces`, `search --workspace`, export grouped by workspace, MCP `list_workspaces` | 090, 091, 093, 094, 019, 022, 027, 038 | done |
| [113](./113-rename-workspaces/SPEC.md) | Renaming a workspace: root and the workspace's admins; `global` can't be; its items take the new name, old names kept as aliases; the workspace's old name answers as unknown (no redirect); audited | 090, 092, 093, 094, 095, 118 | specified |
| [114](./114-personal-workspaces/SPEC.md) | Personal workspaces: one per user (roots too), private always, only its owner (as admin) and root; submitted items approved at once and marked not reviewed; left out of root's lists unless named; `personal` in the API, `rmk` and MCP | 090–095, 118, 113, 008, 059, 077, 079 | specified |
| [115](./115-move-scopes/SPEC.md) | Moving a scope to another workspace: asked by the source's admins (a personal workspace's owner) or root; at once for root and `global`'s admins (two confirmations) and admins of the target, otherwise a request to its admins or root (root only for `global`); items renamed, old names kept as aliases; a scope-name clash renames the scope; not-reviewed versions need someone else; refused while a dependency would break; audited | 090–094, 118, 113, 114, 014, 015, 077, 079 | specified |
| [118](./118-workspace-in-names/SPEC.md) | The workspace in item names: scope names unique per workspace; `@workspace/scope/name`, `@scope/name` meaning `global`; old names kept as aliases that reserve their name; the manifest, API, resolver, `rmk` (lockfile rewritten to the new name), MCP, feeds and URLs; `client_too_old` for older `rmk` | 090–095, 011, 015, 019, 020, 022, 027, 037, 077, 097 | done |
| 116 | Per-workspace tokens: a personal access token limited to some of its user's workspaces, for `rmk`, MCP and the feeds | 009, 093, 095 | planned |
| 117 | Asking for a role: a member asks to be a workspace's moderator (or admin), answered by its admins or root, like a request to join | 092, 094 | planned |

### M14 — Run it safely

What a company checks before it runs Ronne (owner, 2026-10-06, from an evaluator's feedback): how
to back it up and restore it, what it logs, what threats it faces and what to do in an incident.
After M13. Build order: 098 → 099 → 100 → 101.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| 098 | Threat model and incident response: the threat model (items run on developers' machines, review as the boundary, tokens, plugin feeds, export, our supply chain) and an incident runbook (yank a version, revoke tokens in bulk, rotate `AUTH_SECRET`, read the audit log, tell users); `SECURITY.md` links both | 007, 016, 009 | planned |
| 099 | Backup and restore: `rmk-server backup` and `restore` (the database, storage and the settings file; SQLite with `VACUUM INTO`, `pg_dump` / `mysqldump` for the servers), the Docker volumes, encrypted backups, a backup runbook and a restore test in CI; encryption at rest is the disk's or the database's, documented | 082, 005 | planned |
| 100 | Structured logs: JSON lines with a level, time and request ID, `LOG_LEVEL`, the same fields in every domain, no secrets or tokens in any line | 001 | planned |
| 101 | Metrics and traces: OpenTelemetry, off unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set (requests, database time, sign-ins, releases, feed builds); the health endpoint reports the database and storage | 100 | planned |

### M15 — Privacy and data lifecycle

Personal data (emails, names, IP addresses) is kept only as long as needed, and a person can see
it and have it erased, as Quebec's Law 25, PIPEDA and the GDPR expect (owner, 2026-10-06). The
audit log stays whole: an erased person becomes a pseudonym, never a gap. Build order: 102 → 103 →
104.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| 102 | Retention: root sets how long IP addresses (audit log, sessions) and expired sessions are kept, 90 days by default; a scheduled purge under a database lock; the Privacy topic in the Documentation | 007, 006, 099 | planned |
| 103 | Erase a user: root anonymises an account (email and name become `deleted-user-<id>`; sessions, accounts and tokens deleted; IPs cleared), published items and audit events kept under the pseudonym; the last root can't be erased; audited | 008, 059, 102 | planned |
| 104 | Your data: a person downloads what the instance holds about them (account, tokens' names, submissions, comments, audit events) as JSON, and root can do it for them | 102, 103 | planned |

### M16 — Company sign-in

SSO, MFA and SCIM (owner, 2026-10-06; design in [MVP §14.3](../MVP/MVP.md#143-sso--planned-as-m16)).
Through Better Auth's plugins, checked against its current docs before each spec. Email and
password stay, at least for root, so a broken identity provider can't lock everyone out. Build
order: 105 → 106 → 107 → 108.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| 105 | Two-factor sign-in: TOTP and backup codes on Account, root can require it for everyone or for roots and moderators; `reset-root-password` also resets it; audited | 006, 008, 059 | planned |
| 106 | OIDC sign-in: root sets up identity providers in Admin › Settings; accounts linked by verified email, or created on first sign-in for chosen domains with the role `user`; IdP groups mapped to moderator and workspace roles | 006, 008, 091, 092, 105 | planned |
| 107 | `rmk login` for SSO users: the OAuth device flow (a code and a URL, approved in the browser, a personal access token back); the MCP setup uses it too | 106, 009, 022, 027 | planned |
| 108 | SCIM provisioning: `/api/v1/scim/v2` Users and Groups, a token per identity provider; deprovisioning disables the account and revokes its tokens and sessions; groups set workspace membership | 106, 092, 103 | planned |

### M17 — More than one replica

Ronne runs behind a load balancer on several replicas (owner, 2026-10-06). Nothing that has to be
shared lives in one process's memory or on one machine's disk. Build order: 109 → 110 → 111.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| 109 | Shared rate limits: sign-in, draft upload and usage limits counted in the database (one table, upsert on all three dialects) instead of in memory; same limits and messages | 006, 037, 046 | planned |
| 110 | S3-compatible storage: a `StorageAdapter` for S3 (AWS, MinIO, R2 and the like), chosen in setup or by environment; server-side encryption; tests against MinIO; a command that copies local storage into a bucket | 015, 099 | planned |
| 111 | Replicas checked: every remaining in-memory state found and made shared or safe to repeat (the marketplace cache by catalogue revision, scheduled jobs under a lock); a compose example with two replicas, and an end-to-end run against it | 109, 110, 079, 102 | planned |
