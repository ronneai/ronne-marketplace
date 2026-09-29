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

**The item page** gets a **Works in** panel under Install: each renderer's name (linking to its
Documentation page), its level as a badge (`supported` accent, `partly` warning, `turned off` and
`skipped` muted), and one line saying what the level means for this item: where it goes, with the
item's own name in the path (`.claude/agents/kit-agent.md`), "…with some of it left out", "This
version's ronne.yaml keeps it away from this tool", or "Codex has no place for output-style items,
so rmk skips it there with a warning". Levels are computed for the version shown (`?version=` too),
since the manifest may differ between versions. The panel replaces the header's "Where does this go
in my AI tool?" helper, which it answers.

**Cards** (catalogue and home) say which tools the listed version installs in, natively or partly,
in their footer line ("published 2026-09-29 · works in Claude Code, Codex, Cursor"), leaving out
`off` and `none` ("works in no built-in tool" when nothing's left). The catalogue's form has a
"Works in" select for the filter.

**The catalogue filter** `?tool=<id>` lists items whose listed version is `native` or `degraded`
for that renderer: the item's type is one the renderer takes, and the version's manifest doesn't
turn the tool off. The catalogue doesn't read manifests, and reading `targets` out of stored JSON
isn't the same on SQLite, PostgreSQL and MySQL, so each version keeps the tools its manifest turns
off in a small column, `item_versions.disabled_targets` (migration 0011, written at release and
backfilled), padded as ` cursor codex ` so the filter is one `NOT LIKE '% <id> %'` everywhere, as
`keywords` is for search (018). The type counts follow the filter; the web page drops an unknown
tool, and the API answers it with a 400.

**The API** (019) adds `support: { "<id>": "native" | "degraded" | "off" | "none" }` to item
summaries and versions, so `rmk info` (022) and the MCP server (027) can say the same.

**Where it lives:** `packages/core/src/render/support.ts` over `RENDERERS`: `supportOf(manifest,
type)`, `supportFor(type, disabled)` for rows that keep only the column, `disabledTargets(manifest)`
and `installsIn(level)`. A type a tool can't take stays `none` even when turned off.

## Documentation

- **Items and types → The types:** already one card per tool and type since 025's rework, each from
  the renderer's `supports()` and linking to the tool's page; nothing more to add.
- **Installing with rmk → Your AI tools:** a paragraph on the item page's Works in panel, the
  catalogue's Works in filter, `rmk search <query> --target <tool>` and `rmk info`'s levels.
- **Inline helper on the item page's Works in panel:** "What do these mean?" (`support`), linking to
  the types list. It replaces the header's "Where does this go in my AI tool?" helper, which the
  panel itself now answers.

`rmk` says the same as the web app: `rmk info` prints each tool's level for the version, and
`rmk search` takes `--target <tool>` (the id it uses for installs) as the API's `?tool=`.

## Edge cases

- **A renderer added later** (024, 025, tier 2): it appears everywhere at once, from `RENDERERS`.
- **A manifest that names a tool with no renderer** (`targets.copilot`): ignored on the page, as
  the schema allows any key.
- **A yanked or uninstallable item:** the matrix still shows, since a pinned install may still use it.

## Acceptance criteria

- [x] `supportOf` gives the four levels from `supports()` and the manifest's `targets`, with unit tests.
- [x] The item page's Works in panel shows every renderer with its level and line, for `latest` and for another version.
- [x] Cards mark the supporting tools; `?tool=` filters the catalogue on all four databases.
- [x] The API's summaries and versions carry `support`, and `?tool=` filters them (400 for an unknown tool).
- [x] The Documentation's types list shows every tool per type, the Your AI tools section explains the panel and the filters, and the helper links to the types list.

## Open questions

1. **`off` counts as unsupported in the catalogue filter** (recommended: the item won't install
   there), or as supported, since a change proposal could turn it back on.
2. **Marks on cards for every tool** (recommended once there are three) or only when a tool is
   missing, to keep cards quiet.
