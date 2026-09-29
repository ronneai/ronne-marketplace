# 025 — Cursor renderer

> Milestone: M5 · Depends on: 021, 022 · Design: [MVP §3.1](../../MVP/MVP.md#31-item-types), [§3.3](../../MVP/MVP.md#33-platform-renderers) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md), [`docs/spec/cli-files.md`](../../spec/cli-files.md)

## Goal

`rmk install --target cursor` puts every item type Cursor can take where Cursor (the editor and
its `agent` CLI, which share these files) reads it, with golden files showing exactly what's
written, and warnings for what Cursor has no place for.

## Scope

**In:**
- A `cursor` renderer for the types Cursor takes, in both scopes, following 021 and 023's shape.
- Mapping the canonical tool names and hook events to Cursor's.
- Golden files for every example item, and the end-to-end install through `rmk`.

**Out:**
- Cursor's own plugin marketplace as a way to install (native plugin export, MVP §3.3, later).
- Team and Enterprise rule and hook locations: only project and user scope.

## Where Cursor reads things

Checked on 2026-09-28 against Cursor's documentation (cursor.com/docs: context/rules,
context/skills, context/subagents, context/mcp, agent/hooks, cli/reference/permissions and
configuration, plugins). **Check again when this feature is built** (CLAUDE.md), and update the
table and MVP §3.3 if anything moved.

| Type | Project | User | Support |
|---|---|---|---|
| `skill` | `.agents/skills/<n>/` (the cross-tool folder Cursor lists first; shared with Codex) | `~/.agents/skills/<n>/` | native |
| `agent` | `.cursor/agents/<n>.md` | `~/.cursor/agents/<n>.md` | native |
| `rule` | `.cursor/rules/<n>.mdc` | none: user rules live in Cursor's settings, not a file | native (project) / none (user) |
| `command` | as a skill, `.agents/skills/<n>/` with `disable-model-invocation: true` (Cursor migrated commands to skills) | `~/.agents/skills/<n>/` | native |
| `hook` | `hooks` in `.cursor/hooks.json`; a script in `.cursor/hooks/<n>/` | `~/.cursor/hooks.json`, `~/.cursor/hooks/<n>/` | native |
| `mcp-server` | `mcpServers.<n>` in `.cursor/mcp.json` | `~/.cursor/mcp.json` | native |
| `permission-policy` | `permissions` in `.cursor/cli.json` (the `agent` CLI only; the editor doesn't document it) | `~/.cursor/cli-config.json` | degraded |
| `output-style` | none | none | none |
| `statusline` | none: the CLI has a `statusLine` setting, but its shape isn't documented | none | none |
| `lsp-server` | none: built into the editor | none | none |
| `bundle` | nothing of its own | — | native |

`detect()` is true when the project has a `.cursor/` folder.

**Files shared with other tools.** `.agents/skills/<n>/` is the same folder Codex (024) reads, and
both renderers write it through the same core helpers (`render/agents-skills.ts`), so one `dir`
change serves both targets and 022 records it once with both. Cursor also reads Claude Code's
files: skills from `.claude/skills/`, agents from `.claude/agents/` (Cursor's own `.cursor/agents/`
wins on a name clash), and hooks from `.claude/settings.json`, `.claude/settings.local.json` and
`~/.claude/settings.json`, where "all matching hooks from every source run". The hooks import is
Cursor's "Include Third-Party Plugins, Skills, and Other Configs" setting, on by default.

So a renderer is told every target of the install (`RenderContext.targets`, added here), and when
Claude Code is one of them and the item doesn't turn Claude Code off, Cursor leaves out its own
copy of what it would read twice: **skills and commands** (unless Codex is a target too, since
`.agents/skills/` is written for Codex anyway) and **hooks**. Each gets a `covered_by_target`
warning (a new warning code) naming Claude Code's copy. Agents, rules, MCP servers and permissions
are still written: an agent name clash resolves to Cursor's own file, and the others aren't
imported.

## Behaviour by type

**Markers** as 023: `<!-- managed by rmk -->` after the frontmatter, `#` after a shebang; JSON
tracked through the state file.

**`skill`** — the item's folder as it is, `entry` renamed to `SKILL.md`. `SKILL.md`'s `name`
must match the folder, which the manifest already requires (spec §2).

**`agent`** — `name`, `description`, and `model` from `targets.cursor.overrides.model` (any other
override is an `invalid_override` warning); `fast` and `strong` have no documented Cursor ids, so a
hint is left out with an `unsupported_field` warning, and Cursor's `inherit` applies. The prompt is
the body. Cursor's agents have no `tools` field: a manifest that lists tools gets one
`unsupported_field` warning and the list is left out, and a list with none of `edit`, `write` or
`shell` becomes `readonly: true`, so a reviewer that couldn't change files still can't. Its
dependencies are installed as items of their own.

**`rule`** — `.cursor/rules/<n>.mdc`, by activation: `always` → `alwaysApply: true`; `glob` →
`alwaysApply: false` and `globs`, comma-separated and unquoted as in Cursor's own examples; `model` → `alwaysApply: false` and `description` (the manifest's);
`manual` → `alwaysApply: false` alone, used as `@<n>`. In user scope, rules are `none` (they live in
settings) with a warning that says so.

