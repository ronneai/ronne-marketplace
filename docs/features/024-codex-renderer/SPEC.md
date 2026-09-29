# 024 — Codex renderer

> Milestone: M5 · Depends on: 021, 022 · Design: [MVP §3.1](../../MVP/MVP.md#31-item-types), [§3.3](../../MVP/MVP.md#33-platform-renderers) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md), [`docs/spec/cli-files.md`](../../spec/cli-files.md)

## Goal

`rmk install --target codex` puts every item type Codex CLI can take where Codex reads it, with
golden files showing exactly what's written, and warnings for what Codex has no place for. It's
the first renderer to write TOML, so the applier learns to edit TOML keys.

## Scope

**In:**
- A `codex` renderer for the types Codex takes, in both scopes, following 021 and 023's shape.
- `toml-key` changes in 022's applier (reading, editing key by key, removing), through a TOML
  library chosen by the dependency checklist.
- Golden files for every example item, and the end-to-end install through `rmk`.

**Out:**
- Codex's plugin marketplace (`.agents/plugins/marketplace.json`) as a way to install (native
  plugin export, MVP §3.3, later).
- Admin (`/etc/codex`) and cloud-managed locations: only project and user scope.

## Where Codex reads things

Checked on 2026-09-28 against OpenAI's Codex documentation (learn.chatgpt.com/docs: build-skills,
agent-configuration/agents-md, subagents and rules, hooks, extend/mcp, config-file/config-basic,
config-advanced and config-reference, custom-prompts, plugins). **Check again when this feature is
built** (CLAUDE.md), and update the table and MVP §3.3 if anything moved.

