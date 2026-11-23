# M11 — Native plugin feeds

> [All milestones](README.md) · [Features index](../README.md)

A Ronne instance offers its released items as plugin marketplaces that Claude Code, Codex and
Cursor add as a source (owner, 2026-10-03). Claude Code reads one live from the instance with a
token; Codex and Cursor only add git repositories, so `rmk` builds a mirror. The contract is
[`docs/spec/plugin-feeds.md`](../../spec/plugin-feeds.md).

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [076](../plugin-feeds/076-plugin-builders/SPEC.md) | Plugin builders in `@ronneai/core/plugins`: an item and its dependencies (a bundle and its members) as a Claude Code, Codex or Cursor plugin through the renderers; deterministic zips; each tool's marketplace file | 020, 021, 023, 024, 025, 026 | done |
| [077](../plugin-feeds/077-claude-code-marketplace/SPEC.md) | Claude Code marketplace from the instance: `GET /api/v1/feeds/claude-code/marketplace.json` and plugin zips behind a token, built once per version and cached; `rmk plugin-setup claude-code` with `headersHelper: rmk auth headers`; the Plugin marketplaces topic | 076, 009, 019, 022, 027 | done |
| [078](../plugin-feeds/078-plugin-feed-mirror/SPEC.md) | Git mirror for Codex and Cursor: the feeds for both tools, `rmk feed build --out <dir>` (deterministic, touches only what it wrote), a scheduled CI workflow to keep the repository current | 076, 077 | in progress (tasks 1–5 built; task 6, the check by hand, is done in 153) |
| [079](../plugin-feeds/079-plugin-feeds-at-scale/SPEC.md) | Plugin feeds at scale: a benchmark of the marketplaces at 1,000–10,000 items, a catalogue revision and an in-memory marketplace cache, build stats with warnings past 80% of Claude Code's limits (log and Admin › Settings), the 5 MiB cap only for Claude Code with the git mirror as the fallback; per-scope marketplaces wait for a measured trigger | 077, 078 | done |
