# 023 — Claude Code renderer

> Milestone: M4 · Depends on: 021 · Design: [MVP §3.1](../../MVP/MVP.md#31-item-types), [§3.3](../../MVP/MVP.md#33-platform-renderers), [§4.3](../../MVP/MVP.md#43-install--update) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md), [`docs/spec/cli-files.md`](../../spec/cli-files.md)

## Goal

`rmk install --target claude-code` puts every item type into Claude Code the way Claude Code reads
it today, in the project or in the user's home folder, with golden files that show exactly what's
written. It's the first real renderer, so it also proves 021's interface on every change kind.

## Scope

**In:**
- A `claude-code` renderer for all 11 types, in both scopes, following 021.
- Mapping the canonical tool names, hook events and model hints to Claude Code's.
- Golden files for every example item.

**Out:**
- Claude Code's plugin marketplace as a way to install (native plugin export, MVP §3.3, later).
- Features Claude Code has that no item type describes yet (themes, monitors, workflows).

## Where Claude Code reads things

Checked on 2026-09-28 against Claude Code's documentation (code.claude.com/docs: skills,
sub-agents, memory, hooks, mcp, permissions, output-styles, statusline, plugins-reference,
tools-reference). **Check again when this feature is built** (CLAUDE.md), and update the table and
MVP §3.3 if anything moved.

| Type | Project | User | Support |
|---|---|---|---|
| `skill` | `.claude/skills/<n>/` (`SKILL.md` + files) | `~/.claude/skills/<n>/` | native |
| `agent` | `.claude/agents/<n>.md` | `~/.claude/agents/<n>.md` | native |
| `rule` | `.claude/rules/<n>.md`; model or manual activation as a skill | `~/.claude/rules/<n>.md` | native |
| `command` | as a skill, `.claude/skills/<n>/SKILL.md` (Claude Code merged commands into skills; `.claude/commands/` is legacy) | `~/.claude/skills/<n>/` | native |
| `hook` | `hooks` in `.claude/settings.json`; a script in `.claude/hooks/<n>/` | `~/.claude/settings.json`, `~/.claude/hooks/<n>/` | native |
| `mcp-server` | `mcpServers.<n>` in `.mcp.json` | `mcpServers.<n>` in `~/.claude.json` | native |
| `permission-policy` | `permissions.allow` / `ask` / `deny` in `.claude/settings.json` | `~/.claude/settings.json` | native |
| `output-style` | `.claude/output-styles/<n>.md` | `~/.claude/output-styles/<n>.md` | native |
| `statusline` | `statusLine` in `.claude/settings.json`; the script in `.claude/statusline/<n>/` | `~/.claude/…` | native |
| `lsp-server` | a local plugin with `.lsp.json` (Claude Code only takes LSP servers from plugins) | same, in the home folder | degraded |
| `bundle` | nothing of its own: its members are installed as items | — | native |

`<n>` is the item's name without the scope. `detect()` is true when the project has a `.claude/`
folder or a `CLAUDE.md`.

**`AGENTS.md`.** Claude Code now reads `AGENTS.md`, but by default only when there's no `CLAUDE.md`
in the project. This renderer never writes `CLAUDE.md` or `AGENTS.md`: rules go to `.claude/rules/`,
which Claude Code always reads, so the Codex renderer (024) can own `AGENTS.md` without changing
what Claude Code loads.

## Behaviour by type

**Markers.** Markdown files carry `<!-- managed by rmk: @scope/name@1.4.0 -->` on the line after
their frontmatter (Claude Code needs `---` on line 1). Scripts carry it as a `#` comment after the
shebang. JSON is tracked through the state file only (021, 022).

**`skill`** — the item's folder is copied as it is, with `SKILL.md` as the entry (renamed if the
manifest's `entry` differs). Executable bits are kept.

