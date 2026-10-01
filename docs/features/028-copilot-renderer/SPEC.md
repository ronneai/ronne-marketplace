# 028 — GitHub Copilot renderer

> Milestone: M5b · Depends on: 021, 022, 025 · Design: [MVP §3.1](../../MVP/MVP.md#31-item-types), [§3.3](../../MVP/MVP.md#33-platform-renderers) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md), [`docs/spec/cli-files.md`](../../spec/cli-files.md)

> **On hold** since 2026-09-30 (owner): not implemented now. Before work starts, re-check this spec
> against what was built since and against the vendor's current docs.

## Goal

`rmk install --target copilot` puts every item type GitHub Copilot can take where Copilot reads it,
for the Copilot CLI and Copilot in VS Code, with golden files and warnings for the rest.

## Scope

**In:**
- A `copilot` renderer (name "GitHub Copilot") in both scopes, following 023–025's shape, aimed at
  the files the Copilot CLI and VS Code both read, and naming where they differ.
- Leaving out what Copilot reads from another target of the same install, as Cursor does (025).
- Golden files for every example item, and the end-to-end install through `rmk`.

**Out:**
- Copilot plugins and marketplaces (`plugin.json`, `marketplace.json`) as a way to install: MVP
  §3.3's native plugin feeds, later.
- The cloud agent's MCP servers and secrets, which live in the repository's settings on GitHub,
  not in files.
- Managed (MDM or server) permission policies.

## Surfaces

Checked on 2026-09-28 against docs.github.com (CLI command reference, CLI config-dir reference,
hooks reference, custom agents configuration, custom instructions, add MCP servers, add LSP
servers, CLI plugin reference, allowing tools) and code.visualstudio.com/docs (agent skills,
custom agents, custom instructions, prompt files, hooks, MCP servers, approvals, tools reference).
**Check again when this feature is built**, and update MVP §3.3.

Copilot reads different files on different surfaces. The **Copilot CLI**, and VS Code chat on the
"Copilot" session target (the Agent Host, built on the CLI's SDK), follow the CLI's rules; VS
Code's "Local" target has its own; the cloud agent on GitHub.com reads the repository's `.github/`
files. `rmk` writes what the CLI and VS Code share wherever there is such a file, and the CLI's
format otherwise, since that's what VS Code's Copilot target and the cloud agent follow too.

## Where Copilot reads things

| Type | Project | User | Support |
|---|---|---|---|
| `skill` | `.agents/skills/<n>/` (read by the CLI, VS Code and the cloud agent; shared with Codex, Cursor and Devin) | `~/.agents/skills/<n>/` | native |
| `agent` | `.github/agents/<n>.agent.md` | `~/.copilot/agents/<n>.agent.md` | native |
| `rule` | `.github/instructions/<n>.instructions.md` with `applyTo` | `~/.copilot/instructions/<n>.instructions.md` | native |
| `command` | as a skill, `.agents/skills/<n>/`, run as `/<n>` (prompt files, `.github/prompts/`, are read only by VS Code's Local target) | `~/.agents/skills/<n>/` | native |
| `hook` | `.github/hooks/<n>.json`, one file per item | `~/.copilot/hooks/<n>.json` | native |
| `mcp-server` | `mcpServers.<n>` in `.github/mcp.json` (the CLI) and `servers.<n>` in `.vscode/mcp.json` (VS Code) | `~/.copilot/mcp-config.json` | native |
| `permission-policy` | none: no committed allow or deny list (`.github/copilot/settings.json` takes neither) | none: the CLI's user file keeps its own approvals | none |
| `statusline` | none | `statusLine` in `~/.copilot/settings.json` (the CLI) | degraded |
| `lsp-server` | `lspServers.<n>` in `.github/lsp.json` (the CLI) | `~/.copilot/lsp-config.json` | native |
| `output-style` | none | none | none |
| `bundle` | nothing of its own | — | native |

`detect()` is true when the project has any of `.github/copilot-instructions.md`,
`.github/copilot/`, `.github/agents/`, `.github/instructions/`, `.github/prompts/`,
`.github/hooks/`, `.github/skills/`, `.github/lsp.json` or `.github/mcp.json` (not `.github/`
alone, which every GitHub project has, nor `.vscode/`).

**What Copilot reads from other tools, by default:** skills from `.claude/skills/` and
`.agents/skills/`; Claude Code's commands (`.claude/commands/`) and agents (`.claude/agents/`,
where `.github/agents/` wins a name clash in the CLI); `AGENTS.md`, `CLAUDE.md` and `GEMINI.md`;
`.mcp.json`; and the CLI runs hooks from `.claude/settings.json`. VS Code's Local target also reads
`.claude/rules/`. So, with 025's `covered_by_target`:

| Also a target | Copilot leaves out |
|---|---|
| `claude-code` | skills and commands (unless another target writes `.agents/skills/` anyway), hooks |
| `codex` | `always` and `glob` rules (in `AGENTS.md`) |
| `gemini` (029) | `always` and `glob` rules (in `GEMINI.md`) |

Agents are always written (`.github/` wins over `.claude/` for the same name), and so are MCP
servers (see below).

## Behaviour by type

**Markers** as 023: `<!-- managed by rmk -->` after the frontmatter; JSON files and keys tracked
through the state file.

**`skill`, `command`** — the shared `.agents/skills/` helpers (024, 025), byte for byte what the
other tools write. Copilot's skills take `disable-model-invocation` and `argument-hint`, which the
shared command skill already writes, so a command is `/<n>` and the model doesn't start it alone.

**`agent`** — `.github/agents/<n>.agent.md`: `name`, `description`, `tools` (Copilot's
cross-surface aliases, below), and the prompt as the body. The model id differs between the CLI
(`claude-sonnet-4.6`) and VS Code (display names), so `model` comes only from
`targets.copilot.overrides.model`; the `fast`/`strong` hints warn.

**`rule`** — `.github/instructions/<n>.instructions.md` with `applyTo`: `always` → `applyTo: "**"`;
`glob` → the globs, comma-separated; `model` and `manual` → skills (Copilot's instructions are
applied by path, not picked by the model or asked for).

**`hook`** — a `file`: `.github/hooks/<n>.json`, `{ "version": 1, "hooks": { "<event>": [{ "type":
"command", "bash": "…", "timeoutSec": 30, "matcher": "<tool>" }] } }`, in the CLI's format, which
VS Code's Local target also accepts. One file per item, so no two items share a key. Every
canonical event has a Copilot one (below). A `run.script` goes to `.github/hooks/<n>/` and runs by
its path from the repository root, where the CLI resolves hooks. VS Code's Local target ignores
matchers on Claude-format hooks only; it honours these.

**`mcp-server`** — two keys, one per surface, since the CLI and VS Code share only `.mcp.json`,
which Claude Code writes in its own shape (and the CLI requires `tools` in every entry):
- `mcpServers.<n>` in `.github/mcp.json` (the CLI): stdio as `type: "stdio"`, `command`, `args`,
  `env` with `${NAME}`, and `tools: ["*"]`; http as `type: "http"`, `url`, `headers` with `${NAME}`
  and `tools: ["*"]`.
- `servers.<n>` in `.vscode/mcp.json` (VS Code): the same with `${env:NAME}` (VS Code's syntax).
  VS Code forwards these servers to its Copilot target too.

In user scope, only the CLI's `~/.copilot/mcp-config.json`; VS Code's user file lives in its
profile, which has no fixed path, so a warning says to add it there. No secret value is written.

**`permission-policy`** — `none`: Copilot has no allow or deny list a repository can commit, and
the CLI's user file holds its own approvals, without deny rules. `rmk` warns and skips.

**`statusline`** (degraded, home folder only) — the script under `~/.copilot/statusline/<n>/`, and
`statusLine: { "type": "command", "command": "<path>" }` in `~/.copilot/settings.json`.

**`lsp-server`** — `lspServers.<n>` in `.github/lsp.json`: `command`, `args` and `fileExtensions`
(`{ ".ts": "typescript" }`) from the manifest's languages. The CLI reads it; VS Code has its own
language servers and doesn't need it.

**Mappings.**

| Canonical | Agent `tools` | Hook matcher (CLI tool names) |
|---|---|---|
| `read` | `read` | `view` |
| `edit` | `edit` | `edit` |
| `write` | `edit` | `create` |
| `grep`, `glob` | `search` | `grep`, `glob` |
| `shell` | `execute` | `bash` |
| `web-fetch`, `web-search` | `web` | `web_fetch`; web search has none: a warning |
| `mcp:<s>/<t>` | `<s>/<t>` (`<s>/*` for a whole server) | `<s>-<t>` |

| Canonical event | Copilot |
|---|---|
| `session.start`, `session.end` | `sessionStart`, `sessionEnd` |
| `prompt.submit` | `userPromptSubmitted` |
| `tool.before`, `tool.after` | `preToolUse`, `postToolUse` |
| `permission.request` | `permissionRequest` |
| `subagent.start`, `subagent.stop` | `subagentStart`, `subagentStop` |
| `compact.before`, `agent.stop` | `preCompact`, `agentStop` |

## Documentation

- **A GitHub Copilot page** in the Documentation's "Installing" group, like the other tools': where
  each type goes; which surface reads what (the CLI, VS Code's Copilot and Local targets, the cloud
  agent); what's left to another target's copy; and good to know (commands as skills, the two MCP
  files, VS Code's user MCP file, no permission policies, the cloud agent's MCP in GitHub settings).
- **Your AI tools:** the `copilot` row.
- **Items and types:** its chips appear on their own (026).

## Edge cases

- **`.github/mcp.json` or `.vscode/mcp.json` the person made:** `rmk` adds its own keys and leaves
  theirs, as with every JSON file.
- **A `.github/hooks/<n>.json` someone wrote by hand:** a conflict, as any file rmk didn't write.
- **A skill in both `.agents/skills/` and `.claude/skills/`** (Claude Code isn't the reason; the
  person copied it): the CLI takes the first found; nothing for `rmk` to do.
- **The cloud agent:** reads the committed `.github/` files; MCP servers need adding in the
  repository's settings, which the Copilot page says.

## Acceptance criteria

- [ ] Every example item renders in both scopes to the paths and shapes above, and the golden files are committed.
- [ ] Tools and events map as in the tables; anything unmappable, and every `none` type, is a warning.
- [ ] With Claude Code, Codex or Gemini CLI as targets too, Copilot leaves out exactly what the "also a target" table says.
- [ ] MCP servers go to both files with each surface's reference syntax, and no secret value is written.
- [ ] The end-to-end test installs a skill, an agent, a hook, an MCP server, a rule and a language server with `rmk` in a project with `.github/copilot-instructions.md`, and removes them cleanly.
- [ ] The GitHub Copilot Documentation page, its row in Your AI tools, and its helpers are in place, with render tests.
- [ ] The locations are re-checked against Copilot's documentation when this is built, and MVP §3.3 matches.

## Open questions

1. **Commands as skills** (recommended: the CLI, VS Code's Copilot target and the cloud agent all
   read skills; prompt files reach only VS Code's Local target), or also a `.github/prompts/` prompt
   file for VS Code's Local target.
2. **MCP in `.github/mcp.json` and `.vscode/mcp.json`** (recommended: each surface's own file, with
   no clash with Claude Code's `.mcp.json`), or `.mcp.json` alone, which both read but whose entries
   Copilot CLI requires `tools` in.
3. **Leave hooks to Claude Code's copy when both are targets** (recommended: the CLI runs Claude
   Code's hooks by default, so they'd run twice), knowing VS Code's Local target doesn't read Claude
   Code's hooks unless `chat.useClaudeHooks` is on; or write both.
4. **Rules as instruction files even with Claude Code as a target** (recommended: the CLI doesn't
   read `.claude/rules/`, only VS Code's Local target does, where the text then appears twice), or
   leave them out there.
