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
`{ "command": "…", "timeout": 30, "matcher": "<Tool>" }` (`type` defaults to `command`), and the
file's `"version": 1` as a `json-key` that every hook item wants (see Edge cases). A `run.script` is
copied to `.cursor/hooks/<n>/` and run by its path from where Cursor runs hooks: the project root
(`.cursor/hooks/<n>/…`), or `~/.cursor/` in user scope (`hooks/<n>/…`). Cursor passes the event as
JSON on stdin; `$RMK_` variables warn as in 023. A tool with no Cursor matcher (`glob`,
`web-search`, an MCP server without a tool) is an `unmapped_tool` warning, and the hook runs for
every tool. Events with no equivalent (`permission.request`) warn and are left out. With Claude
Code also a target, the hook is left to Claude Code's copy, which Cursor runs (see above).

**`mcp-server`** — `mcpServers.<n>` in `mcp.json`: stdio as `command`, `args` and `env` with
`${env:NAME}` references (Cursor's syntax); http as `url` and `headers`, each `${NAME}` in a header
becoming `${env:NAME}`. No secret value is ever written.

**`permission-policy`** (degraded) — `permissions` in the `agent` CLI's config (`.cursor/cli.json`,
or `~/.cursor/cli-config.json` in user scope), which takes `Shell(<command>)` or
`Shell(<command>:<args glob>)`, `Read(<glob>)`, `Write(<glob>)`, `WebFetch(<domain>)` and
`Mcp(<server>:<tool>)`, in `allow` and `deny` only. So a shell pattern becomes its first word and
the rest as the arguments glob (`git push --force*` → `Shell(git:push --force*)`); a rule with no
pattern covers everything (`Shell(*)`, `Read(**)`); `edit` and `write` are both `Write`; `glob`,
`grep` and `web-search` have no permission and warn; `ask` rules are left out with a warning,
since the CLI has no `ask`. Cursor's docs don't say whether the arguments glob matches the rest of
the command as one string; `rmk` notes after an install that the policy only applies to Cursor's
CLI.

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

- **The Cursor page** in the Documentation's "Installing" group (024 made one page per tool): where
  each type goes; "With Claude Code" (Cursor reads Claude Code's skills, agents and hooks through
  Third-Party Imports, so rmk leaves skills, commands and hooks to Claude Code's copy); good to know
  (the shared `.agents/skills/`, rules by activation and none in user scope, read-only agents,
  `${env:NAME}`, permissions for the CLI only, what's skipped).
- **Installing with rmk:** Cursor's row in "Your AI tools" (target `cursor`, picked up by
  `.cursor/`), and the Installing step names `cursor`.
- **Items and types** follows the owner's mockup (`docs/UI-Mocks-Materials/stitch_ronne.ai/docs-items`,
  2026-09-29), with the mockup's placeholder text replaced by what the app does:
  - a callout for the type rule, the risk flag and the one approval every item needs;
  - filter chips for all types or one of four groups (core capabilities, integrations,
    guardrails, environment), with a legend;
  - per group, a numbered heading and one row per type: its name, risk flag and description, and a
    card per AI tool with where it goes (✓) or "Skipped", from each renderer's `supports()` and the
    tool pages' path lists (`features/docs/tool-paths.ts`), linking to the tool's page;
  - dependency cards generated from core's `DEPENDENCY_TYPES`.
  Left out from the mockup, since the app has no such thing: the "Validate Spec" button, a spec
  version, multi-maintainer review, the per-type tags and the "Adapter Docs" link. The risk flag
  stays amber, since the design system keeps red for errors.
- The item page helper "Where does this go in my AI tool?" covers Cursor.

## Edge cases

- **`hooks.json`'s `version: 1`** is wanted by every hook item, identically. 022's applier merges an
  identical change from two targets into one entry; it must do the same for two items, and remove
  the key only when no item wants it (a small change to `planChanges`, done with this feature).
- **A skill in both `.agents/skills/` and `.claude/skills/`** (Claude Code and Cursor targets
  together): Cursor reads both; its precedence between them isn't documented. Not a renderer's
  problem to solve; see Open questions.
- **A rule item in user scope:** skipped with a warning that user rules live in Cursor's settings.

## Acceptance criteria

- [x] Every example item renders in both scopes to the paths and shapes above, and the golden files are committed.
- [x] Tools and events map as in the table; anything unmappable, and every `none` type, is a warning.
- [x] `hooks.json` gets one `version` key however many hook items are installed, and keeps it until the last one leaves.
- [x] No secret value is written for MCP servers; `${env:NAME}` references are used.
- [x] The end-to-end test installs a skill, an agent, a hook, an MCP server and a rule in a project with `.cursor/` (so Cursor is the detected target), then with `claude-code,cursor`, where the skill and the hook are written once (Claude Code's copies), and removes them, leaving the person's own MCP server untouched. A CLI test covers `codex,cursor` sharing `.agents/skills/`.
- [x] The in-app Documentation has Cursor's page, its row in "Your AI tools", the reworked Items and types page and the item page helper, with render tests.
- [x] The locations are re-checked against Cursor's documentation when this is built, and MVP §3.3 matches.

## Open questions

The owner started 025 (2026-09-29) without answering these, so it's built on the recommendations,
as revised by the re-check; any can still change.

1. **With Claude Code and Cursor both as targets, Cursor leaves skills, commands and hooks to
   Claude Code's copy** (built: Cursor reads `.claude/skills/` and imports Claude Code's hooks by
   default, and runs every hook it finds, so its own copy would be a second one), or each renderer
   writes its own and the person turns off Cursor's Third-Party Imports. The spec's first
   recommendation, writing only `.agents/skills/`, would have left Claude Code without the skill.
2. ~~Shell permission rules with arguments are left out~~ — answered by the re-check: Cursor's
   CLI takes `Shell(<command>:<args glob>)`, so they're written without widening (2026-09-29).
