# Milestones

> [Features index](../README.md)

A milestone is the set of features listed in its file. Each file has the milestone's
introduction and one row per feature: what it does, what it depends on, and its status.

## M0 to M20

| Milestone |
|---|
| [M0 — Scaffolding & install](M00-scaffolding-install.md) |
| [M1 — Auth & users](M01-auth-users.md) |
| [M2 — Items & submissions](M02-items-submissions.md) |
| [M3 — Review & release](M03-review-release.md) |
| [M4 — `rmk` + Claude Code](M04-rmk-claude-code.md) |
| [M5 — Codex, Cursor, MCP](M05-codex-cursor-mcp.md) |
| [M5b — Tier-2 platforms (on hold)](M05b-tier-2-platforms.md) |
| [M6 — Visual composer and npm](M06-visual-composer-and-npm.md) |
| [M7 — Export from your tools](M07-export-from-your-tools.md) |
| [M8 — Catalogue improvements](M08-catalogue-improvements.md) |
| [M9 — Usage insights](M09-usage-insights.md) |
| [M10 — Mobile friendly](M10-mobile-friendly.md) |
| [M11 — Native plugin feeds](M11-native-plugin-feeds.md) |
| [Across the app](across-the-app.md) |
| [M12 — Easy install](M12-easy-install.md) |
| [M13 — Workspaces](M13-workspaces.md) |
| [M14 — Run it safely](M14-run-it-safely.md) |
| [M15 — Privacy and data lifecycle](M15-privacy-and-data-lifecycle.md) |
| [M16 — Company sign-in](M16-company-sign-in.md) |
| [M17 — More than one replica](M17-more-than-one-replica.md) |
| [M18 — Home, onboarding and feedback](M18-home-onboarding-and-feedback.md) |
| [M19 — Languages](M19-languages.md) |
| [M20 — Security scan](M20-security-scan.md) |

## Planned on 2026-10-29

The owner's next features (owner, 2026-10-29), built in this order: M21, then 141 (in M19), M22,
M23, M24, M25 and M26, after 137 (M20, in progress on its own branch). Each row's "Depends on"
names what must be `done` first. They were all specified at once, ahead of the usual "current
and next milestone" rule, at the owner's request: a spec is re-checked against what was built
since (and the vendors' current docs) before its work starts, as for one on hold.

| Milestone |
|---|
| [M21 — Feedback in the app](M21-feedback-in-the-app.md) |
| [M22 — Global search](M22-global-search.md) |
| [M23 — MCP servers in items](M23-mcp-servers-in-items.md) |
| [M24 — AI providers and triage](M24-ai-providers-and-triage.md) |
| [M25 — Git export](M25-git-export.md) |
| [M26 — Import](M26-import.md) |
| [M27 — Sign-in screens](M27-sign-in-screens.md) |

## Planned on 2026-11-01

What an organisation needs to run Ronne under its own rules, and to show that it does (owner,
2026-11-01, from a governance review of the code): only its operator sets a new server up; tokens
that don't outlive their purpose; reasons on the record; workspaces deciding what leaves the
server; backups that are safe to keep; an audit log that can be traced, filtered, exported and
trusted; least privilege for machines; trust signals on developers' machines; and policies that a
workspace can make stricter. Built in this order: M28, M29, M30, M31. M28 is specified; M29 to M31
are planned rows, specified when each milestone starts (the usual "current and next milestone"
rule). Numbers missing from the sequence are reserved.

| Milestone |
|---|
| [M28 — Governance foundations](M28-governance-foundations.md) |
| [M29 — Evidence and least privilege](M29-evidence-and-least-privilege.md) |
| [M30 — Trust and hardening](M30-trust-and-hardening.md) |
| [M31 — Configurable governance](M31-configurable-governance.md) |

## Planned on 2026-11-20

People can create their own accounts on an instance that root opens to the public, and Ronne can
send email (owner, 2026-11-20). Root decides who may sign up, by email domain and by the way they
come in (a password, Google, LinkedIn, Apple or a company provider), and whether new accounts wait
for approval. Forgotten passwords are reset by an emailed code. The user's safety comes first,
following OWASP's cheat sheets and NIST SP 800-63B-4: nothing tells whether an account exists, codes
are short-lived and limited, an email alone never signs anyone in, and every change to how someone
signs in is told to them by email. Personal data is kept only as long as it's needed. Built in this
order: 109 (M17's shared rate limits, so every limit holds across replicas and restarts) first, then
189 → 190 → 191 → 194 → 196 → 197 → 192 → 193.

| Milestone |
|---|
| [M32 — Open sign-up and email](M32-open-sign-up-and-email.md) |

## Planned on 2026-11-21

Skills, agents and commands say which model and effort they expect in each AI tool, so cheap work
runs on a cheap model and token use stays balanced (owner, 2026-11-21). Root decides which models
the instance allows and what each tier means, and a project can adjust the tiers for itself.

| Milestone |
|---|
| [M33 — Model and effort per AI tool](M33-model-and-effort-per-ai-tool.md) |

## Outside the milestones

| Milestone |
|---|
| [Outside the milestones](repository.md) |
