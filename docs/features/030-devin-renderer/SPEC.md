# 030 — Devin renderer

> Milestone: M5b · Depends on: 021, 022, 025 · Design: [MVP §3.1](../../MVP/MVP.md#31-item-types), [§3.3](../../MVP/MVP.md#33-platform-renderers) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md), [`docs/spec/cli-files.md`](../../spec/cli-files.md)

## Goal

`rmk install --target devin` puts every item type Devin can take where Devin reads it, with golden
files showing exactly what's written, and warnings for what it has no place for. Devin Desktop
(formerly Windsurf) and the Devin CLI share one agent, Devin Local, and one set of files, so one
renderer serves both.

## Scope

**In:**
- A `devin` renderer (name "Devin", for Devin Desktop and the Devin CLI) for the types Devin takes,
  in both scopes, following 023–025's shape.
- Leaving out what Devin already reads from another target of the same install, as Cursor does
  (025), since Devin imports other tools' files by default.
- Golden files for every example item, and the end-to-end install through `rmk`.

**Out:**
- The removed Cascade agent's formats (workflows, `.devin/hooks.json` with `pre_*` events,
  `~/.codeium/windsurf/mcp_config.json`): Devin Local doesn't read them (see below).
- Devin's native plugins (`.devin-plugin/plugin.json`) as a way to install: MVP §3.3's native
  plugin feeds, later.
- Devin's cloud agent: only the local agent's files.

## Where Devin reads things

Checked on 2026-09-28 against docs.devin.ai (desktop/devin-local, desktop/devin-desktop-faq,
desktop/changelog, and cli/extensibility: skills, subagents, rules, hooks, mcp/configuration,
plugins; cli/reference: permissions, configuration/config-file, read-config-from,
global-vs-local). **Check again when this feature is built**, and update the table and MVP §3.3.

What changed since the September survey: Windsurf became **Devin Desktop** on 2026-06-02, and
**Cascade was removed on 2026-09-08**: "Devin Local is now the only agent available in Devin
Desktop", and it is "the Devin CLI agent harness". So everything reads the Devin CLI's formats;
`.windsurf/` still works but `.devin/` is preferred and wins. The docs contradict themselves on MCP
(the desktop pages still say `.devin/config.json` or `~/.codeium/…`); the CLI reference is current.

| Type | Project | User | Support |
|---|---|---|---|
| `skill` | `.agents/skills/<n>/` (shared with Codex and Cursor) | `~/.agents/skills/<n>/` | native |
| `agent` | `.devin/agents/<n>.md` | `~/.config/devin/agents/<n>.md` | native (Devin marks subagents as a preview) |
| `rule` | `.devin/rules/<n>.md` | `~/.devin/rules/<n>.md` | native |
| `command` | as a skill, `.agents/skills/<n>/`, run as `/<n>` (Devin Local dropped workflows: "migrate your workflows to skills") | `~/.agents/skills/<n>/` | native |
| `hook` | `.devin/hooks.v1.json` (the whole file is the hooks object) | `hooks` in `~/.config/devin/config.json` | native |
| `mcp-server` | `mcpServers.<n>` in `.devin/mcp_config.json` | `~/.config/devin/mcp_config.json` | native |
| `permission-policy` | `permissions.{allow,deny,ask}` in `.devin/config.json` | `~/.config/devin/config.json` | native |
| `output-style`, `statusline`, `lsp-server` | none: not documented | none | none |
| `bundle` | nothing of its own | — | native |

`detect()` is true when the project has a `.devin/` or a `.windsurf/` folder, or a
`.devinignore`.

**What Devin reads from other tools, by default** (`read_config_from`, all on): skills from
`.claude/skills/`, `.github/skills/` and `.windsurf/skills/`; Claude Code's commands as skills;
Claude Code's agents; hooks from `.claude/settings.json`; rules from `AGENTS.md`, `CLAUDE.md`,
`.cursor/rules/`; MCP servers from `.mcp.json`, `.cursor/mcp.json` and others (merged by name, so
the same server twice is one). So when another target of the same install writes a copy Devin
already reads, Devin leaves its own out, with 025's `covered_by_target` warning:

| Also a target | Devin leaves out |
|---|---|
| `claude-code` | skills and commands (unless Codex or Cursor is a target, since `.agents/skills/` is written for them anyway), agents, hooks |
| `cursor` | rules |
| `codex` | `always` and `glob` rules, which Codex writes into `AGENTS.md` |

An item that turns the other target off keeps Devin's own copy. MCP servers and permissions are
always written: servers merge by name, and permissions aren't imported.

## Behaviour by type

**Markers** as 023: `<!-- managed by rmk -->` after the frontmatter, `#` after a shebang; JSON
tracked through the state file.

**`skill`** — the item's folder through the shared helpers (`render/agents-skills.ts`), byte for
byte what Codex and Cursor write.

**`command`** — a skill through the shared `commandSkill`. Devin's skills say who may start them
with `triggers` (`[user]` for a command) rather than `disable-model-invocation`, so the shared
helper writes both, and `argument-hint` from the manifest's `args`, keeping one file right for all
three tools (see Open questions). Devin passes what the person typed after `/<n>`; `{{name}}`
placeholders stay with 024's note.

**`agent`** — `name`, `description`, the prompt as the body, `model` from
`targets.devin.overrides.model` (the `fast`/`strong` hints have no documented Devin ids: a
warning), and `allowed-tools`, which in a subagent is a real restriction, mapped from the
canonical tools (below); a tool with no Devin name is an `unmapped_tool` warning.

**`rule`** — `.devin/rules/<n>.md` by activation: `always` → `trigger: always_on`; `glob` →
`trigger: glob` and `globs`; `model` → `trigger: model_decision` and `description`; `manual` →
`trigger: manual`.