**`command`** — a skill with `description` and `disable-model-invocation: true`, run as `/<n>`.
Cursor doesn't document arguments for skills, so `{{name}}` placeholders stay as written and the
manifest's `args` are listed in the body as a note; an `unsupported_field` warning says arguments
aren't passed.

**`hook`** — one `json-array-item` under `hooks.<event>` in `hooks.json`:
`{ "type": "command", "command": "…", "timeout": 30, "matcher": "<Tool>" }`, and the file's
`"version": 1` as a `json-key` (see Edge cases). A `run.script` is copied to `.cursor/hooks/<n>/`
and run as `"$CURSOR_PROJECT_DIR"/…` (user scope: `"$HOME"/…`). Cursor passes the event as JSON on
stdin; `$RMK_` variables warn as in 023. Events with no equivalent (`permission.request`) warn and
are left out.

**`mcp-server`** — `mcpServers.<n>` in `mcp.json`: stdio as `command`, `args` and `env` with
`${env:NAME}` references (Cursor's syntax); http as `url` and `headers` with the same references.
No secret value is ever written.

**`permission-policy`** (degraded) — Cursor's CLI takes `Shell(<base command>)`, `Read(<glob>)`,
`Write(<glob>)`, `WebFetch(<domain>)` and `Mcp(<server>:<tool>)`, in `allow` and `deny` only.
So: `deny` and `allow` rules whose pattern is a bare command (`git`), a glob or a domain are
written; a shell pattern with arguments (`git push --force*`) can't be said without widening it to
the whole command, so it's left out with a warning; `ask` rules are left out with a warning, since
the CLI has no `ask`. The panel and `rmk` say the policy only applies to Cursor's CLI.

**`output-style`, `statusline`, `lsp-server`** — `none`: `rmk` warns and skips (MVP §3.3).

**Mappings.**

| Canonical | Cursor |
|---|---|
| tools `read`, `edit`, `write`, `grep`, `shell` | `Read`, `Write`, `Write`, `Grep`, `Shell` |
| `glob`, `web-fetch`, `web-search` (hook matchers) | no equivalent: a warning |
| `mcp:<server>/<tool>` | `MCP:<tool>` (Cursor matches on the tool name) |
| events `session.start`, `session.end`, `prompt.submit` | `sessionStart`, `sessionEnd`, `beforeSubmitPrompt` |
| `tool.before`, `tool.after` | `preToolUse`, `postToolUse` |
| `subagent.start`, `subagent.stop`, `compact.before`, `agent.stop` | `subagentStart`, `subagentStop`, `preCompact`, `stop` |
| `permission.request` | no equivalent: a warning |

## Documentation

- **Installing with rmk → a new section, "Cursor":** where each type goes, that skills and
  commands live in the shared `.agents/skills/` folder, that a permission policy only applies to
  Cursor's CLI, that output styles, status lines and language servers are skipped, and what
  happens with Claude Code and Cursor together.
- **Items and types → The types:** the Cursor column (026's matrix).
- The item page helper "Where does this go in Claude Code?" becomes "Where does this go in my
  tool?", covering the tools with renderers.

## Edge cases

- **`hooks.json`'s `version: 1`** is wanted by every hook item, identically. 022's applier merges an
  identical change from two targets into one entry; it must do the same for two items, and remove
  the key only when no item wants it (a small change to `planChanges`, done with this feature).
- **A skill in both `.agents/skills/` and `.claude/skills/`** (Claude Code and Cursor targets
  together): Cursor reads both; its precedence between them isn't documented. Not a renderer's
  problem to solve; see Open questions.
- **A rule item in user scope:** skipped with a warning that user rules live in Cursor's settings.

## Acceptance criteria

- [ ] Every example item renders in both scopes to the paths and shapes above, and the golden files are committed.
- [ ] Tools and events map as in the table; anything unmappable, and every `none` type, is a warning.
- [ ] `hooks.json` gets one `version` key however many hook items are installed, and keeps it until the last one leaves.
- [ ] No secret value is written for MCP servers; `${env:NAME}` references are used.
- [ ] The end-to-end test installs a skill, an agent, a hook and an MCP server with `rmk --target cursor`, and removes them, leaving the user's files untouched; installing with `claude-code,cursor` writes the shared skill folder once.
- [ ] The locations are re-checked against Cursor's documentation when this is built, and MVP §3.3 matches.

## Open questions

The owner hasn't answered these; they're built on the recommendations unless answered first.

1. **With Claude Code and Cursor both as targets, skills go only to `.agents/skills/`** and Claude
   Code's renderer skips `.claude/skills/` for them (recommended: Cursor reads both folders, so
   one copy avoids a skill appearing twice; Claude Code doesn't read `.agents/skills/`, though, so
   this needs 023 to write skills to `.claude/skills/` only when Cursor isn't a target, or as
   symbolic links), or each renderer writes its own folder and Cursor shows the skill twice.
2. **Shell permission rules with arguments are left out** (recommended: widening `git push
   --force*` to all of `git` would be wrong and harmful), or written as the base command with a
   warning.
