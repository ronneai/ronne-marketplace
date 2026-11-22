# M33 — Model and effort per AI tool

> [All milestones](README.md) · [Features index](../README.md)

Skills, agents and commands say which model and effort they expect in each AI tool, so cheap work
runs on a cheap model and token use stays balanced (owner, 2026-11-21). Root decides which models
the instance allows and what each tier means, and a project can adjust the tiers for itself.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [198](../items/198-model-effort/SPEC.md) | Model and effort per AI tool: a portable `model` block (tier `fast`/`default`/`strong`, effort `low`/`medium`/`high`) on skills, agents and commands, with a pin per tool in `targets.<tool>.overrides`; root's allowed models, tier map and tier efforts per tool on a Models tab of Admin › Settings, read by `rmk` from `GET /api/v1/model-policy`; `rmk.config.json` replacing tiers or turning pins off within root's list; Claude Code writes them on all three types, Codex and Cursor on agents only, and every other case warns and installs | 023, 024, 025, 026, 076, 078, 097, 122, 129, 166 | specified |
