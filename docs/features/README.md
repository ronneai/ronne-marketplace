# Features

Each feature has its own folder, `<domain>/NNN-slug/`, which is the unit of work:

- **`SPEC.md`**: what the feature does and why. Scope, behaviour, edge cases and acceptance
  criteria. It is kept up to date for as long as the feature exists.
- **`PLAN.md`**: how it gets built. Ordered tasks, each small enough for one working session and
  each with the check that proves it's done. Tasks are ticked off as they land.
- **`WITNESS.md`**: the [state witness](../knowledge/state-witness.md)'s passes, one section per
  task.

The features are filed by their main [domain](#domains), and grouped into
[milestones](./milestones/README.md): a milestone is the set of features listed in its file, with
what each does and what it depends on. This page is the index: one row per feature, to find it by
number. Specs don't repeat the shared contracts in [`docs/spec/`](../spec/) or the design in
[`MVP.md`](../MVP/MVP.md). They link to them.

**What to read.** For a feature: its `SPEC.md`, then its `PLAN.md`; open `WITNESS.md` only to add a
pass or check one, since it's the largest file and records what was checked, not what to build.
For a milestone: its file in [`milestones/`](./milestones/README.md), not this whole page.

## How to use it

1. **Pick** the lowest-numbered feature in the current milestone whose dependencies are `done`.
2. **Read** its `SPEC.md`, then work through `PLAN.md` in order. Any new package, tool, action or
   image must pass the [dependency policy](../policies/dependencies.md) checklist.
3. **Witness each task.** Before a task is ticked, the
   [state witness](../knowledge/state-witness.md) checks it and its pass goes in `WITNESS.md`, in
   the same commit; `[risky]` tasks get an adversarial pass too. `pnpm witness:check` (run by the
   pre-commit hook and CI) fails a ticked task whose latest pass isn't met. A pull request from an
   outside contributor leaves its tasks unticked ([CONTRIBUTING.md](../../CONTRIBUTING.md)): the
   owner runs the witness on its branch and ticks them before merging.
4. **Keep the docs honest.** If the work changes the behaviour, update `SPEC.md` in the same
   change. If it changes a decision, also update MVP.md and its decision log (§15).
5. **Keep the Documentation current.** Every feature that changes what people see or do
   updates the inline helpers ([033](./web-ui/033-in-app-help/SPEC.md)) in the same pull request, and the
   Documentation on the website ([088](./web-ui/088-docs-on-website/SPEC.md): `../ronne-web`, in a branch
   that goes live with the release), as its spec's Documentation section lists. A spec with nothing
   to add says "None" and why. The website's source is private, so for an outside contributor's
   pull request the owner writes it, from what the pull request says it should say.
6. **Finish** by setting the status to `done`, here and in the milestone's file.

**Numbering.** IDs are three digits, given in order of creation, and never reused or renamed. The
slug is short and lowercase.

**Status:** `planned` (listed here, no folder yet) → `specified` (`SPEC.md` and `PLAN.md` written)
→ `in progress` → `done`. `dropped` features keep their row and folder, with the reason in `SPEC.md`.
`on hold` features keep their row, folder and spec but aren't picked until the owner takes them off
hold; their `SPEC.md` says since when and why. A spec on hold is re-checked against what was built
since (and, for renderers, the vendors' current docs) before work starts. The milestone's file
gives the status in full (with a note in brackets, such as where the Documentation is); this
index gives it without the note.

**When to write a spec.** Only for the current milestone and the next one. Later features stay
`planned` until then, so their specs are based on what has actually been built.

**A new feature** takes the next free ID and a domain from [`domains.json`](./domains.json) (a new
domain goes in that file and in the list below). Its folder starts from
[`_template/`](./_template/) (`SPEC.md`, `PLAN.md`, `WITNESS.md`) as `<domain>/NNN-slug/`, and it
gets a row here and one in its milestone's file in the same change. A planned feature has its rows
before it has a folder, with its ID unlinked and `—` as its domain. `pnpm docs:check` fails when a
folder, its domain, its two rows and their status don't agree, or a link in the docs lands nowhere.

## Domains

| Domain | What it holds |
|---|---|
| [`platform`](./platform/) | The repository itself: the monorepo, the database layer, CI, the Node.js target and contributor tooling |
| [`install`](./install/) | Getting Ronne running: setup, Docker, npm and OS packages, bundles, services and upgrades |
| [`identity`](./identity/) | Who someone is and how they sign in: accounts, sessions, tokens, two-factor, SSO, SCIM, sign-up and passwords |
| [`items`](./items/) | What an item is and how authors write it: the manifest, the editor, dependencies, versions and change proposals |
| [`review`](./review/) | Review and release: the queue, approvals, decisions, bulk actions and overrides |
| [`catalogue`](./catalogue/) | Finding items: the catalogue, item pages, the home page, pins and search |
| [`cli-api`](./cli-api/) | The rmk CLI, the resolver, the registry API and the registry MCP server |
| [`renderers`](./renderers/) | Turning a manifest into each AI tool's native files |
| [`export-import`](./export-import/) | Bringing items in from people's tools, git and other marketplaces |
| [`plugin-feeds`](./plugin-feeds/) | Native plugin marketplaces and feeds for Claude Code, Codex and Cursor |
| [`workspaces`](./workspaces/) | Scopes and workspaces: roles, members, access and moving things between them |
| [`web-ui`](./web-ui/) | The web app across every screen: design system, help, navigation, tables, mobile, languages, notifications |
| [`operations`](./operations/) | Running it safely: audit, logs, metrics, backups, retention, privacy, email, shared limits |
| [`security-ai`](./security-ai/) | The security scan and the AI providers and triage |
| [`usage`](./usage/) | Usage insights: what gets installed and used, on the item pages and for root |
| [`feedback`](./feedback/) | Feedback from people to the instance's maintainers, in the app |

## Milestones

One file each in [`milestones/`](./milestones/README.md), which also says when and why each group
was planned:

- [M0 — Scaffolding & install](./milestones/M00-scaffolding-install.md)
- [M1 — Auth & users](./milestones/M01-auth-users.md)
- [M2 — Items & submissions](./milestones/M02-items-submissions.md)
- [M3 — Review & release](./milestones/M03-review-release.md)
- [M4 — `rmk` + Claude Code](./milestones/M04-rmk-claude-code.md)
- [M5 — Codex, Cursor, MCP](./milestones/M05-codex-cursor-mcp.md)
- [M5b — Tier-2 platforms](./milestones/M05b-tier-2-platforms.md)
- [M6 — Visual composer and npm](./milestones/M06-visual-composer-and-npm.md)
- [M7 — Export from your tools](./milestones/M07-export-from-your-tools.md)
- [M8 — Catalogue improvements](./milestones/M08-catalogue-improvements.md)
- [M9 — Usage insights](./milestones/M09-usage-insights.md)
- [M10 — Mobile friendly](./milestones/M10-mobile-friendly.md)
- [M11 — Native plugin feeds](./milestones/M11-native-plugin-feeds.md)
- [Across the app](./milestones/across-the-app.md)
- [M12 — Easy install](./milestones/M12-easy-install.md)
- [M13 — Workspaces](./milestones/M13-workspaces.md)
- [M14 — Run it safely](./milestones/M14-run-it-safely.md)
- [M15 — Privacy and data lifecycle](./milestones/M15-privacy-and-data-lifecycle.md)
- [M16 — Company sign-in](./milestones/M16-company-sign-in.md)
- [M17 — More than one replica](./milestones/M17-more-than-one-replica.md)
- [M18 — Home, onboarding and feedback](./milestones/M18-home-onboarding-and-feedback.md)
- [M19 — Languages](./milestones/M19-languages.md)
- [M20 — Security scan](./milestones/M20-security-scan.md)
- [M21 — Feedback in the app](./milestones/M21-feedback-in-the-app.md)
- [M22 — Global search](./milestones/M22-global-search.md)
- [M23 — MCP servers in items](./milestones/M23-mcp-servers-in-items.md)
- [M24 — AI providers and triage](./milestones/M24-ai-providers-and-triage.md)
- [M25 — Git export](./milestones/M25-git-export.md)
- [M26 — Import](./milestones/M26-import.md)
- [M27 — Sign-in screens](./milestones/M27-sign-in-screens.md)
- [M28 — Governance foundations](./milestones/M28-governance-foundations.md)
- [M29 — Evidence and least privilege](./milestones/M29-evidence-and-least-privilege.md)
- [M30 — Trust and hardening](./milestones/M30-trust-and-hardening.md)
- [M31 — Configurable governance](./milestones/M31-configurable-governance.md)
- [M32 — Open sign-up and email](./milestones/M32-open-sign-up-and-email.md)
- [M33 — Model and effort per AI tool](./milestones/M33-model-and-effort-per-ai-tool.md)
- [Outside the milestones](./milestones/repository.md)

## Index

| ID | Feature | Domain | Milestone | Status |
|---|---|---|---|---|
| [001](platform/001-monorepo-scaffold/SPEC.md) | Monorepo scaffold, tooling and CI | platform | M0 | done |
| [002](platform/002-db-layer/SPEC.md) | Database layer and first migration | platform | M0 | done |
| [003](install/003-setup-installer/SPEC.md) | `pnpm run setup` installer and root account | install | M0 | done |
| [004](platform/004-ci-db-matrix/SPEC.md) | CI against SQLite, MySQL and PostgreSQL | platform | M0 | done |
| [005](install/005-docker/SPEC.md) | Docker image and compose | install | M0 | done |
| [006](identity/006-web-sign-in/SPEC.md) | Web sign-in, sign-out and change password | identity | M1 | done |
| [007](operations/007-audit-log/SPEC.md) | Audit log | operations | M1 | done |
| [008](identity/008-user-admin/SPEC.md) | User admin | identity | M1 | done |
| [009](identity/009-access-tokens/SPEC.md) | Personal access tokens | identity | M1 | done |
| [010](workspaces/010-scopes/SPEC.md) | Scopes | workspaces | M2 | done |
| [011](items/011-manifest-core/SPEC.md) | Manifest core | items | M2 | done |
| [012](items/012-submission-editor/SPEC.md) | Submission editor | items | M2 | done |
| [013](items/013-submit-withdraw/SPEC.md) | Submit and withdraw | items | M2 | done |
| [014](review/014-review-queue/SPEC.md) | Review queue | review | M3 | done |
| [015](review/015-release/SPEC.md) | Release | review | M3 | done |
| [016](items/016-version-management/SPEC.md) | Version management | items | M3 | done |
| [017](items/017-change-proposals/SPEC.md) | Change proposals | items | M3 | done |
| [018](catalogue/018-catalogue/SPEC.md) | Catalogue | catalogue | M3 | done |
| [019](cli-api/019-registry-read-api/SPEC.md) | Registry read API | cli-api | M4 | done |
| [020](cli-api/020-resolver/SPEC.md) | Resolver | cli-api | M4 | done |
| [021](renderers/021-renderer-harness/SPEC.md) | Renderer interface and golden-file harness | renderers | M4 | done |
| [022](cli-api/022-rmk-cli/SPEC.md) | `rmk` CLI | cli-api | M4 | done |
| [023](renderers/023-claude-code-renderer/SPEC.md) | Claude Code renderer | renderers | M4 | done |
| [024](renderers/024-codex-renderer/SPEC.md) | Codex renderer | renderers | M5 | done |
| [025](renderers/025-cursor-renderer/SPEC.md) | Cursor renderer | renderers | M5 | done |
| [026](renderers/026-support-matrix/SPEC.md) | Per-item support matrix | renderers | M5 | done |
| [027](cli-api/027-registry-mcp-server/SPEC.md) | Registry MCP server and `rmk mcp-setup` | cli-api | M5 | done |
| [028](renderers/028-copilot-renderer/SPEC.md) | GitHub Copilot renderer | renderers | M5b | done |
| [029](renderers/029-gemini-antigravity-renderers/SPEC.md) | Antigravity CLI and Gemini CLI renderers | renderers | M5b | done |
| [030](renderers/030-devin-renderer/SPEC.md) | Devin renderer | renderers | M5b | specified |
| [031](items/031-visual-composer/SPEC.md) | Visual composer | items | M6 | done |
| [032](web-ui/032-design-system/SPEC.md) | Design system and app shell | web-ui | M1 | done |
| [033](web-ui/033-in-app-help/SPEC.md) | In-app help | web-ui | M3 | done |
| [034](install/034-npm-packages/SPEC.md) | Publishing `rmk` and the MCP server to npm | install | M6 | done |
| [035](install/035-docker-hub-image/SPEC.md) | Publishing the web app's Docker image to Docker Hub | install | M6 | done |
| [036](install/036-web-setup/SPEC.md) | Web setup wizard | install | M6 | done |
| [037](cli-api/037-draft-upload-api/SPEC.md) | Draft upload API | cli-api | M7 | done |
| [038](export-import/038-rmk-export/SPEC.md) | `rmk export` for skills | export-import | M7 | done |
| [039](export-import/039-mcp-export-tools/SPEC.md) | MCP export tools | export-import | M7 | done |
| [040](export-import/040-export-more-types/SPEC.md) | Export more types | export-import | M7 | done |
| [041](export-import/041-export-dependencies/SPEC.md) | Dependencies on export | export-import | M7 | done |
| [042](export-import/042-export-change-proposal/SPEC.md) | Export a change as a proposal | export-import | M7 | done |
| [043](export-import/043-codex-cursor-readers/SPEC.md) | Export from Codex's and Cursor's files | export-import | M7 | done |
| [044](items/044-item-contents/SPEC.md) | See an item's contents on its page | items | M8 | done |
| [045](catalogue/045-item-overview-dashboard/SPEC.md) | Item overview dashboard | catalogue | M8 | done |
| [046](usage/046-usage-telemetry/SPEC.md) | Usage telemetry | usage | M9 | done |
| [047](usage/047-usage-on-item-page/SPEC.md) | Usage on the item page | usage | M9 | done |
| [048](items/048-runtime-requirements/SPEC.md) | Runtime requirements | items | M8 | dropped |
| [049](web-ui/049-local-time/SPEC.md) | Local time | web-ui | Across the app | done |
| [050](web-ui/050-help-popovers/SPEC.md) | Helpers as popovers | web-ui | Across the app | done |
| [051](export-import/051-update-drafts-on-export/SPEC.md) | Update your own drafts on export | export-import | M7 | done |
| [052](items/052-bulk-submit/SPEC.md) | Submit drafts in bulk | items | M7 | done |
| [053](export-import/053-export-descriptions/SPEC.md) | Every exported item has a description | export-import | M7 | done |
| [054](review/054-bulk-approve/SPEC.md) | Approve in bulk, with an optional message | review | M7 | done |
| [055](review/055-bulk-release/SPEC.md) | Release in bulk | review | M7 | done |
| [056](items/056-pending-dependencies/SPEC.md) | Dependencies on their way | items | M7 | done |
| [057](items/057-withdraw-archive-delete/SPEC.md) | Withdraw: archive or delete | items | M7 | done |
| [058](review/058-review-decisions-everywhere/SPEC.md) | Reject and request changes, from the queue and the page | review | M7 | done |
| [059](identity/059-multiple-roots/SPEC.md) | More than one root | identity | M1 | done |
| [060](web-ui/060-server-data-table/SPEC.md) | Server data table, first on the audit log | web-ui | Across the app | done |
| [061](web-ui/061-users-scopes-data-table/SPEC.md) | Users and Scopes on the server data table | web-ui | Across the app | done |
| [062](review/062-review-queue-data-table/SPEC.md) | The review queue on the server data table | review | Across the app | done |
| [063](web-ui/063-my-submissions-data-table/SPEC.md) | My submissions on the server data table | web-ui | Across the app | done |
| [064](catalogue/064-remove-scopes-page/SPEC.md) | Remove the Scopes page | catalogue | Across the app | done |
| [065](web-ui/065-mobile-foundations/SPEC.md) | Mobile foundations and phone tests | web-ui | M10 | done |
| [066](web-ui/066-mobile-navigation/SPEC.md) | Navigation on phones | web-ui | M10 | done |
| [067](web-ui/067-touch-primitives/SPEC.md) | Touch-ready primitives | web-ui | M10 | done |
| [068](web-ui/068-no-hover-only/SPEC.md) | Nothing behind hover | web-ui | M10 | specified |
| [069](web-ui/069-mobile-data-tables/SPEC.md) | Tables on phones | web-ui | M10 | specified |
| [070](web-ui/070-mobile-files-diffs/SPEC.md) | Files, code and diffs on phones | web-ui | M10 | specified |
| [071](web-ui/071-mobile-catalogue-item/SPEC.md) | Catalogue, item page and Documentation on phones | web-ui | M10 | specified |
| [072](web-ui/072-mobile-authoring/SPEC.md) | Writing items on a phone | web-ui | M10 | specified |
| [073](web-ui/073-mobile-review-release/SPEC.md) | Reviewing and releasing on a phone | web-ui | M10 | specified |
| [074](web-ui/074-mobile-account-admin/SPEC.md) | Account, Admin, sign-in and setup on phones | web-ui | M10 | specified |
| [075](web-ui/075-mobile-sign-off/SPEC.md) | Mobile sign-off | web-ui | M10 | specified |
| [076](plugin-feeds/076-plugin-builders/SPEC.md) | Plugin builders | plugin-feeds | M11 | done |
| [077](plugin-feeds/077-claude-code-marketplace/SPEC.md) | Claude Code marketplace from the instance | plugin-feeds | M11 | done |
| [078](plugin-feeds/078-plugin-feed-mirror/SPEC.md) | Plugin feed git mirror for Codex and Cursor | plugin-feeds | M11 | in progress |
| [079](plugin-feeds/079-plugin-feeds-at-scale/SPEC.md) | Plugin feeds at scale | plugin-feeds | M11 | done |
| [080](install/080-docker-https/SPEC.md) | Docker with a domain and HTTPS | install | M12 | in progress |
| [081](install/081-install-script/SPEC.md) | Install script | install | M12 | in progress |
| [082](install/082-server-npm-package/SPEC.md) | The server as an npm package | install | M12 | done |
| [083](install/083-service-unix/SPEC.md) | Running as a service on Linux and macOS | install | M12 | done |
| [084](install/084-bundles/SPEC.md) | Self-contained bundles | install | M12 | done |
| [085](install/085-unix-packages/SPEC.md) | Homebrew, .deb and .rpm packages | install | M12 | done |
| [086](install/086-service-windows/SPEC.md) | Running as a service on Windows | install | M12 | withdrawn |
| [087](install/087-windows-package/SPEC.md) | Windows installer and winget | install | M12 | withdrawn |
| [088](web-ui/088-docs-on-website/SPEC.md) | Documentation on the website | web-ui | Across the app | done |
| [089](items/089-dependency-picker-rule/SPEC.md) | Who can be picked as a dependency | items | Across the app | done |
| [090](workspaces/090-workspaces/SPEC.md) | Workspaces and the global workspace | workspaces | M13 | done |
| [091](workspaces/091-workspace-roles/SPEC.md) | Roles per workspace | workspaces | M13 | done |
| [092](workspaces/092-workspace-members/SPEC.md) | Workspace members | workspaces | M13 | done |
| [093](workspaces/093-private-workspaces/SPEC.md) | Private workspaces | workspaces | M13 | done |
| [094](workspaces/094-workspace-access-requests/SPEC.md) | Asking to join a workspace | workspaces | M13 | done |
| [095](cli-api/095-workspaces-cli-api/SPEC.md) | Workspaces in `rmk`, the MCP server and the API | cli-api | M13 | done |
| [096](items/096-any-dependency/SPEC.md) | Any item may depend on any other | items | Across the app | done |
| [097](items/097-frontmatter-references/SPEC.md) | Agents and skills named in frontmatter | items | Across the app | done |
| [098](operations/098-threat-model/SPEC.md) | Threat model and incident response | operations | M14 | done |
| [099](operations/099-backup-restore/SPEC.md) | Backup and restore | operations | M14 | done |
| [100](operations/100-structured-logs/SPEC.md) | Structured logs | operations | M14 | done |
| [101](operations/101-metrics-traces/SPEC.md) | Metrics, traces and health | operations | M14 | done |
| [102](operations/102-retention/SPEC.md) | Retention | operations | M15 | done |
| [103](operations/103-erase-user/SPEC.md) | Erase a user | operations | M15 | done |
| [104](operations/104-your-data/SPEC.md) | Your data | operations | M15 | done |
| [105](identity/105-two-factor-sign-in/SPEC.md) | Two-factor sign-in | identity | M16 | done |
| [106](identity/106-oidc-sign-in/SPEC.md) | Identity providers and OIDC sign-in | identity | M16 | done |
| [107](identity/107-rmk-login-device-flow/SPEC.md) | `rmk login --web`: the device flow | identity | M16 | in progress |
| [108](identity/108-scim-provisioning/SPEC.md) | SCIM provisioning | identity | M16 | done |
| [109](operations/109-shared-rate-limits/SPEC.md) | Shared rate limits | operations | M17 | done |
| 110 | S3-compatible storage | — | M17 | planned |
| 111 | Replicas checked | — | M17 | planned |
| [112](items/112-dependency-cycles/SPEC.md) | Submitted and released together, cycles included | items | Across the app | done |
| [113](workspaces/113-rename-workspaces/SPEC.md) | Renaming a workspace | workspaces | M13 | done |
| [114](workspaces/114-personal-workspaces/SPEC.md) | Personal workspaces | workspaces | M13 | done |
| [115](workspaces/115-move-scopes/SPEC.md) | Moving a scope to another workspace | workspaces | M13 | done |
| 116 | Per-workspace tokens | — | M13 | planned |
| 117 | Asking for a role | — | M13 | planned |
| [118](workspaces/118-workspace-in-names/SPEC.md) | The workspace in item names | workspaces | M13 | done |
| [119](web-ui/119-sidebar-navigation/SPEC.md) | Sidebar navigation | web-ui | Across the app | done |
| [120](workspaces/120-workspace-filter/SPEC.md) | Working in one workspace | workspaces | Across the app | done |
| [121](install/121-no-windows-server/SPEC.md) | No Windows server: WSL or a virtual machine instead | install | M12 | done |
| [122](web-ui/122-settings-tabs/SPEC.md) | Settings in tabs, and the Authentication tab | web-ui | M16 | done |
| [123](identity/123-user-profile-page/SPEC.md) | A page for each user, with the actions | identity | M16 | done |
| [124](catalogue/124-home-page-rework/SPEC.md) | Home page rework and the instance notice | catalogue | M18 | done |
| [125](catalogue/125-pins-and-favorites/SPEC.md) | Pinned items and favorites | catalogue | M18 | done |
| [126](web-ui/126-getting-started/SPEC.md) | Getting started checklist | web-ui | M18 | done |
| [127](feedback/127-send-feedback/SPEC.md) | Send feedback | feedback | M18 | done |
| [128](identity/128-change-password-first-sign-in/SPEC.md) | Change the password at first sign-in | identity | M18 | done |
| [129](web-ui/129-languages-foundation/SPEC.md) | Languages: the foundation | web-ui | M19 | done |
| [130](web-ui/130-languages-browse/SPEC.md) | Languages: browse | web-ui | M19 | done |
| [131](web-ui/131-languages-author/SPEC.md) | Languages: author and review | web-ui | M19 | done |
| [132](web-ui/132-languages-admin/SPEC.md) | Languages: admin and setup | web-ui | M19 | done |
| [133](web-ui/133-languages-signoff/SPEC.md) | Languages: sign-off | web-ui | M19 | done |
| [134](items/134-move-items/SPEC.md) | Moving an item to another scope | items | M13 | done |
| [135](security-ai/135-skill-scanner/SPEC.md) | Security scan of submissions (SkillSpector) | security-ai | M20 | done |
| [136](security-ai/136-scanner-settings-in-web/SPEC.md) | Scanner settings in Admin › Settings | security-ai | M20 | done |
| [137](security-ai/137-scan-gate-and-panel/SPEC.md) | Security scan: a summary, the details, and a score that blocks approval | security-ai | M20 | done |
| [138](web-ui/138-toasts/SPEC.md) | Toasts for the results of actions | web-ui | M21 | done |
| [139](web-ui/139-notification-center/SPEC.md) | Notification center | web-ui | M21 | done |
| [140](install/140-upgrade-check/SPEC.md) | Upgrade check: root learns a new version is out | install | M21 | done |
| [141](web-ui/141-language-settings/SPEC.md) | Languages on and off, and the instance's default | web-ui | M19 | done |
| [142](catalogue/142-search-index/SPEC.md) | Search index in the server | catalogue | M22 | specified |
| [143](catalogue/143-search-everywhere/SPEC.md) | Search on every page | catalogue | M22 | specified |
| [144](catalogue/144-search-file-contents/SPEC.md) | File contents in search, at scale | catalogue | M22 | specified |
| [145](cli-api/145-mcp-server-references/SPEC.md) | Reference MCP servers from items | cli-api | M23 | specified |
| [146](cli-api/146-mcp-server-setup/SPEC.md) | Install referenced MCP servers, with set-up steps | cli-api | M23 | specified |
| [147](security-ai/147-ai-providers/SPEC.md) | AI providers, set up once and shared | security-ai | M24 | specified |
| [148](security-ai/148-ai-triage/SPEC.md) | AI triage of submissions | security-ai | M24 | specified |
| [149](security-ai/149-triage-overlap/SPEC.md) | Triage: overlap with existing items | security-ai | M24 | specified |
| [150](security-ai/150-triage-guidance/SPEC.md) | Triage guidance, scanned before it's used | security-ai | M24 | specified |
| [151](security-ai/151-triage-report/SPEC.md) | Triage report for a workspace and the instance | security-ai | M24 | specified |
| [152](export-import/152-git-repositories/SPEC.md) | Git repositories and their credentials | export-import | M25 | specified |
| [153](plugin-feeds/153-git-push-feeds/SPEC.md) | Push the plugin marketplaces to git on every release | plugin-feeds | M25 | specified |
| [154](export-import/154-import-from-marketplaces/SPEC.md) | Import items from other marketplaces | export-import | M26 | specified |
| [155](export-import/155-follow-upstream/SPEC.md) | Following an imported item's source | export-import | M26 | specified |
| [156](security-ai/156-scanner-container/SPEC.md) | The security scanner as a ready-to-run container | security-ai | M20 | done, two acceptance checks left for after the merge |
| [157](identity/157-sign-in-redesign/SPEC.md) | Sign-in screens redesign | identity | M27 | done |
| [158](web-ui/158-typography-refinement/SPEC.md) | Typography refinement | web-ui | M27 | done |
| [161](install/161-setup-code/SPEC.md) | Setup code: only whoever started the server sets it up | install | M28 | done |
| [162](identity/162-token-lifetime-policy/SPEC.md) | Token lifetime policy, and tokens revoked when an account is recovered | identity | M28 | done |
| [163](review/163-override-reasons/SPEC.md) | Overrides need a reason | review | M28 | done |
| [164](workspaces/164-workspace-ai-consent/SPEC.md) | Workspaces consent before an AI provider sees their items | workspaces | M28 | specified |
| [165](operations/165-encrypted-backups/SPEC.md) | Backups encrypted by default | operations | M28 | specified |
| [166](operations/166-audit-context/SPEC.md) | Audit context: request, channel, client, workspace and outcome | operations | M28 | done |
| 167 | Audit events for what isn't recorded yet | — | M29 | planned |
| 168 | Audit export | — | M29 | planned |
| 169 | Auditor role | — | M29 | planned |
| 170 | Token scopes | — | M29 | planned |
| 171 | Review provenance for installers | — | M29 | planned |
| 172 | `rmk install` shows risk before it writes | — | M29 | planned |
| 173 | MCP writes tied to what the person saw | — | M29 | planned |
| 174 | Secrets found anywhere in an item | — | M29 | planned |
| 175 | Release signing with an instance key (MVP §14.2) | — | M30 | planned |
| 176 | Signed release files | — | M30 | planned |
| 177 | Container hardening | — | M30 | planned |
| 178 | Governance policies | — | M31 | planned |
| 179 | Approvals by risk | — | M31 | planned |
| 180 | Exceptions with an owner and an end date | — | M31 | planned |
| 181 | Settings history | — | M31 | planned |
| 182 | Access report and inactive accounts | — | M31 | planned |
| 183 | Session policy | — | M31 | planned |
| 184 | Service accounts | — | M31 | planned |
| 185 | Tamper-evident audit log | — | M31 | planned |
| 186 | Alerts and scheduled backups | — | M31 | planned |
| [187](platform/187-contributor-docs/SPEC.md) | Documentation for new contributors | platform | Repository | done |
| [188](platform/188-node-26-target/SPEC.md) | Node.js 26 as the target, each version tested once per risk | platform | Repository | done |
| [189](operations/189-outgoing-email/SPEC.md) | Outgoing email | operations | M32 | done |
| [190](identity/190-self-registration/SPEC.md) | Self-registration | identity | M32 | done |
| [191](identity/191-account-creation-rules/SPEC.md) | Who may create accounts | identity | M32 | done |
| [192](identity/192-google-linkedin-sign-in/SPEC.md) | Google and LinkedIn sign-in | identity | M32 | specified |
| [193](identity/193-sign-in-with-apple/SPEC.md) | Sign in with Apple | identity | M32 | specified |
| [194](identity/194-forgot-password-email/SPEC.md) | Forgot password by email | identity | M32 | done |
| [195](platform/195-fork-friendly-ci/SPEC.md) | Fork-friendly CI and contributing from a private copy | platform | Repository | specified |
| [196](identity/196-breached-passwords/SPEC.md) | Breached-password check | identity | M32 | specified |
| [197](identity/197-verified-email-change/SPEC.md) | Verified email change | identity | M32 | specified |
| [198](items/198-model-effort/SPEC.md) | Model and effort per AI tool | items | M33 | specified |
| [199](platform/199-features-by-domain/SPEC.md) | Features by domain, one file per milestone | platform | Repository | done |
| 200 | Sessions tied to the password they were made with | — | M32 | planned |
