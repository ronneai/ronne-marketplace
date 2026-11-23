# M26 — Import

> [All milestones](README.md) · [Features index](../README.md)

Planned on 2026-10-29, with M21, M22, M23, M24, M25, M27: why, and in what order, in [the milestones](README.md#planned-on-2026-10-29).

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [154](../export-import/154-import-from-marketplaces/SPEC.md) | Import from other marketplaces: skills, agents, commands, rules and MCP servers from a git repository, with skills.sh (Vercel's directory) search as a finder; drafts, reviewed and scanned like any other, with an Imported risk flag; source, commit and licence recorded, the licence file kept, nothing without a licence on root's list unless root records a permission note (flagged, kept out of git pushes until root allows); off by default, root says who and which hosts | 152, 037, 038, 040, 043, 051, 010, 135, 137, 014 | specified |
| [155](../export-import/155-follow-upstream/SPEC.md) | Follow an imported item's source: a daily check and Check now bring changes in as an updated draft or a change proposal onto `latest` and notify its maintainers; never submits or releases on its own; the licence checked again; stopped states shown with reasons | 154, 017, 042, 051, 102, 139 | specified |
