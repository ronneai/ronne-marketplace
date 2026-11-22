# 028 — GitHub Copilot renderer

> Milestone: M5b · Depends on: 021, 022, 025 · Design: [MVP §3.1](../../../MVP/MVP.md#31-item-types), [§3.3](../../../MVP/MVP.md#33-platform-renderers) · Contracts: [`docs/spec/manifest.md`](../../../spec/manifest.md), [`docs/spec/cli-files.md`](../../../spec/cli-files.md)

> Off hold on 2026-11-22 (owner), at full parity with Claude Code, Codex and Cursor: the renderer,
> a reader for `rmk export --from copilot` (043), run counting (046/047), a plugin and a place in
> the plugin feeds (076–079). Re-checked against Copilot's documentation and what was built since
> on 2026-11-22; the September version is in git history.

## Goal

`rmk install --target copilot` puts every item type GitHub Copilot can take where Copilot reads it,
for the Copilot CLI and Copilot in VS Code, with golden files and warnings for the rest. Copilot is
then a tool like the other three: `rmk export --from copilot` reads its files, runs are counted, and
the plugin feeds serve a Copilot marketplace.

## Scope

**In:**
- A `copilot` renderer (name "GitHub Copilot") in both scopes, following 023–025's shape, aimed at
  the files both the Copilot CLI and VS Code's Copilot harness read.
- Leaving out what Copilot reads from another target of the same install, through a shared
  `covered_by_target` helper that Cursor moves to as well.
- A reader for Copilot's own files, and `copilot` in `rmk export --from` and the MCP export tools.
- Run counting: `copilot` in `rmk telemetry`'s hook tools, with the hook in the home folder.
- Copilot plugins (Agent Plugins 1.0 with Copilot's extensions) and a Copilot marketplace in the
  plugin feeds and their git mirror.
- Every list of tools in the app, the CLI and the MCP server, with a chart colour for the usage
  charts.
- Golden files for every example item and plugin, and the end-to-end install through `rmk`.

**Out:**
- VS Code's Local harness, which is deprecated and goes away in February 2027: its prompt files
  (`.github/prompts/`), `.vscode/mcp.json` and `.agents/skills/` reading.
- The cloud agent's MCP servers and secrets, which live in the repository's settings on GitHub,
  not in files.
- Managed permission policies (`/etc/github-copilot/policy.d/`).
- The portable `model` block (198) and an agent's MCP servers (145/146), which aren't built: when
  they are, Copilot's agent takes `model` and `mcp-servers` (below), and those features say how.

## Surfaces

Checked on 2026-11-22 against docs.github.com (CLI command reference, CLI config-dir reference,
hooks configuration, custom agents configuration, add custom instructions, add MCP servers, add LSP
servers, CLI plugin reference) and code.visualstudio.com/docs (agent skills, custom agents, the
custom agent file and custom instructions references, prompt files, hooks, MCP configuration).

There are three surfaces:
- the **Copilot CLI**;
- **VS Code's Copilot harness**, built on the CLI's SDK and the default since VS Code deprecated its
  Local harness;
- the **cloud agent** on GitHub.com, which reads the repository's committed `.github/` files.

`rmk` writes the files the CLI and VS Code's Copilot harness both read, and uses the CLI's own file
only where VS Code needs none (language servers). User scope writes under `~/.copilot`; like
`CODEX_HOME` for Codex, `COPILOT_HOME` isn't followed.

## Where Copilot reads things

| Type | Project | User | Support |
|---|---|---|---|
| `skill` | `.github/skills/<n>/` (the CLI, VS Code's Copilot harness and the cloud agent) | `~/.copilot/skills/<n>/` | native |
| `agent` | `.github/agents/<n>.agent.md` | `~/.copilot/agents/<n>.agent.md` | native |
| `rule` | `.github/instructions/<n>.instructions.md` with `applyTo` | `~/.copilot/instructions/<n>.instructions.md` | native |
| `command` | as a skill, `.github/skills/<n>/`, run as `/<n>` | `~/.copilot/skills/<n>/` | native |
| `hook` | `.github/hooks/<n>.json`, one file per item | `~/.copilot/hooks/<n>.json` | native |
| `mcp-server` | `mcpServers.<n>` in `.mcp.json` (the CLI and VS Code's Copilot harness) | `mcpServers.<n>` in `~/.copilot/mcp-config.json` (both) | native |
| `permission-policy` | none: no committed allow or deny list | none: `~/.copilot/permissions-config.json` keeps the CLI's own approvals | none |
| `statusline` | none | `statusLine` in `~/.copilot/settings.json` (the CLI) | degraded |
| `lsp-server` | `lspServers.<n>` in `.github/lsp.json` (the CLI) | `lspServers.<n>` in `~/.copilot/lsp-config.json` | native |
| `output-style` | none | none | none |
| `bundle` | nothing of its own | — | native |

Copilot's skills don't go to the shared `.agents/skills/`: only the CLI and VS Code's deprecated
Local harness read it, not VS Code's Copilot harness (owner, 2026-11-22).

`detect()` is true when the project has any of `.github/copilot-instructions.md`,
`.github/copilot/`, `.github/agents/`, `.github/instructions/`, `.github/prompts/`,
`.github/hooks/`, `.github/skills/` or `.github/lsp.json`. It is not true for `.github/` alone,
which every GitHub project has, nor for `.vscode/` or `.mcp.json`, which other tools write.

**What Copilot reads from other tools:**
- The CLI reads skills from `.claude/skills/` and `.agents/skills/`, agents from `.claude/agents/`
  (`.github/agents/` wins a clash), `CLAUDE.md` and `GEMINI.md`. VS Code's Copilot harness reads
  none of these.
- Both the CLI and VS Code's Copilot harness read `AGENTS.md` and `.mcp.json`, and run Claude Code's
  hooks from `.claude/settings.json` and `.claude/settings.local.json` (checked 2026-11-22; VS Code's
  `chat.useClaudeHooks` is for its Local harness only).

With the shared `covered_by_target` helper, that gives:

| Also a target | Copilot leaves out | Why |
|---|---|---|
| `claude-code` | MCP servers (the same `.mcp.json` key), hooks | both surfaces read that `.mcp.json` and run Claude Code's hooks, so hooks would run twice |
| `codex` | `always` and `glob` rules | in `AGENTS.md`, which both surfaces read |

Copilot always writes skills, commands and agents, because VS Code's Copilot harness doesn't read
Claude Code's copies. It also always writes rules when Gemini CLI is a target, since VS Code doesn't
read `GEMINI.md`. In the CLI a skill can then be found twice, and the first one found wins; there is
nothing for `rmk` to do about that.

## Behaviour by type

**Markers** as 023: `<!-- managed by rmk -->` after the frontmatter; JSON files and keys tracked
through the state file.

**`skill`, `command`.** These use the shared skill-folder helpers (024, 025, 097), rooted at
`.github/skills/`. The bytes match the `.agents/skills/` copy, without `agent:` and `context:`, with a
warning (097). Copilot's skills take `disable-model-invocation`, `user-invocable` and
`argument-hint`, which the shared command skill already writes. So a command runs as `/<n>`, and the
model doesn't start it on its own. The skill's `name` is its folder's name, as Copilot requires.

**`agent`.** Written to `.github/agents/<n>.agent.md` with:
- `name`, `description`;
- `tools`, using Copilot's cross-surface aliases (below);
- the prompt as the body.

Model ids differ between the CLI and VS Code, so `model` comes only from
`targets.copilot.overrides.model`, and the `fast` and `strong` hints warn (198 replaces this).
Skill dependencies aren't preloaded (Copilot's `skills` field is VS Code-only), so they warn.

**`rule`.** Written to `.github/instructions/<n>.instructions.md` with `applyTo`:
- `always` → `applyTo: "**"`;
- `glob` → the globs, comma-separated;
- `model` and `manual` → skills, since Copilot's instructions are applied by path, not picked by
  the model or asked for.

**`hook`.** A `file`, `.github/hooks/<n>.json`, in the CLI's format, which VS Code's Copilot harness
also reads:

```json
{ "version": 1, "hooks": { "<event>": [{ "type": "command", "bash": "…", "timeoutSec": 30, "matcher": "bash" }] } }
```

- One file per item, so no two items share a key.
- Every canonical event has a Copilot one (below).
- A `run.script` goes to `.github/hooks/<n>/` and runs by its path, with `cwd: "."`, which Copilot
  resolves from the repository root. In user scope it goes to `~/.copilot/hooks/<n>/` and runs as
  `"$HOME"/.copilot/hooks/<n>/<script>`. A path with anything but letters, digits and `._/-` is
  single-quoted, so it stays one word in the shell.
- A tool filter is a `matcher` on the events Copilot filters by `toolName` (`preToolUse`,
  `postToolUse`, `permissionRequest`). Copilot compiles it as `^(?:…)$`, so it is the CLI's tool
  name (below). MCP tools and web search have no documented name there, so such a filter is left
  out with a warning that the hook runs for every tool. So is a filter on any other event.
- `$RMK_` variables warn as in Cursor, because Copilot passes the event as JSON on stdin.

**`mcp-server`.** Written as `mcpServers.<n>` in `.mcp.json`:
- stdio: `type: "stdio"`, `command`, `args` (`[]` when the manifest has none, since the CLI's
  reference marks it required), `env` with `${NAME}`, and `tools: ["*"]`;
- http: `type: "http"`, `url`, `headers` as the manifest has them (their values reference variables
  as `${NAME}`, the manifest spec's syntax and Copilot's), and `tools: ["*"]`.

In user scope it goes to `~/.copilot/mcp-config.json`, which the CLI and VS Code's Copilot harness
share. With Claude Code as a target, Claude Code's key serves both tools (covered). An `env`
variable is always written as its reference, never a value. A header is written as the manifest
has it, as Claude Code and Cursor write it. A literal that looks like a secret is refused (a known
token format) or warned about (a long random string) when the item is saved (manifest spec §2), not
here; a short literal, such as a plain password, isn't caught, so it reaches the file. Copilot
expands `$VAR`, `${VAR}` and `${VAR:-default}` in `env` and `headers` (CLI command reference,
2026-11-22). Project servers load only once the folder is trusted, and the Copilot page says so.

**`permission-policy`.** `none`: there's no allow or deny list a repository can commit, and the
CLI's user file holds its own approvals. `rmk` warns and skips.

**`statusline`** (degraded, home folder only). The script goes under
`~/.copilot/statusline/<n>/`, and `statusLine: { "type": "command", "command": "<path>" }` goes in
`~/.copilot/settings.json`. Checked on 2026-11-22 against the CLI config-dir reference, whose
`statusLine` row says: `type` must be `"command"`; `command` is a "path to an executable script that
receives session JSON on stdin and prints status content to stdout"; `padding` and `refreshInterval`
are optional. The command is written as `"$HOME"/.copilot/statusline/<n>/<script>`, as Claude
Code's is, because a renderer doesn't know the home folder. The reference doesn't say whether a
shell runs it, and `"$HOME"` expands only if one does; that is open (see Open questions), and task
7 checks it against a real Copilot CLI (owner, 2026-11-22).

**`lsp-server`.** Written as `lspServers.<n>` in `.github/lsp.json`, with `command`, `args` and
`fileExtensions` (`{ ".ts": "typescript" }`) taken from the manifest's languages. The CLI reads it.
VS Code has its own language servers.

**Mappings.**

| Canonical | Agent `tools` | Hook `matcher` (the CLI's tool names) |
|---|---|---|
| `read` | `read` | `view` |
| `edit` | `edit` | `edit` |
| `write` | `edit` | `create` |
| `grep`, `glob` | `search` | `grep`, `glob` |
| `shell` | `execute` | `bash` |
| `web-fetch` | `web` | `web_fetch` |
| `web-search` | `web` | none: a warning |
| `mcp:<s>/<t>` | `<s>/<t>` (`<s>/*` for a whole server) | none: a warning |

| Canonical event | Copilot |
|---|---|
| `session.start`, `session.end` | `sessionStart`, `sessionEnd` |
| `prompt.submit` | `userPromptSubmitted` |
| `tool.before`, `tool.after` | `preToolUse`, `postToolUse` |
| `permission.request` | `permissionRequest` |
| `subagent.start`, `subagent.stop` | `subagentStart`, `subagentStop` |
| `compact.before`, `agent.stop` | `preCompact`, `agentStop` |

## Export (reader)

`packages/core/src/read/copilot/`, the reverse of the renderer, like Cursor's (043, contract
`native-readers.md` gets a Copilot section). It reads:
- **agents** from `.github/agents/*.agent.md`, with tool aliases back to canonical tools; an alias
  that stands for several, such as `edit`, becomes all of them, with a warning;
- **rules** from `.github/instructions/*.instructions.md`, where `applyTo: "**"` → `always` and
  other globs → `glob`;
- **skills and commands** from `.github/skills/`, through the shared skill reader, where
  `disable-model-invocation: true` → a command;
- **MCP servers** from `.github/mcp.json`, `.mcp.json` (read in the shape Claude Code's reader uses)
  and `~/.copilot/mcp-config.json`;
- **language servers** from `.github/lsp.json`.

`rmk export --from copilot`, the MCP export tools and the change proposal (042) take `copilot`.

## Run counting

`copilot` joins `HOOK_TOOLS`:
- **The hook file** is `~/.copilot/hooks/rmk-telemetry.json`, with `version: 1`. It runs
  `rmk telemetry hook copilot` on the events that show a skill, an MCP tool or a subagent being
  used: `postToolUse`, `postToolUseFailure`, `subagentStart` and `userPromptSubmitted`, whichever
  task 6 confirms on a real payload.
- **The handler** reads `sessionId` and `toolName` (camelCase events).
- **The web app** adds `copilot` to the usage chart (`TOOL_COLOR`, a `--chart-copilot` token, never
  red or amber) and to the "What each AI tool reports" help section.

## Plugins and feeds

A Copilot plugin is Agent Plugins 1.0 with Copilot's extensions:
- the manifest is the root `plugin.json` with `$schema`, as Codex's is;
- `skills/` holds skills and commands, and `mcp.json` holds MCP servers;
- `com.github.copilot/` holds `agents/`, `rules/`, `hooks/hooks.json` and `lsp.json`;
- permission policies and status lines stay out.

The marketplace is `.github/plugin/marketplace.json`:
- `name`, `owner`, `metadata.description`, and `plugins[]` with `name`, `version`, `description`
  and a folder `source`;
- it is served only in the git mirror (078), like Codex's and Cursor's;
- people add it with `copilot plugin marketplace add <url>`.

`copilot` joins:
- `PLUGIN_TOOLS`, `MARKETPLACE_PATHS` and `pluginNameProblem`, under the Agent Plugins name rule;
- the feed's `SERVED_TOOLS` and `rmk feed build --tools`;
- Admin › Settings › Plugin feeds.

`plugin-feeds.md` gets the Copilot column.

## Everywhere a tool is listed

- The MCP server's tool enum and its descriptions (`packages/mcp/src/server.ts`).
- `rmk`'s post-install notes, which say that project MCP servers wait for folder trust.
- The web app's `TOOL_PLACES` and `TOOL_PAGES`.
- The messages that name the tools in all three languages: "Claude Code, Codex and Cursor" becomes a
  list that includes GitHub Copilot.

The support matrix (026) picks the renderer up from `RENDERERS`.

## Documentation

- **A GitHub Copilot page** in the Documentation's "Installing" group, like the other tools' pages,
  covering:
  - where each type goes;
  - which surface reads what: the CLI, VS Code's Copilot harness and the cloud agent;
  - what's left to another target's copy;
  - good to know: commands as skills, folder trust for MCP servers, no permission policies, the
    cloud agent's MCP servers in GitHub's settings, and VS Code's Local harness not being written for.
- **Your AI tools:** the `copilot` row.
- **Exporting:** `--from copilot` and what it reads.
- **Usage:** Copilot in "What each AI tool reports".
- **Plugin feeds:** the Copilot marketplace and how to add it.
- **Helpers:** a help link from each new place in the app. New topics change
  `apps/web/src/components/help/topics.ts` and ronne-web's `topics.ts` together.
- **Items and types:** its chips appear on their own (026).

## Edge cases

- **A `.mcp.json` the person made:** `rmk` adds its own keys and leaves theirs, as with every JSON
  file.
- **A `.github/hooks/<n>.json` someone wrote by hand:** a conflict, as with any file `rmk` didn't
  write.
- **A skill in both `.github/skills/` and `.claude/skills/`:** the CLI takes the first one it finds,
  and VS Code reads only `.github/`. Nothing for `rmk` to do.
- **`COPILOT_HOME` set:** user scope still writes under `~/.copilot`, as Codex ignores `CODEX_HOME`;
  the Copilot page says so.
- **The cloud agent:** it reads the committed `.github/` files. MCP servers need adding in the
  repository's settings, which the Copilot page says.

## Acceptance criteria

- [ ] Every example item renders in both scopes to the paths and shapes above, and the golden files are committed.
- [ ] Tools and events map as in the tables; anything unmappable, a tool filter Copilot can't express, and every `none` type, is a warning.
- [ ] With Claude Code or Codex as a target too, Copilot leaves out exactly what the "also a target" table says, through the shared helper, and Cursor's goldens don't change.
- [ ] MCP servers go to `.mcp.json` / `~/.copilot/mcp-config.json` with `env` as `${NAME}` references and `tools`, and no `env` value is written.
- [ ] `rmk export --from copilot` reads agents, rules, skills, commands, MCP and language servers, with goldens and warnings per `native-readers.md`.
- [ ] `rmk telemetry` installs and removes Copilot's run hook, and a real `postToolUse` payload is counted.
- [ ] Copilot plugins build for every example item with goldens; the git mirror has `.github/plugin/marketplace.json`; `rmk feed build --tools copilot` works.
- [ ] Every tool list above includes `copilot`, with messages in en, pt and fr.
- [ ] The end-to-end test installs a skill, an agent, a hook, an MCP server, a rule and a language server with `rmk` in a project with `.github/copilot-instructions.md`, with Claude Code too, and removes them cleanly.
- [ ] The Documentation pages and sections above and their helpers are in place, with render tests.
- [ ] MVP §3.3 and §15 match what was built.

## Open questions

1. **Does the Copilot CLI run `statusLine.command` through a shell?** If it does, the
   `"$HOME"/…` form works. If it spawns the path directly, `rmk` needs another way to name the home
   folder, or the status line becomes `none`. Task 7 settles it on a real CLI (owner, 2026-11-22).

## Decisions

The owner's, on 2026-11-22:

1. **Skills and commands** go to `.github/skills/`, which every surface reads, not `.agents/skills/`.
2. **MCP** goes to `.mcp.json`, shared with Claude Code, which covers it when both are targets. It
   doesn't go to `.github/mcp.json` (CLI only) or `.vscode/mcp.json` (the Local harness only).
3. **A tool filter Copilot can't express** is dropped with a warning, and the hook installs. (Asked
   when the docs seemed to allow no matcher on `preToolUse`/`postToolUse`; a closer read the same
   day found they do, so only MCP tools, web search and other events are left out.)
4. **Full parity**: a reader, run counting, plugins and feeds, all in this feature.

From the September spec's recommendations, kept because the 2026-11-22 check supports them:

5. **Hooks** are left to Claude Code's copy when both are targets: the CLI and VS Code's Copilot
   harness both run Claude Code's hooks, so they'd run twice.
6. **Rules** are written as instruction files even with Claude Code as a target: neither surface
   reads `.claude/rules/`.
