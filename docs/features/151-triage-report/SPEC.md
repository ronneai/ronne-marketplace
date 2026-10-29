# 151 — Triage report for a workspace and the instance

> Milestone: M24 · Depends on: 149, 150, 090 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("AI triage") · Contracts: none changed

## Goal

Triage per submission (148, 149) keeps new items good; this looks at what's already published, so a
workspace, and the whole registry, has the best set of items rather than a pile (owner, 2026-10-29:
"the goal is to have an optimal setup, in a workspace level and in general as well"). A report lists
duplicates to merge, items to retire, weak descriptions, and gaps.

## Scope

**In:**
- **Who runs one:**
  - a workspace's report: its admins and moderators, and root;
  - the instance report: root, covering `global`, the public workspaces, and private or personal ones
    only if they allow AI providers (147).
- **When:** on request (**Run report**), at most once a day per workspace and once a day for the
  instance; and, if root turns it on, weekly for the instance.
- **What it looks at:** the published items' latest versions (name, type, description, keywords,
  dependencies, usage counts from 046 when kept, deprecations), and groups of similar items from the
  search index (149's candidates, pairwise among the workspace's items).
- **What it says**, in 148's fixed-shape JSON:
  - **duplicates and overlaps**: groups of items, with a recommendation (merge into one, depend on one,
    keep);
  - **retire**: items unused, deprecated but still depended on, or superseded;
  - **improve**: items whose description or metadata is weak (the worst 20);
  - **gaps**: themes the items reference but nothing provides (an MCP server named but not in the
    registry, say);
  - a summary.
  Every item named must be one it was given; others are dropped.
- **Where it shows:** a **Report** tab on the workspace's page and an **AI triage report** page for
  root under Admin; the latest report and the five before it, each with when, who, the model and
  host, and what was cut. Each item links to its page; a group offers "Propose a change" on the item
  to keep (017).
- **Limits:** counted with 148's daily limit (a report counts as one run per batch it sends); a report
  sends at most 10 batches of 40 items.
- **Audit:** `triage.report_requested` (workspace or instance, by whom), `settings.triage` for the
  weekly switch.

**Out:**
- **Acting on the report.** People merge, deprecate and propose changes as today.
- **Reports by email or notification.** With the notification center (139) a later change can say a
  report is ready.
- **Reports across instances.** Federation is §14.1.

## Behaviour

- A report runs as a job of its own, in batches, so a big workspace doesn't hit the timeout; a batch
  that fails is listed as such and the report still shows the others.
- Root's instance report never names a private workspace's item to anyone but root; a workspace's
  report includes only its own items and public ones they overlap with.
- Usage numbers come only from what 046 kept under root's policy; none with usage off.

## Edge cases

- **An empty workspace:** "Nothing to report yet."
- **A workspace that hasn't consented and is private:** its admins see "Allow AI providers for this
  workspace to run a report" (147's switch).
- **Items moved since a report** (115, 134): the old report keeps their names; links follow aliases.
- **Retention:** six reports per workspace and for the instance; older ones deleted when a new one
  finishes.

## Data

- Migration `triage_reports`: `id`, `workspace_id` (null for the instance, cascade), `requested_by`,
  `status`, `model`, `provider_host`, `result` (long text, JSON), `batches`, `failed_batches`,
  `input_tokens`, `output_tokens`, `queued_at`, `finished_at`.
- `instance_settings`: `triage_weekly_report`.

## Documentation

- **AI triage** (`ai-triage#reports`): what a report checks, who can run one, how often, what it
  sends.
- **Workspaces** (`workspaces#report`): the Report tab.
- **Helpers:** the Report tab's "What is in a report?" → `ai-triage#reports`.

## Acceptance criteria

- [ ] A workspace's admins, moderators and root run its report; the instance report is root's; others
  get not found.
- [ ] A report includes only items its readers may see, and private workspaces' only with consent.
- [ ] Names the model gives that weren't sent are dropped.
- [ ] Once a day per workspace and for the instance; the weekly run when on; six kept.
- [ ] A failed batch is reported and the rest shown.
- [ ] Screens in the three languages; the phone sweep passes.
- [ ] The Documentation and inline helper listed above say what the feature does.

## Decisions

1. **On request and weekly, not continuous** (Claude): a report sends many items; a person asking, or
   root's weekly run, keeps the cost known.

## Open questions

- Should a report's suggestion open a draft change proposal with the suggested text already in it?
