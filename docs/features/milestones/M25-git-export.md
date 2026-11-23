# M25 — Git export

> [All milestones](README.md) · [Features index](../README.md)

Planned on 2026-10-29, with M21, M22, M23, M24, M26, M27: why, and in what order, in [the milestones](README.md#planned-on-2026-10-29).

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [152](../export-import/152-git-repositories/SPEC.md) | Git repositories in Admin › Settings (root): an HTTPS URL, a branch, a use (push, read or both) and a write-only token encrypted and bound to the URL's origin, re-keyed by `rotate-secret`; 136's URL checks plus `RONNE_GIT_HOSTS`; Test connection; `isomorphic-git` | 136, 122, 090, 093, 098, 099 | specified |
| [153](../plugin-feeds/153-git-push-feeds/SPEC.md) | Push the plugin marketplaces to git on every catalogue change: 078's tree (from `@ronneai/core/plugins`, as `rmk feed build` writes it) plus a `skills/` tree for other tools, in an optional folder; never a force push, a conflict stops it; a private workspace only when its admins turn it on, personal ones never; 078's check by hand in each tool | 152, 076, 077, 079, 093, 114 | specified |
