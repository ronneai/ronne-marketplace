# 029 — Antigravity CLI and Gemini CLI renderers

> Milestone: M5b · Depends on: 021, 022, 025 · Design: [MVP §3.1](../../MVP/MVP.md#31-item-types), [§3.3](../../MVP/MVP.md#33-platform-renderers) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md), [`docs/spec/cli-files.md`](../../spec/cli-files.md)

> **On hold** since 2026-09-30 (owner): not implemented now. Before work starts, re-check this spec
> against what was built since and against the vendor's current docs.

## Goal

`rmk install --target antigravity` and `--target gemini` put every item type each tool can take
where it reads it, with golden files and warnings for the rest. Google's CLI is now two products
with different files, so this feature is two renderers that share what they can.

## Scope

**In:**
- An `antigravity` renderer (Antigravity CLI, `agy`, and what it shares with the Antigravity app)
  and a `gemini` renderer (Gemini CLI), in both scopes, following 023–025's shape.
- Leaving out what one reads from another target of the same install, as Cursor does (025).
- Golden files for every example item, and the end-to-end install through `rmk`.

**Out:**
- Antigravity plugins and Gemini CLI extensions as a way to install: MVP §3.3's native plugin
  export, later.
- Antigravity's workflows (retired on 2026-11-01) and the Antigravity app's project settings,
  which have no documented file.

## Two products

Checked on 2026-09-28 against developers.googleblog.com (the transition post),
antigravity.google/docs (cli/gcli-migration, skills, subagents, rules, hooks, mcp, permissions,
cli/statusline, plugins) and geminicli.com/docs (skills, subagents, gemini-md, custom-commands,
hooks, tools/mcp-server, reference/configuration, policy-engine, trusted-folders, extensions).
**Check again when this feature is built**, and update MVP §3.3.

Antigravity CLI was announced on 2026-05-19 and **replaced Gemini CLI for free, Google AI Pro and
Ultra users on 2026-06-18**. Gemini CLI is still released (v0.61.0 on 2026-09-23) for Gemini Code
Assist Standard and Enterprise. Google's own migration table moves the project folder from
`.gemini/` to `.agents/`, MCP out of `settings.json`, and remote MCP from `url`/`httpUrl` to
`serverUrl`. Tool names, agent fields and hook formats differ completely. So:

| | `antigravity` | `gemini` |
|---|---|---|
| For | Antigravity CLI (most users) | Gemini CLI (Code Assist Standard and Enterprise) |
| Project folder | `.agents/` | `.gemini/` |
| Picked up by | `.agents/rules/`, `.agents/agents/`, `.agents/hooks.json` or `.agents/mcp_config.json` (not `.agents/` alone: Codex, Cursor and Devin share `.agents/skills/`) | `.gemini/` or `GEMINI.md` |

## Where each reads things

| Type | Antigravity (project / user) | Gemini CLI (project / user) |
|---|---|---|
| `skill` | `.agents/skills/<n>/` / `~/.gemini/antigravity-cli/skills/<n>/` — native | `.agents/skills/<n>/` (read before `.gemini/skills/`) / `~/.agents/skills/<n>/` — native |
| `agent` | `.agents/agents/<n>.md` / `~/.gemini/config/agents/<n>.md` — native | `.gemini/agents/<n>.md` / `~/.gemini/agents/<n>.md` — native |
| `rule` | `.agents/rules/<n>.md` with `trigger`, `globs`, `description` / `~/.gemini/config/rules/<n>.md` — native | no rule files: a section in `GEMINI.md` / `~/.gemini/GEMINI.md`, `model` and `manual` rules as skills — native |
| `command` | as a skill (every skill is `/<n>`; no command files) — native | `.gemini/commands/<n>.toml` / `~/.gemini/commands/<n>.toml` — native |
| `hook` | `<n>` in `.agents/hooks.json` / `~/.gemini/config/hooks.json` — native | `hooks.<Event>` in `.gemini/settings.json` / `~/.gemini/settings.json` — native |
| `mcp-server` | `mcpServers.<n>` in `.agents/mcp_config.json` / `~/.gemini/config/mcp_config.json` — degraded (secrets, below) | `mcpServers.<n>` in `.gemini/settings.json` / `~/.gemini/settings.json` — native |
| `permission-policy` | none in a project (no documented file) / `permissions` in `~/.gemini/antigravity-cli/settings.json` — degraded | none in a project (`.gemini/policies/` is "currently non-functional", issue #18186) / `~/.gemini/policies/<n>.toml` — degraded |
| `statusline` | none in a project / `statusLine` in `~/.gemini/antigravity-cli/settings.json` — degraded | none (footer toggles only) |
| `output-style`, `lsp-server` | none | none |
| `bundle` | nothing of its own | nothing of its own |

A type that's `none` in the project but works in the home folder warns in project scope that it
can only go in the home folder (`--scope user`).

**What they read from other tools.** Both read `.agents/skills/`. Antigravity reads `AGENTS.md`
and `GEMINI.md` natively, so it would load Codex's (024) and Gemini CLI's rule sections too; Gemini
CLI reads `AGENTS.md` only when `context.fileName` says so, which `rmk` doesn't change. Neither
documents reading `.claude/`. So, with 025's `covered_by_target`:

| Target | Also a target | Leaves out |
|---|---|---|
| `antigravity` | `codex` or `gemini` | `always` and `glob` rules (already in `AGENTS.md` or `GEMINI.md`) |
| both | `codex`, `cursor`, `devin` | nothing: `.agents/skills/` is the same shared folder, written once |

## Behaviour by type

**Markers** as 023; TOML commands get a `#` marker on line 1.

### Antigravity

- **`skill`, `command`** — the shared `.agents/skills/` helpers (024, 025, 030), byte for byte what
  the other tools write. Antigravity makes every skill a slash command.
- **`agent`** — `name`, `description`, `tools` (Antigravity's names, below; a tool with none is an
  `unmapped_tool` warning; an empty list means no tools, so a manifest without `tools` leaves the
  key out), `model` from the hint (`fast` → `flash`, `strong` → `pro`; `default` → `inherit`) or
  `targets.antigravity.overrides.model`, and the prompt as the body. Antigravity notes that a
  misspelled tool can hang a subagent, which is why names come only from the table.
- **`rule`** — `.agents/rules/<n>.md`: `always` → `trigger: always_on`; `glob` → `trigger: glob` and
  `globs`, comma-separated; `model` → `trigger: model_decision` and `description`; `manual` →
  `trigger: manual`. A missing or misspelled `trigger` silently drops the rule, so the golden files
  pin it. Antigravity caps a rule file at 24,000 bytes and all always-on rules at 20,000 tokens;
  `rmk` warns about a body over 24,000 bytes.
- **`hook`** — one `json-key` per item, `<n>` in `hooks.json`, since Antigravity keys hooks by name:
  `{ "enabled": true, "PreToolUse": [{ "matcher": "<tool>", "hooks": [{ "type": "command",
  "command": "…", "timeout": 30 }] }] }` (timeout in seconds). Events: `tool.before` →
  `PreToolUse`, `tool.after` → `PostToolUse`, `agent.stop` → `Stop`; the rest warn. A
  `run.script` goes to `.agents/hooks/<n>/` and runs as `"$(git rev-parse --show-toplevel)"/…`,
  since no variable or working folder is documented (user scope: `"$HOME"/.gemini/config/hooks/…`).
- **`mcp-server`** (degraded) — `mcpServers.<n>` in `mcp_config.json`: stdio as `command` and
  `args`, http as `serverUrl`. Antigravity documents no way to reference an environment variable
  (its own example puts a literal token in `env`), and `rmk` never writes a secret, so `env`
  entries and headers that need one are left out with a warning naming each variable to set up in
  Antigravity; the server gets the environment Antigravity was started with (see Open questions).
- **`permission-policy`** (degraded, home folder only) — `json-array-item`s under
  `permissions.allow`, `.deny` and `.ask` in `~/.gemini/antigravity-cli/settings.json`: `shell` →
  `command(<prefix>)`, `read` → `read_file(<glob>)`, `edit` and `write` → `write_file(<glob>)`,
  `web-fetch` → `read_url(<domain>)`, `mcp:<s>/<t>` → `mcp(<s>/<t>)`.
- **`statusline`** (degraded, home folder only) — the script under
  `~/.gemini/antigravity-cli/statusline/<n>/`, and `statusLine` pointing at it; the value's exact
  shape is checked when built (the docs show `/statusline <script>`).

### Gemini CLI

- **`skill`** — the shared `.agents/skills/` helpers; Gemini CLI prefers `.agents/skills/` over
  `.gemini/skills/`.
- **`command`** — `.gemini/commands/<n>.toml` with `description` and `prompt` (a TOML multi-line
  string, as 024's agents). Gemini CLI passes what the person typed as `{{args}}`: with one
  argument, `{{name}}` becomes `{{args}}`; with more, they stay with 024's note and a warning.
- **`agent`** — `name` (Gemini CLI allows lowercase, digits, `-` and `_`, as item names already
  are), `description`, `tools` (Gemini CLI's names, below), `model` only from
  `targets.gemini.overrides.model` (the hints warn), and the prompt as the body.
- **`rule`** — as Codex's (024) with `GEMINI.md` for `AGENTS.md`: `always` and `glob` as a fenced
  section, `glob` opening with the files it's for; `model` and `manual` as skills.
- **`hook`** — a `json-array-item` under `hooks.<Event>` in `settings.json`: `{ "matcher":
  "<tool>", "hooks": [{ "type": "command", "command": "…", "name": "<n>", "timeout": 30000 }] }`
  (timeout in milliseconds: the manifest's seconds × 1000). Events below. A `run.script` runs as
  `"$GEMINI_PROJECT_DIR"/.gemini/hooks/<n>/…`. Gemini CLI fingerprints project hooks and warns
  about new ones, which `rmk` notes after an install.
- **`mcp-server`** — `mcpServers.<n>` in `settings.json`: stdio as `command`, `args` and `env` with
  `${NAME}`; http as `httpUrl` and `headers` with `${NAME}`.
- **`permission-policy`** (degraded, home folder only) — `~/.gemini/policies/<n>.toml`, one
  `[[rule]]` per rule: `toolName`, `commandPrefix` for shell patterns (a trailing `*` dropped),
  `decision` (`allow`, `deny`, `ask_user`), with the marker as a `#` comment.
- **Trusted folders:** Gemini CLI ignores `.gemini/settings.json` in a folder the person hasn't
  trusted, which `rmk` notes, as it does for Codex.
- **`settings.json` with comments:** Gemini CLI allows comments in it, and `rmk` edits JSON with a
  JSON parser, so a commented file is refused with a message, until the applier can keep comments.

**Mappings.**

| Canonical | Antigravity | Gemini CLI |
|---|---|---|
| `read` | `view_file` | `read_file` |
| `edit` | `replace_file_content` | `replace` |
| `write` | `write_to_file` | `write_file` |
| `grep` | `grep_search` | `grep_search` |
| `glob` | `find_by_name` | `glob` |
| `shell` | `run_command` | `run_shell_command` |
| `web-fetch` | `read_url_content` | `web_fetch` |
| `web-search` | `search_web` | `google_web_search` |
| `mcp:<s>/<t>` | not documented: a warning | `mcp_<s>_<t>` |
| `session.start`, `session.end` | none | `SessionStart`, `SessionEnd` |
| `prompt.submit` | none | `BeforeAgent` |
| `tool.before`, `tool.after` | `PreToolUse`, `PostToolUse` | `BeforeTool`, `AfterTool` |
| `agent.stop` | `Stop` | `AfterAgent` |
| `compact.before` | none | `PreCompress` |
| `permission.request`, `subagent.*` | none | none |

## Documentation

- **An Antigravity page and a Gemini CLI page** in the Documentation's "Installing" group, like the
  other tools': where each type goes, what's home-folder only, what's left to another target's copy,
  and good to know (the transition from Gemini CLI, trusted folders, MCP secrets in Antigravity).
- **Your AI tools:** rows for `antigravity` and `gemini`.
- **Items and types:** their chips appear on their own (026).

## Edge cases

- **A project with `.gemini/` and `.agents/rules/`:** both are detected, and `rmk` asks which (022).
- **Devin also reads `.agents/agents/`** (030): an Antigravity agent there, with Antigravity's tool
  names, would be loaded by Devin too. With both as targets, Devin leaves out its own copy only if
  the two are compatible; since their tool names differ, both are written and the Devin page says
  so (see Open questions).
- **An agent name with `_`:** fine for Gemini CLI; Antigravity has no documented pattern.

## Acceptance criteria

- [ ] Every example item renders for both renderers in both scopes to the paths and shapes above, and the golden files are committed.
- [ ] Tools and events map as in the table; anything unmappable, every `none` type, and home-folder-only types in a project are warnings.
- [ ] With Codex or Gemini CLI as targets too, Antigravity leaves out `always` and `glob` rules, with `covered_by_target`.
- [ ] No secret value is written: Gemini CLI uses `${NAME}`; Antigravity leaves secret fields out with a warning.
- [ ] End-to-end tests install a skill, an agent, a hook, an MCP server and a rule with `--target antigravity` and with `--target gemini`, and remove them cleanly.
- [ ] The two Documentation pages and rows are in place, with render tests.
- [ ] The locations are re-checked when built, and MVP §3.3 has an Antigravity column next to Gemini CLI's.

## Open questions

1. **Two renderers, `antigravity` and `gemini`** (recommended: different folders, tool names and
   formats, and people have one or the other), or only `antigravity`, since Gemini CLI now serves
   only Code Assist Standard and Enterprise.
2. **Antigravity's MCP secrets are left out with a warning** (recommended: `rmk` never writes secret
   values, and no reference syntax is documented), or written as `${NAME}` in case Antigravity
   expands it, to be checked when built.
3. **An agent for Antigravity and Devin both written** (recommended: their tool names differ, so one
   file can't serve both), or Devin leaves out its copy and relies on `.agents/agents/`.
4. **`~/.gemini/config/` for Antigravity's user rules, agents, hooks and MCP** (recommended: shared
   by the CLI, the app and the IDE), or the CLI's own `~/.gemini/antigravity-cli/`, which only the
   CLI reads.
