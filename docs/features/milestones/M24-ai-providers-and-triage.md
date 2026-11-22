# M24 — AI providers and triage

> [All milestones](README.md) · [Features index](../README.md)

Planned on 2026-10-29, with M21, M22, M23, M25, M26, M27: why, and in what order, in [the milestones](README.md#planned-on-2026-10-29).

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [147](../security-ai/147-ai-providers/SPEC.md) | AI providers, set up once and shared: Admin › Settings › AI providers lists named providers (135's six kinds, keys sealed and write-only, 136's endpoint checks, Test connection), the environment's read-only and winning; the security scan and triage each pick one and a model; 136's settings move over at start-up; Ronne's own model client (no tools, no SDK); one Allow AI providers switch per private or personal workspace, for the semantic scan and triage alike (without it the scan runs static) | 136, 122, 106, 098, 099, 092, 093, 114, 164 | specified |
| [148](../security-ai/148-ai-triage/SPEC.md) | AI triage of submissions: advice on improving each submitted revision, and a draft on request; advisory, never a gate; root turns it on and picks types; private workspaces need their admins' consent, personal ones the owner's; files sent as untrusted data, fixed-shape answers shown as text; a Triage tab and card on the review page, the submission page and the editor; daily limits | 147, 135, 137, 014, 093, 114 | specified |
| [149](../security-ai/149-triage-overlap/SPEC.md) | Triage overlap: candidates from the search index, the model judging duplicate, overlaps or related, and recommending depend on it, propose a change, keep both or merge; compared only with what the revision's workspace may see | 148, 142, 144 | specified |
| [150](../security-ai/150-triage-guidance/SPEC.md) | Triage guidance, scanned before it's used: root for the instance and a workspace's admins for theirs, by item type and topic; each entry scanned by SkillSpector when the scan is on and used only under 137's threshold (fails closed, root may override); the last passing text stays in use while an edit is scanned | 148, 137, 135, 092 | specified |
| [151](../security-ai/151-triage-report/SPEC.md) | Triage report for a workspace and the instance: duplicates, items to retire, items to improve and gaps; on request once a day and an optional weekly instance report; six kept; private workspaces only with their consent | 149, 150, 090 | specified |