**`agent`** — one Markdown file: frontmatter `name` (`<n>`), `description` (the manifest's),
`tools` (mapped, below; left out when the manifest omits them, so Claude Code's default applies),
`model` (mapped), then the prompt file as the body. The agent's dependencies are installed as their
own items; nothing else is added to its frontmatter.

**`rule`** — by activation:
- `always`: `.claude/rules/<n>.md` with no frontmatter;
- `glob`: `.claude/rules/<n>.md` with `paths:` set to the globs;
- `model`: a skill whose `description` is the manifest's, so Claude loads it when it's relevant;
- `manual`: a skill with `disable-model-invocation: true`, which people run as `/<n>`.

**`command`** — a skill: `description`, `argument-hint` from `args`, `arguments` naming them, and
`disable-model-invocation: true` (commands are run by people). `$ARGUMENTS` stays; `{{name}}`
becomes `$name`.

**`hook`** — one entry in `hooks.<Event>` of the settings file:
`{ "matcher": "<Tool>", "hooks": [{ "type": "command", "command": "…", "timeout": 30 }] }`. A
`run.script` is copied to `.claude/hooks/<n>/` and run as
`"$CLAUDE_PROJECT_DIR"/.claude/hooks/<n>/<script>` (an absolute path in user scope). Claude Code
passes the event as JSON on stdin; a command that uses a canonical `$RMK_…` variable gets an
`unsupported_field` warning (see Open questions).

**`mcp-server`** — `mcpServers.<n>`: for `stdio`, `command`, `args` and `env` as
`{ "GITHUB_TOKEN": "${GITHUB_TOKEN}" }`; for `http`, `"type": "http"`, `url` and `headers`, whose
`${VAR}` references Claude Code expands itself. No secret value is ever written (MVP §4.3). After
installing, rmk says that Claude Code asks once before it uses a project's MCP servers.

**`permission-policy`** — each rule becomes one string in `permissions.<decision>`: `shell` →
`Bash(<pattern>)`, `read`/`edit`/`write` → `Read(…)`/`Edit(…)`/`Write(…)`, `web-fetch` →
`WebFetch(domain:<pattern>)`, `mcp:<server>/<tool>` → `mcp__<server>__<tool>`; with no pattern, the
tool name alone. A rule Claude Code can't express is left out with an `unsupported_field` warning.

**`output-style`** — the style file, with `name` and `description` in its frontmatter. It isn't
switched on: rmk says how to pick it (`/output-style`), since choosing a style is the person's call.

**`statusline`** — the script goes to `.claude/statusline/<n>/`, and `statusLine` is set to
`{ "type": "command", "command": "<script path>" }`. A project has one status line: a second
statusline item is a conflict that names the first.

**`lsp-server`** — Claude Code only loads language servers from plugins. The renderer writes a
local plugin, `.claude/rmk-plugins/<n>/` with `.claude-plugin/plugin.json` and `.lsp.json`
(`command`, `args`, `extensionToLanguage` from `languages`), and a local marketplace listing the
plugins rmk wrote, which it registers and enables in the settings file. It's `degraded` because
it goes through Claude Code's plugin system rather than a setting of its own; how a project enables
a local marketplace is checked again when this is built.

**Mappings.**

| Canonical | Claude Code |
|---|---|
| tools `read`, `edit`, `write`, `glob`, `grep`, `shell`, `web-fetch`, `web-search` | `Read`, `Edit`, `Write`, `Glob`, `Grep`, `Bash`, `WebFetch`, `WebSearch` |
| `mcp:<server>`, `mcp:<server>/<tool>` | `mcp__<server>`, `mcp__<server>__<tool>` |
| events `session.start`, `session.end`, `prompt.submit` | `SessionStart`, `SessionEnd`, `UserPromptSubmit` |
| `tool.before`, `tool.after`, `permission.request` | `PreToolUse`, `PostToolUse`, `PermissionRequest` |
| `subagent.start`, `subagent.stop`, `compact.before`, `agent.stop` | `SubagentStart`, `SubagentStop`, `PreCompact`, `Stop` |
| model `default`, `fast`, `strong` | left out (inherits), `haiku`, `opus` |

**Arrays in settings.** Hooks and permission rules are elements of JSON arrays, which a key path
can't point to. They're recorded as a new state kind, `json-array-item`: the array's key path and
the canonical JSON hash of the element (added to 021 and cli-files.md with this spec). rmk removes
exactly that element, and reports a conflict when it's gone or changed.

## Edge cases

- **Two installed items with the same name in different scopes** (`@a/fmt`, `@b/fmt`): their
  folders and keys would clash, so the second fails with `name_clash` (see Open questions).
- **A skill folder the user already has, not written by rmk:** a conflict; it's never overwritten.
- **User scope and `~/.claude.json`:** Claude Code rewrites this file itself; rmk edits only its own
  `mcpServers` keys and keeps everything else as it finds it.
- **Settings JSON with comments or trailing commas:** refused with a clear message rather than
  rewritten.

## Documentation

- **Installing with rmk → a new section, "Claude Code":** where each type goes in the project and
  in the home folder (this spec's table, in plain words); that rules go to `.claude/rules/` and
  `rmk` never writes `CLAUDE.md` or `AGENTS.md`; that Claude Code asks once before using a
  project's MCP servers; how to pick an installed output style; and that language servers come as a
  small local plugin.
- **Items and types → The types:** each type's row links to where it goes in Claude Code.
- **Inline helper on the item page**, next to the type: "Where does this go in Claude Code?".

## Acceptance criteria

- [ ] Every example item renders in both scopes to the paths and shapes above, and the golden files are committed.
- [ ] Tool names, hook events and model hints map as in the table, and anything unmappable is a warning, not a failure.
- [ ] Hooks and permission rules are added and removed as single array elements (`json-array-item`), leaving other elements alone.
- [ ] No secret value is written for MCP servers; env vars are referenced.
- [ ] An end-to-end test installs a skill, an agent, a hook and an MCP server into a temporary project with `rmk --target claude-code`, and removes them, leaving files that weren't rmk's untouched.
- [ ] The locations are re-checked against Claude Code's documentation when this is built, and MVP §3.3 matches.
- [ ] The Claude Code section, the types table's links and the item page helper are in the app, matching what the renderer writes.

## Open questions

The owner started 023 (2026-09-28) without answering these, so it's built on the recommendations;
any can still change.

1. **Same-named items from two scopes fail** with `name_clash` (recommended for the MVP: the
   folder names stay what people expect), or the second is written as `<scope>-<name>`.
2. **Canonical hook variables such as `$RMK_FILE_PATHS`:** warn and leave them to the hook's own
   stdin parsing (recommended until a second renderer needs them), or generate a small wrapper
   script that sets them from Claude Code's JSON.
3. **`lsp-server` through a local plugin and marketplace** (recommended: it's the only way Claude
   Code takes language servers), or `none` for Claude Code until it has a setting for them.