| Type | Project | User | Support |
|---|---|---|---|
| `skill` | `.agents/skills/<n>/` (the cross-tool folder, shared with Cursor) | `~/.agents/skills/<n>/` | native |
| `agent` | `.codex/agents/<n>.toml` | `~/.codex/agents/<n>.toml` | native |
| `rule` | a section in `AGENTS.md` at the project root (Codex takes one instructions file per folder; `always` and `glob`); `model` and `manual` as skills | a section in `~/.codex/AGENTS.md` | native |
| `command` | as a skill, `.agents/skills/<n>/` (Codex's custom prompts are deprecated, and have no project scope) | `~/.agents/skills/<n>/` | native |
| `hook` | `hooks` in `.codex/hooks.json`; a script in `.codex/hooks/<n>/` | `~/.codex/hooks.json`, `~/.codex/hooks/<n>/` | native |
| `mcp-server` | `[mcp_servers.<n>]` in `.codex/config.toml` | `[mcp_servers.<n>]` in `~/.codex/config.toml` | native |
| `permission-policy` | `.codex/rules/<n>.rules` (Starlark; Codex marks rules experimental) | `~/.codex/rules/<n>.rules` | degraded |
| `output-style` | none: Codex has a fixed `personality` setting, not installable styles | none | none |
| `statusline` | none: `tui.status_line` takes built-in item ids only, no command | none | none |
| `lsp-server` | none: not documented | none | none |
| `bundle` | nothing of its own | — | native |

`detect()` is true when the project has a `.codex/` folder.

**Trust.** Codex reads a project's `.codex/config.toml`, hooks and rules only once the person has
trusted the project, and runs hooks only after they're reviewed in `/hooks`. `rmk` says both after
an install that wrote any of them.

**Files shared with Cursor.** `.agents/skills/<n>/` is the same folder Cursor (025) reads, so one
`dir` change serves both targets and 022 records it once with both.

## Behaviour by type

**Markers** as 023 where comments are allowed: `<!-- -->` in Markdown, `#` in TOML and scripts and
`.rules` files; JSON tracked through the state file.

**`skill`** — the item's folder as it is, `entry` renamed to `SKILL.md`.

**`agent`** — a TOML file: `name = "<n>"`, `description`, and `developer_instructions` as a
multi-line string holding the prompt file's text, with the marker as a `#` comment on line 1.
Codex agents have no tool list and no `fast`/`strong` model ids, so tools and the model hint are
left out with an `unsupported_field` warning each; `targets.codex.overrides.model` sets Codex's
`model` key, and any other override is an `invalid_override` warning. Its dependencies are installed as items of
their own; a manifest that names an MCP server the agent uses could become `[mcp_servers.<n>]`
inside the agent file later (see Open questions).

**`rule`** — by activation: `always` → a fenced `section` in `AGENTS.md` (`rmk:begin`/`rmk:end`,
021), `glob` → the same section, opening with one line saying which files it's for, since Codex has
no glob scoping; `model` → a skill whose description is the manifest's; `manual` → a skill, used as
`/<n>`, with `disable-model-invocation: true` as Cursor's commands have it. The section is appended after what's there; a project's own `AGENTS.md` text is never
touched (022). Codex caps the concatenated instructions at 32 KiB: `rmk` warns when `AGENTS.md`
passes it after an install.

**`command`** — a skill with `description` and `disable-model-invocation: true`; `{{name}}`
placeholders stay, and the manifest's `args` are listed after the body as a note, with an
`unsupported_field` warning that skills don't take arguments. The folder is written by the same
core helpers as Cursor's (`render/agents-skills.ts`), byte for byte, so with both targets it's one
state entry: Codex doesn't document `disable-model-invocation`, so it may still pick the skill on
its own.

**`hook`** — one `json-array-item` under `hooks.<Event>` in `hooks.json`, Codex's shape being
Claude Code's: `{ "hooks": [{ "type": "command", "command": "…", "timeout": 30 }] }`, with the
same event names (`SessionStart`, `PreToolUse`, `PostToolUse`, `PermissionRequest`,
`UserPromptSubmit`, `Stop`, `PreCompact`, `SubagentStart`, `SubagentStop`, `SessionEnd`). Codex's
`matcher` is a regular expression over its own tool names, which its docs don't list, so the
matcher is left out with an `unsupported_field` warning when the manifest sets one: the hook
runs for every tool and reads the event on stdin. A `run.script` goes to `.codex/hooks/<n>/`,
run as `"$(git rev-parse --show-toplevel)"/.codex/hooks/<n>/…` (Codex finds project hooks at the
repository root and documents no variable for it), or `"$HOME"/…` in user scope. `$RMK_` variables
in a command warn as in 023.

**`mcp-server`** — `[mcp_servers.<n>]` as `toml-key` changes in `config.toml`: stdio as
`command`, `args` and `env_vars = ["NAME", …]` (Codex passes named variables through: no values,
no `${VAR}`); http as `url`, with `Authorization: "Bearer ${VAR}"` becoming `bearer_token_env_var =
"VAR"`, any other header that references `${VAR}` becoming `env_http_headers`, and literal headers
`http_headers`. A header shape Codex can't say is an `unsupported_field` warning.

**`permission-policy`** (degraded) — `.codex/rules/<n>.rules`: one `prefix_rule` per `shell` rule,
the pattern split into words with a trailing `*` dropped (`git push*` → `["git", "push"]`), and
`decision` mapped `allow` → `allow`, `ask` → `prompt`, `deny` → `forbidden`. Rules for other tools
have no Codex form and are left out with a warning, as is a shell pattern with a wildcard anywhere
but the end. Codex matches whole words, so a `*` attached to an option (`--force*`) warns that the
option no longer covers longer ones (`--force-with-lease`); on a plain word (`push*`) it doesn't.
The file starts with the marker as a `#` comment, and isn't written when no rule is left.

**`output-style`, `statusline`, `lsp-server`** — `none`: `rmk` warns and skips (MVP §3.3).

**TOML in the applier.** `toml-key` edits read the file, set or delete the key path, and write it
back keeping the other keys, through `smol-toml` (BSD-3-Clause, no dependencies; checklist in
the plan's notes). A file left with no keys is removed. Comments and the person's own layout in a
file rmk edits aren't kept (the library writes one canonical layout): the plan lists every TOML
file whose rewrite loses something, and `rmk` prints a note for each, which happens only the first
time, since rmk's own layout survives a rewrite. The state file's hash is the canonical JSON of the
value, as for JSON keys (cli-files.md).

**Mappings.**

| Canonical | Codex |
|---|---|
| events `session.start`, `session.end`, `prompt.submit`, `permission.request` | `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PermissionRequest` |
| `tool.before`, `tool.after`, `subagent.start`, `subagent.stop`, `compact.before`, `agent.stop` | `PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop`, `PreCompact`, `Stop` |
| tool names (hook matchers, agent tools) | not documented: a warning |
| decisions `allow`, `ask`, `deny` | `allow`, `prompt`, `forbidden` |

## Documentation

- **Each AI tool gets its own page** in the Documentation's "Installing" group (owner's request,
  2026-09-28): **Claude Code** (where each type goes, good to know), **Codex** (where each type
  goes; trust and hook review; good to know: the shared `.agents/skills/`, the 32 KiB instructions
  cap, MCP secrets by variable name, dropped TOML comments, what's skipped) and **Cursor** (not
  supported yet, and which of the other tools' files it already reads). 025 fills in Cursor's.
- **Installing with rmk → Your AI tools:** replaces the per-tool sections with a table of tools,
  targets and what makes rmk pick each up, linking to their pages; the Installing step names
  `--target codex` and both tools.
- **Items and types → The types:** an "In Codex" column next to Claude Code's, linking to each
  tool's page (026 turns the columns into its support matrix).
- The item page helper, now "Where does this go in my AI tool?", covers Claude Code and Codex and
  links to "Your AI tools" (025 adds Cursor).

## Edge cases

- **`AGENTS.md` doesn't exist:** the section becomes the whole file; removing the last section
  removes the file (022).
- **`config.toml` doesn't exist:** created with only rmk's table; removing the last key removes
  the empty parent table, and the file if nothing is left.
- **A `.codex/config.toml` key Codex ignores in projects** (`model_provider` and others): rmk never
  writes those.
- **Two items with the same name from different scopes:** `name_clash`, as 023.

## Acceptance criteria

- [x] Every example item renders in both scopes to the paths and shapes above, and the golden files are committed.
- [x] `toml-key` changes are created, replaced, removed and detected as edited or unmanaged by the applier, with unit tests, keeping other keys; the TOML library passes the dependency checklist.
- [x] Events and decisions map as in the table; anything unmappable, and every `none` type, is a warning.
- [x] MCP servers reference variables by name only; no secret value is written.
- [x] The end-to-end test installs a skill, an agent, a hook, an MCP server and a rule with `rmk` in a project with `.codex/` (so Codex is the detected target), and removes them, leaving the user's `AGENTS.md` text and `config.toml` keys untouched.
- [x] The in-app Documentation has a page per AI tool (Claude Code, Codex, Cursor), the types table's Codex column and the updated item page helper, with render tests.
- [x] The locations are re-checked against Codex's documentation when this is built, and MVP §3.3 matches.

## Open questions

The owner started 024 (2026-09-28) without answering these, so it's built on the recommendations;
any can still change.

1. **Hook matchers are left out** (recommended: Codex's tool names aren't documented, and a wrong
   matcher silently disables the hook), or written as the Claude Code name on the guess that Codex
   uses the same ones.
2. **An agent's MCP servers stay separate items** (recommended: one place per server, shared
   across agents), or are also written inside the agent's TOML as `[mcp_servers.<n>]`, which Codex
   allows, so the agent carries its own.
3. **Comments in a TOML file rmk edits are dropped** (recommended: a comment-preserving TOML
   editor is a much larger dependency), or rmk refuses to edit a `config.toml` that has comments
   and asks the person to add the keys by hand.
