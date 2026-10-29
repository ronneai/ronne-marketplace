# 150 — Triage guidance, scanned before it's used

> Milestone: M24 · Depends on: 148, 137, 135, 092 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("AI triage", "Security scan") · Contracts: none changed

## Goal

Root and a workspace's admins add their own guidance to triage: house rules for any item type, or a
focus on a topic ("every agent says which tools it needs", "our Jira skills use the company's
project keys") (owner, 2026-10-29). That text goes into the model's instructions, so it's checked
first: when the security scan is on, guidance is scanned by SkillSpector and used only once the
scan lets it through.

## Scope

**In:**
- **Guidance entries**, each with:
  - a title (1–80 characters) and a body (Markdown, 1–20,000 characters);
  - the item types it applies to (all by default);
  - optional **topics**: up to 10 keywords; with any, the entry applies only to items whose name,
    description or keywords contain one;
  - on or off.
- **Where they're written:**
  - instance guidance, by root, in Admin › Settings › AI triage, applied to every triaged item;
  - workspace guidance, by the workspace's admins (092) and root, on the workspace's settings page,
    applied to its items only.
- **How they're used:** a run includes, after Ronne's own instructions, the instance's entries then
  the workspace's that apply, each in a delimited block marked as guidance from the instance or the
  workspace, at most 32 KiB in all (instance first; what's cut is listed in the result). Ronne's
  rules always come first and say guidance can't change the answer's shape or ask for tools.
- **The result names the guidance it used** (titles), so a reviewer knows what shaped it.
- **Scanned when the scan is on** (135, 137):
  - each save of an entry queues a scan of its text, packaged as a one-file skill (`SKILL.md` with
    the body), with the scan's static or semantic setting;
  - an entry is **used** only when its latest scan finished under 137's threshold (no threshold:
    finished at all); a waiting, failed or over-threshold scan keeps it out (fail closed, as 137);
  - the entry shows the scan's card (137's), and the editor its findings;
  - root can **override** an entry's scan with a reason, audited as
    `triage.guidance_scan_override`; workspace admins can't;
  - with the scan off, entries are used as saved, and the editor says they weren't scanned.
- **Audit:** `triage.guidance_created`, `_changed`, `_deleted`, `_toggled`, with the title, scope
  (instance or workspace) and types; never the body.

**Out:**
- **Guidance from authors or reviewers** per submission. Later; a reviewer's comment does that today.
- **Guidance for the security scan itself.** SkillSpector takes no instructions from Ronne.
- **Versioning guidance.** The latest saved text is used; the audit log says when it changed.

## Behaviour

- **Scans of guidance** reuse the scan job and its limits, as a second kind of target: the job takes
  revisions and guidance alike, oldest first.
- **Editing an entry** keeps the previous text in use until the new text's scan lets it through; the
  editor says "Your changes will be used once they're scanned". Turning off, deleting and narrowing
  types take effect at once.
- **Which entries applied** is decided when a run starts; the run stores their titles and ids.
- **Who sees guidance:** instance guidance, root; a workspace's, its members (read-only for all but
  admins), so authors know the house rules.

## Edge cases

- **The threshold is set or lowered later:** entries are checked against it when a run starts; one
  now over it stops being used, and the editor says why.
- **A workspace deleted or turned personal** (it can't be today): its guidance goes with it.
- **A scope moved to another workspace** (115): its items get the new workspace's guidance.
- **Guidance in another language:** used as written.
- **Erasure** (103): entries stay; the audit rows are anonymised as any.

## Data

- Migration `triage_guidance`: `id`, `workspace_id` (null for the instance, cascade), `title`, `body`,
  `types` (JSON), `topics` (JSON), `enabled`, `used_text` (the text last let through), `created_by`,
  `updated_by`, `created_at`, `updated_at`.
- Scans of guidance: a target table beside `content_scans` (`guidance_scans`, the same columns with
  `guidance_id` instead of `revision_id`), or a nullable target pair on `content_scans`; the plan's
  task 2 picks after checking what the three dialects allow for changing `revision_id`'s `not null`.
- `content_triages.guidance` (JSON): the ids and titles used.

## Documentation

- **AI triage** (`ai-triage#guidance`): writing guidance, types and topics, the order, the cap.
- **Security scan** (`security-scan#guidance`): guidance is scanned, failing closed, root's override.
- **Workspaces** (`workspaces#settings`): the workspace's guidance.
- **Helpers:** the editor's "How is guidance used?" → `ai-triage#guidance`; the scan card's "Why
  isn't this used yet?" → `security-scan#guidance`.

## Acceptance criteria

- [ ] Root and a workspace's admins create, edit, turn off and delete guidance; members read their
  workspace's; others see nothing.
- [ ] A run includes the instance's then the workspace's entries that apply by type and topic, under
  the cap, and the result names them.
- [ ] With the scan on, an entry is used only after a scan under the threshold, failing closed; root's
  override is required past it and audited; an edit keeps the old text until the new one passes.
- [ ] With the scan off, entries are used as saved.
- [ ] Changes are audited without the body.
- [ ] Screens in the three languages; the phone sweep passes.
- [ ] The Documentation and inline helpers listed above say what the feature does.

## Decisions

1. **Guidance is scanned and fails closed** (owner, 2026-10-29: "this extra context should be scanned
   by the NVIDIA security scan, if enabled"; failing closed follows 137).
2. **The last passed text stays in use while an edit is scanned** (Claude): editing shouldn't switch
   guidance off for everyone.

## Open questions

- Should workspace admins be able to override their own guidance's scan, as they can't approve past
  the gate today?