**`hook`** — one `json-array-item` under `<Event>` in `.devin/hooks.v1.json` (under
`hooks.<Event>` in the user config), in Claude Code's shape: `{ "matcher": "<tool>", "hooks": [{
"type": "command", "command": "…", "timeout": 30 }] }`. The event arrives as JSON on stdin; a
`run.script` goes to `.devin/hooks/<n>/` and runs as `"$DEVIN_PROJECT_DIR"/.devin/hooks/<n>/…`
(user scope: `"$HOME"/.config/devin/hooks/<n>/…`). Devin loads no hooks in Restricted Mode, which
`rmk` notes after an install that writes one.

**`mcp-server`** — `mcpServers.<n>` in `mcp_config.json`: stdio as `command`, `args` and `env`;
http as `url`, `transport: "http"` and `headers`. Secrets as `${env:NAME}`: documented for the
OAuth fields and by the legacy Cascade page for `env` and `headers`, but not yet by Devin Local's
own page for those (see Open questions). No secret value is ever written.

**`permission-policy`** — `json-array-item`s under `permissions.allow`, `.deny` and `.ask` in
`config.json`: `shell` → `Exec(<prefix>)` (a trailing `*` dropped; Devin matches prefixes),
`read` → `Read(<glob>)`, `edit` and `write` → `Write(<glob>)`, `web-fetch` → `Fetch(domain:<d>)`,
`mcp:<s>/<t>` → `mcp__<s>__<t>` (`mcp__<s>__*` for a whole server); `glob`, `grep` and
`web-search` have no permission and warn. Devin has `ask`, so nothing is lost there.

**`output-style`, `statusline`, `lsp-server`** — `none`: `rmk` warns and skips (MVP §3.3).

**Mappings.**

| Canonical | Devin |
|---|---|
| tools `read`, `edit`, `write`, `grep`, `glob`, `shell` | `read`, `edit`, `write`, `grep`, `glob`, `exec` |
| `web-fetch`, `web-search` | not documented: a warning |
| `mcp:<server>/<tool>` | `mcp__<server>__<tool>` |
| events `session.start`, `session.end`, `prompt.submit`, `permission.request` | `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PermissionRequest` |
| `tool.before`, `tool.after`, `agent.stop` | `PreToolUse`, `PostToolUse`, `Stop` |
| `subagent.start`, `subagent.stop`, `compact.before` | none (Devin has `PostCompaction`, after, not before): a warning |

## Documentation

- **A Devin page** in the Documentation's "Installing" group, like Claude Code's, Codex's and
  Cursor's: where each type goes; "With other tools" (what Devin imports, what `rmk` leaves to the
  other tool's copy, and `read_config_from`); good to know (Windsurf is now Devin, `.windsurf/`
  still read, subagents in preview, hooks off in Restricted Mode, MCP secrets as `${env:NAME}`).
- **Installing with rmk → Your AI tools:** Devin's row (target `devin`, picked up by `.devin/`).
- **Items and types:** Devin's chips appear on their own (026, from `RENDERERS`).

## Edge cases

- **A project with both `.windsurf/` and `.devin/`:** detected once; `rmk` writes only `.devin/`.
- **`.devin/config.json` the person wrote**, with other keys: `rmk` adds `permissions` entries and
  leaves the rest; hooks go to `hooks.v1.json`, so rmk never rewrites their `hooks`.
- **A rule Devin also finds in `AGENTS.md`** (written for Codex): Devin loads `AGENTS.md` too, so
  with Codex as a target, `always` and `glob` rules would load twice; they're left out, as the
  table says. `model` and `manual` rules, which Codex writes as skills in `.agents/skills/`, are
  the same skill for both.
- **Devin also reads `.agents/agents/`**, where Antigravity (029) writes its agents with its own
  tool names: with both as targets, Devin's own `.devin/agents/` file is still written, and the
  Devin page says an Antigravity agent may appear too (029's open question 3).
- **Two items with the same name from different scopes:** `name_clash`, as 023.

## Acceptance criteria

- [ ] Every example item renders in both scopes to the paths and shapes above, and the golden files are committed.
- [ ] Tools, events and decisions map as in the tables; anything unmappable, and every `none` type, is a warning.
- [ ] With Claude Code, Cursor or Codex as targets too, Devin leaves out exactly what the "also a target" table says, with `covered_by_target`.
- [ ] MCP servers use `${env:NAME}` only; no secret value is written.
- [ ] The end-to-end test installs a skill, an agent, a hook, an MCP server and a rule with `rmk` in a project with `.devin/`, and removes them, leaving the person's own `config.json` keys untouched.
- [ ] The Devin Documentation page, its row in Your AI tools, and its helpers are in place, with render tests.
- [ ] The locations are re-checked against Devin's documentation when this is built, and MVP §3.3 matches.

## Open questions

1. **The shared `commandSkill` also writes `triggers: [user]` and `argument-hint`** (recommended:
   one file that's right for Codex, Cursor and Devin; the others ignore keys they don't know), or
   Devin writes its own command skills under `.devin/skills/`, a second copy the other tools
   don't read.
2. **Leave out Devin's copy of what it imports** from other targets (recommended, as Cursor does:
   otherwise skills, agents, hooks and rules load twice), or write everything and tell people to
   turn imports off with `read_config_from`.
3. **`${env:NAME}` in MCP `env` and `headers`** (recommended: the syntax Devin documents for its
   other fields and did for Cascade), or confirm with Devin's docs when built and fall back to
   leaving secrets out with a warning.
4. **Renderer id `devin`, named "Devin"** (recommended: Desktop and the CLI share the files), or
   `devin-desktop`.
