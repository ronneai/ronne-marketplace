# 026 — Per-item support matrix

> Milestone: M5 · Depends on: 018, 023 (024, 025 as they land) · Design: [MVP §3.3](../../MVP/MVP.md#33-platform-renderers), [§8](../../MVP/MVP.md#8-web-application)

## Goal

Before installing, people see which AI tools an item works in: the catalogue and the item page show,
for every built-in renderer, whether the item's type is supported natively, partly, or not at all,
and whether the item's manifest turns a tool off. The answer comes from the renderers themselves,
so it's always what `rmk` would do.

## Scope

**In:**
- The support matrix on the item page: one row per renderer in `RENDERERS` (021), from
  `supports(type)` and the manifest's `targets` (spec §4).
- Tool marks on catalogue cards and the home page's cards.
- A filter on the catalogue: items a given tool supports.
- The Documentation's types table gains a column per tool, replacing 023's Claude Code column.

**Out:**
- Anything renderer-specific beyond support levels (where a file goes is each renderer's
  Documentation section).
- Support for tools with no renderer yet: they simply aren't listed.

## Behaviour

**Levels**, as 021 defines them, with the manifest on top:

| Shown | When |
|---|---|
| `native` | `supports(type)` is `native` and the manifest doesn't disable the tool |
| `degraded` | `supports(type)` is `degraded` (the tool takes it through a workaround, such as Claude Code's language servers as plugins) |
| `off` | the manifest's `targets.<id>.enabled` is `false` for the shown version |
| `none` | `supports(type)` is `none`: `rmk` skips the item there with a warning |

**The item page** gets a **Tools** panel under Install: each renderer's name, its level as a badge
(`native` accent, `degraded` warning, `off` and `none` muted), and one line saying what the level
means for this item ("Installed as a local plugin", "Turned off in ronne.yaml", "Skipped: Codex
has no place for output styles"). Levels are computed for the version shown (`?version=` too),
since the manifest may differ between versions.

**Cards** (catalogue and home) show the tools that support the listed version natively or partly,
as small muted marks (`claude-code`, `codex`, `cursor`), and leave out `off` and `none`.

**The catalogue filter** `?tool=<id>` lists items whose listed version is `native` or `degraded`
for that renderer. It's computed at query time from the type and the listed version's manifest,
which the catalogue already reads: no new column.

**The API** (019) adds `support: { "<id>": "native" | "degraded" | "off" | "none" }` to item
summaries and versions, so `rmk info` (022) and the MCP server (027) can say the same.

**Where it lives:** a pure `supportOf(manifest, type)` in `packages/core/src/render/` over
`RENDERERS`, used by the web app, the API and `rmk`.

## Documentation

- **Items and types → The types:** the "In Claude Code" column becomes one column per tool with
  the level for each type, linking to that tool's section under Installing with rmk.
- **Installing with rmk → Installing:** a line on the Tools panel and the catalogue filter.
- **Inline helper on the item page's Tools panel:** "What do these levels mean?", linking to the
  types table.

## Edge cases

- **A renderer added later** (024, 025, tier 2): it appears everywhere at once, from `RENDERERS`.
- **A manifest that names a tool with no renderer** (`targets.copilot`): ignored on the page, as
  the schema allows any key.
- **A yanked or uninstallable item:** the matrix still shows, since a pinned install may still use it.

## Acceptance criteria

- [ ] `supportOf` gives the four levels from `supports()` and the manifest's `targets`, with unit tests.
- [ ] The item page's Tools panel shows every renderer with its level and line, for `latest` and for another version.
- [ ] Cards mark the supporting tools; `?tool=` filters the catalogue on all four databases.
- [ ] The API's summaries and versions carry `support`.
- [ ] The Documentation's types table has a column per tool, and the helper links to it.

## Open questions

1. **`off` counts as unsupported in the catalogue filter** (recommended: the item won't install
   there), or as supported, since a change proposal could turn it back on.
2. **Marks on cards for every tool** (recommended once there are three) or only when a tool is
   missing, to keep cards quiet.
