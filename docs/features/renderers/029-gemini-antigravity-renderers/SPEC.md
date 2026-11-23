# 029 — Antigravity CLI and Gemini CLI renderers

> Milestone: M5b · Depends on: 021, 022, 025, 028, 043, 046, 076, 078 · Design: [MVP §3.1](../../../MVP/MVP.md#31-item-types), [§3.3](../../../MVP/MVP.md#33-platform-renderers) · Contracts: [`docs/spec/manifest.md`](../../../spec/manifest.md), [`docs/spec/cli-files.md`](../../../spec/cli-files.md), [`docs/spec/native-readers.md`](../../../spec/native-readers.md), [`docs/spec/plugin-feeds.md`](../../../spec/plugin-feeds.md)

> Off hold on 2026-11-22 (owner), at full parity with the other tools as 028 was: two renderers, a
> reader for `rmk export --from` (043), run counting (046/047), plugins and a place in the plugin
> feeds' git mirror (076–078). Re-checked against both products' documentation and what was built
> since on 2026-11-22; the September version is in git history.

## Goal

`rmk install --target antigravity` and `--target gemini` put every item type each tool can take
where it reads it, with golden files and warnings for the rest. Google's CLI is now two products
with different files, so this feature is two renderers that share what they can. Each is then a
tool like the others: `rmk export --from` reads its files, runs are counted, and the git mirror
carries its plugins.

## Scope

**In:**
- An `antigravity` renderer (name "Antigravity": the Antigravity CLI, `agy`, and what it shares
  with the Antigravity app) and a `gemini` renderer (name "Gemini CLI"), in both scopes, following
  023–025's shape.
- Leaving out what one reads from another target of the same install, through `render/covered.ts`
  (025, 028).
- A reader for each tool's own files, and both in `rmk export --from` and the MCP export tools.
- Run counting: `antigravity` and `gemini` in `rmk telemetry`'s hook tools, with the hook in the
  home folder.
- Antigravity plugins and Gemini CLI extensions, built for every item and written to the plugin
  feeds' git mirror, without a marketplace file (neither tool documents one people can add).
- Every list of tools in the app, the CLI and the MCP server, with a chart colour each for the
  usage charts.
- Golden files for every example item and plugin, and the end-to-end install through `rmk`.

**Out:**
- A marketplace index for either tool: Antigravity's marketplace takes plugins through a partner
  form, and Gemini CLI's gallery lists GitHub repositories; neither has a file a third party serves.
- Antigravity's workflows (deprecated, with "a new workflows system on the way") and the
  Antigravity app's project permissions, which live in its UI, not a file.
- The portable `model` block (198) and an agent's MCP servers (145/146), which aren't built: when
  they are, Antigravity's agent takes `model` (`inherit`, `flash`, `pro`) and `mcpServers`, and
  Gemini CLI's takes `model` and inline `mcpServers`; 198's table has both rows.

## Two products

Checked on 2026-11-22 against antigravity.google/docs (getting-started, cli/gcli-migration, skills,
subagents, rules, hooks, mcp, permissions, settings, cli/statusline, plugins, build-plugins,
marketplace, customization-discovery, changelog: CLI v1.5.12, 2026-11-19) and geminicli.com/docs
(cli/skills, core/subagents, cli/gemini-md, cli/custom-commands, hooks, hooks/reference,
tools/mcp-server, reference/tools, reference/configuration, reference/policy-engine,
cli/trusted-folders, extensions/reference), the Gemini CLI releases (v0.70.0, 2026-11-19) and the
May 2026 transition post on developers.googleblog.com. Where the docs disagree or say nothing, the
real CLIs settle it while building (below).

Antigravity CLI replaced Gemini CLI for free, Google One, Google AI Pro and Ultra users on
2026-06-18. Gemini CLI is still released, for Gemini Code Assist Standard and Enterprise and for
paid API keys. Google's migration table moves the project folder from `.gemini/` to `.agents/`, MCP
out of `settings.json`, and remote MCP from `url`/`httpUrl` to `serverUrl`. Tool names, agent fields
and hook formats differ completely. So:

| | `antigravity` | `gemini` |
|---|---|---|
| For | Antigravity CLI and app (most users) | Gemini CLI (Code Assist Standard and Enterprise, API keys) |
| Project folder | `.agents/` | `.gemini/` |
| User folder | `~/.gemini/config/` (shared by the CLI and the app); the CLI's own settings in `~/.gemini/antigravity-cli/` | `~/.gemini/` |
| Picked up by | `.agents/rules/`, `.agents/agents/`, `.agents/hooks.json` or `.agents/mcp_config.json` (not `.agents/` alone: Codex, Cursor and Devin share `.agents/skills/`) | `.gemini/` or `GEMINI.md` |

**The real CLIs as local test targets** (owner, 2026-11-22): Gemini CLI (`@google/gemini-cli`,
Apache-2.0) and the Antigravity CLI (proprietary) are installed globally on the owner's machine,
each with a scratch home folder, to capture real payloads and settle what the docs leave open.
Neither is ever a dependency of Ronne (not in the repo, the lockfile or CI).

## Where each reads things

| Type | Antigravity (project / user) | Gemini CLI (project / user) |
|---|---|---|
| `skill` | `.agents/skills/<n>/` / `~/.gemini/config/skills/<n>/` — native | `.agents/skills/<n>/` (read before `.gemini/skills/`) / `~/.agents/skills/<n>/` — native |
| `agent` | `.agents/agents/<n>.md` / `~/.gemini/config/agents/<n>.md` — native | `.gemini/agents/<n>.md` / `~/.gemini/agents/<n>.md` — native |
| `rule` | `.agents/rules/<n>.md` with `trigger`, `globs`, `description` / `~/.gemini/config/rules/<n>.md`; `manual` rules as skills — native | no rule files: a section in `GEMINI.md` / `~/.gemini/GEMINI.md`, `model` and `manual` rules as skills — native |
| `command` | as a skill (every skill is `/<n>`; no command files) — native | `.gemini/commands/<n>.toml` / `~/.gemini/commands/<n>.toml` — native |
| `hook` | `<n>` in `.agents/hooks.json` / `~/.gemini/config/hooks.json` — native | `hooks.<Event>` in `.gemini/settings.json` / `~/.gemini/settings.json` — native |
| `mcp-server` | `mcpServers.<n>` in `.agents/mcp_config.json` / `~/.gemini/config/mcp_config.json` — degraded (secrets, below) | `mcpServers.<n>` in `.gemini/settings.json` / `~/.gemini/settings.json` — native |
| `permission-policy` | none in a project (the app's are in its UI) / `permissions` in `~/.gemini/antigravity-cli/settings.json` — degraded | none in a project (`.gemini/policies/` is "currently non-functional", issue #18186) / `~/.gemini/policies/<n>.toml` — degraded |
| `statusline` | none in a project / `statusLine` in `~/.gemini/antigravity-cli/settings.json` — degraded | none (footer settings only) |
| `output-style`, `lsp-server` | none | none |
| `bundle` | nothing of its own | nothing of its own |

A type that's `none` in the project but works in the home folder warns in project scope that it
can only go in the home folder (`--scope user`).

**What they read from other tools.** Both read `.agents/skills/`. Antigravity reads `AGENTS.md`
and `GEMINI.md` natively, from the workspace up to the repository root, as always-on rules, so it
would load Codex's (024) and Gemini CLI's rule sections too. Gemini CLI reads `AGENTS.md` only when
`context.fileName` says so, which `rmk` doesn't change. Neither documents reading `CLAUDE.md` or
`.claude/`. So, with `render/covered.ts`:

| Target | Also a target | Leaves out | Why |
|---|---|---|---|
| `antigravity` | `codex` or `gemini` | `always` and `glob` rules | already in `AGENTS.md` or `GEMINI.md`, which Antigravity reads as always-on |
| `antigravity` | `codex` or `gemini` | `model` rules | already a skill in `.agents/skills/<n>/`, which Antigravity reads; its own `model_decision` rule would load it twice |
| both | `codex`, `cursor`, `devin` | nothing: `.agents/skills/` is the same shared folder, written once | |

`manual` rules need no row: in a project, Antigravity, Codex and Gemini CLI all write them as the same
skill, byte for byte, in `.agents/skills/<n>/`, which `rmk` records once with every target. In the
home folder they are two copies, `~/.gemini/config/skills/<n>/` for Antigravity and
`~/.agents/skills/<n>/` for the others, since Antigravity doesn't read the latter.

In the home folder, Antigravity reads `~/.gemini/GEMINI.md` (Gemini CLI's user file) but not
Codex's `~/.codex/AGENTS.md`, nor the `~/.agents/skills/` both write skills to. So in user scope it
leaves `always` and `glob` rules out with Gemini CLI as a target, and writes its own otherwise.

`detect()` for `antigravity` is true for any of `.agents/rules/`, `.agents/agents/`,
`.agents/hooks.json` or `.agents/mcp_config.json`; for `gemini`, `.gemini/` or `GEMINI.md`.

## Behaviour by type

**Markers** as 023; TOML commands get a `#` marker on line 1.

### Antigravity

- **`skill`, `command`** — the shared skill-folder helpers (024, 025, 028), rooted at
  `.agents/skills/` in a project (byte for byte what the other tools write) and
  `~/.gemini/config/skills/` in the home folder. Antigravity makes every skill a slash command. As
  for the other `.agents/skills/` readers (097), a skill's `agent:` and `context:` are left out with
  the shared warning, which names the tool (Antigravity, or Gemini CLI).
- **`agent`** — `.agents/agents/<n>.md` with `name`, `description`, `tools` (Antigravity's names,
  below; a tool with none is an `unmapped_tool` warning), `model` from the hint (`fast` → `flash`,
  `strong` → `pro`, `default` → `inherit`) or `targets.antigravity.overrides.model`, and the prompt
  as the body. The docs disagree on what a missing `tools` means (`[]` in the subagent reference,
  "all tools" for plugin agents): the real CLI settles it in task 2, and an agent with no `tools` in
  its manifest gets whatever means "all its parent's tools". Antigravity notes that a misspelled tool
  can hang a subagent, which is why names come only from the table. Skill dependencies (097) aren't
  preloaded: the `skills` field isn't documented as preloading, so they warn, as Copilot's do.
- **`rule`** — `.agents/rules/<n>.md`: `always` → `trigger: always_on`; `glob` → `trigger: glob`
  and `globs` as one comma-separated, quoted string; `model` → `trigger: model_decision` and
  `description`. `manual` → a skill, since the CLI doesn't support rule mentions (owner,
  2026-11-22). A missing or misspelled `trigger` silently drops the rule, so the golden files pin
  it. Antigravity truncates a rule file over 24,000 bytes and caps all always-on rules at 20,000
  tokens; `rmk` warns about a body over 24,000 bytes.
- **`hook`** — one `json-key` per item, `<n>` in `hooks.json`, since Antigravity keys hooks by name:
  `{ "PreToolUse": [{ "matcher": "<tool>", "hooks": [{ "type": "command", "command": "…",
  "timeout": 30 }] }] }` (timeout in seconds). Events: `session.start` → `SessionStart`,
  `tool.before` → `PreToolUse`, `tool.after` → `PostToolUse`, `agent.stop` → `Stop`; the rest warn
  (`PreInvocation` runs before every model call, not once per prompt). The docs show
  `SessionStart` and `Stop` handlers both bare and wrapped in `{ "hooks": [...] }`: the real CLI
  settles it in task 3. A matcher is a regular expression over Antigravity's tool names; an MCP
  tool filter is left out with a warning that the hook runs for every tool, since lazily loaded MCP
  tools all run as `call_mcp_tool`. A `run.script` goes to `.agents/hooks/<n>/` and runs as
  `"$(git rev-parse --show-toplevel)"/…`, since no variable or working folder is documented (user
  scope: `"$HOME"/.gemini/config/hooks/<n>/…`).
- **`mcp-server`** (degraded) — `mcpServers.<n>` in `mcp_config.json`: stdio as `command`, `args`
  and `cwd`; http as `serverUrl` and `headers`. Antigravity documents no way to reference an
  environment variable, and `rmk` never writes a secret, so `env` entries and headers that need one
  are left out with a warning naming each variable to set up in Antigravity; the server gets the
  environment Antigravity was started with (owner, 2026-11-22).
- **`permission-policy`** (degraded, home folder only) — `json-array-item`s under
  `permissions.allow`, `.deny` and `.ask` in `~/.gemini/antigravity-cli/settings.json`: `shell` →
  `command(<prefix>)`, `read` → `read_file(<glob>)`, `edit` and `write` → `write_file(<glob>)`,
  `web-fetch` → `read_url(<domain>)`, `mcp:<s>/<t>` → `mcp(<s>/<t>)` (`mcp(<s>/*)` for a whole
  server).
- **`statusline`** (degraded, home folder only) — the script under
  `~/.gemini/antigravity-cli/statusline/<n>/`, and `statusLine: { "type": "command", "command":
  "<path>" }` in `~/.gemini/antigravity-cli/settings.json`. The CLI runs it through `sh -c` with the
  session as JSON on stdin, so the command is `"$HOME"/.gemini/antigravity-cli/statusline/<n>/…`, as
  Copilot's is.

### Gemini CLI

- **`skill`** — the shared `.agents/skills/` helpers; Gemini CLI prefers `.agents/skills/` over
  `.gemini/skills/`, and reads `~/.agents/skills/` in the home folder, as Codex does.
- **`command`** — `.gemini/commands/<n>.toml` with `description` and `prompt` (a TOML multi-line
  string, as 024's agents). Gemini CLI passes what the person typed as `{{args}}`: with one
  argument, `{{name}}` becomes `{{args}}`; with more, they stay with 024's note and a warning.
- **`agent`** — `name` (Gemini CLI allows lowercase, digits, `-` and `_`, as item names already
  are), `description`, `tools` (Gemini CLI's names, below; without `tools` the agent inherits all of
  its parent's), `model` only from `targets.gemini.overrides.model` (the hints warn), and the prompt
  as the body. Subagents are on by default. Skill dependencies (097) warn: Gemini CLI's agents
  can't preload skills.
- **`rule`** — as Codex's (024) with `GEMINI.md` for `AGENTS.md`: `always` and `glob` as a fenced
  section, `glob` opening with the files it's for; `model` and `manual` as skills.
- **`hook`** — a `json-array-item` under `hooks.<Event>` in `settings.json`: `{ "matcher":
  "<tool>", "hooks": [{ "type": "command", "command": "…", "name": "<n>", "timeout": 30000 }] }`
  (timeout in milliseconds: the manifest's seconds × 1000). Events below. A matcher is a regular
  expression over Gemini CLI's tool names on `BeforeTool` and `AfterTool`; on any other event a
  tool filter is left out with a warning. A `run.script` runs as
  `"$GEMINI_PROJECT_DIR"/.gemini/hooks/<n>/…` (user scope: `"$HOME"/.gemini/hooks/<n>/…`). Gemini
  CLI fingerprints project hooks and warns about new or changed ones, which `rmk` notes after an
  install.
- **`mcp-server`** — `mcpServers.<n>` in `settings.json`: stdio as `command`, `args` and `env` with
  `${NAME}`; http as `httpUrl` and `headers` with `${NAME}`. Gemini CLI redacts inherited variables
  that look like secrets (`*TOKEN*`, `*KEY*`, …) unless `env` lists them, which it always does here.
- **`permission-policy`** (degraded, home folder only) — `~/.gemini/policies/<n>.toml`, one
  `[[rule]]` per rule: `toolName`, `commandPrefix` for shell patterns (a trailing `*` dropped),
  `mcpName` for an MCP tool, `decision` (`allow`, `deny`, `ask_user`), with the marker as a `#`
  comment.
- **Trusted folders:** in a folder the person hasn't trusted, Gemini CLI doesn't load
  `.gemini/settings.json`, connect MCP servers or load custom commands, which `rmk` notes after a
  project install, as it does for Codex.
- **A `settings.json` that isn't plain JSON** (Gemini CLI's own may hold comments): `rmk` edits JSON
  with a JSON parser, so it refuses the file with a message, as for any JSON file it can't parse.

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
| `mcp:<s>/<t>` | none: a warning (agents name servers in `mcpServers`, 145/146) | `mcp_<s>_<t>` (`mcp_<s>_*` for a whole server; a hook matcher `mcp_<s>_.*`) |
| `session.start` | `SessionStart` | `SessionStart` |
| `session.end` | none | `SessionEnd` |
| `prompt.submit` | none | `BeforeAgent` |
| `tool.before`, `tool.after` | `PreToolUse`, `PostToolUse` | `BeforeTool`, `AfterTool` |
| `agent.stop` | `Stop` | `AfterAgent` |
| `compact.before` | none | `PreCompress` |
| `permission.request`, `subagent.*` | none | none |

## Export (readers)

`packages/core/src/read/antigravity/` and `read/gemini/`, the reverse of each renderer, like
Cursor's and Copilot's (043, 028). `native-readers.md` gets a section for each.

**Antigravity** reads:
- **agents** from `.agents/agents/*.md` and `.agents/agents/<n>/agent.md` (`~/.gemini/config/agents/`),
  tool names back to canonical tools, `model` (`flash` → the `fast` hint, `pro` → `strong`, `inherit`
  → none), other fields dropped with a warning each;
- **rules** from `.agents/rules/*.md` (`~/.gemini/config/rules/`): `always_on` → `always`, `glob`
  → `glob` with its globs, `model_decision` → `model`, `manual` → `manual`;
- **skills** from `.agents/skills/` (shared, as for Codex) and `~/.gemini/config/skills/`, through
  the shared skill reader;
- **MCP servers** from `.agents/mcp_config.json` (`~/.gemini/config/mcp_config.json`): `serverUrl`
  or `url` as http; `env` and header values through §8's credential rules (Antigravity's own
  examples put a literal token there, so a literal is never uploaded).

**Gemini CLI** reads:
- **agents** from `.gemini/agents/*.md` (`~/.gemini/agents/`), `kind: remote` agents dropped with a
  warning;
- **commands** from `.gemini/commands/**/*.toml` (`~/.gemini/commands/`), `{{args}}` as one
  argument, a subfolder's `:` name as the item name with `-`;
- **skills** from `.agents/skills/` and `.gemini/skills/` (`~/.agents/skills/`, `~/.gemini/skills/`);
- **MCP servers** from `mcpServers` in `.gemini/settings.json` (`~/.gemini/settings.json`):
  `httpUrl` as http, `url` (SSE) as http with a warning, `${NAME}` and `$NAME` as references.
- Sections of `GEMINI.md` aren't read, as sections of `AGENTS.md` aren't (no boundary).

Neither reads hooks, permission policies or status lines (§12). `rmk export --from antigravity` and
`--from gemini`, the MCP export tools and the change proposal (042) take both.

## Run counting

Both join `HOOK_TOOLS`, with rmk's hook in the home folder. The payload fields below are from the
docs and are confirmed on the real CLIs in task 8, as Copilot's were:

- **Gemini CLI:** a `json-array-item` under `hooks.AfterTool` in `~/.gemini/settings.json`,
  `rmk telemetry hook gemini` with `name: "rmk-telemetry"` and a short timeout. The payload names
  its event (`hook_event_name`) and tool (`tool_name`, `tool_input`, `tool_response`); a skill run is
  `activate_skill`, an MCP tool `mcp_<server>_<tool>` (the lockfile picks the server, as with
  Copilot's `-`), and a subagent its own tool.
- **Antigravity:** `rmk-telemetry` in `~/.gemini/config/hooks.json`, on `PostToolUse`. The payload
  doesn't name its event; the tool is `toolCall.name` with `toolCall.args`, and `error` says how it
  ended. How a skill, an MCP tool (`call_mcp_tool` or `mcp_<server>_<tool>`) and a subagent
  (`invoke_subagent`) show is taken from the real CLI.
- **`rmk telemetry off`** removes rmk's entries.
- **The web app** adds both to the usage chart (`TOOL_COLOR`, `--chart-antigravity` and
  `--chart-gemini` tokens, never red or amber) and to the "What each AI tool reports" help section.

## Plugins and the git mirror

Neither tool can add a marketplace a third party serves (owner, 2026-11-22: build, mirror, no
index). So `rmk feed build` writes their plugins to the mirror with no marketplace file, and people
install one from a clone of the mirror, by its folder (both documented), or by URL where the real
CLI takes a subfolder URL:

```
plugins/antigravity/<plugin>/…   agy plugin install <folder>
plugins/gemini/<plugin>/…        gemini extensions install <folder>
```

**An Antigravity plugin** (build-plugins, 2026-11-22): `plugin.json` at the root with `$schema`,
`name` (`^[a-z0-9]+(-[a-z0-9]+)*$`), `version`, `description` and `author` (the schema refuses
other top-level keys); `skills/` with skills, commands and `manual` rules; `agents/<n>.md`;
`rules/<n>.md`; `hooks.json` (scripts run from the plugin root, so as `./hooks/<n>/…`); and
`mcp_config.json`, whose servers Antigravity namespaces as `<plugin>_<server>`, with secrets left out
as in a project. Permission policies and status lines stay out.

**A Gemini CLI extension** (extensions reference, 2026-11-22): `gemini-extension.json` with `name`
(lowercase and `-`), `version`, `description`, `mcpServers` (no `trust`) and `contextFileName:
"GEMINI.md"` when it has rules; `commands/<n>.toml`, `skills/`, `agents/<n>.md`, `hooks/hooks.json`
(its shape is confirmed on the real CLI), `policies/<n>.toml` (an extension's `allow` decisions are
ignored, so those rules warn) and `GEMINI.md` with the `always` and `glob` rules' sections. Scripts
run as `${extensionPath}/hooks/<n>/…`.

`antigravity` and `gemini` join `PLUGIN_TOOLS`, `pluginNameProblem` (Antigravity's pattern, Gemini
CLI's lowercase and `-`), the feed's `SERVED_TOOLS`, `rmk feed build --tools`, and Admin › Settings ›
Plugin feeds, which names them from the renderers and says they're mirror-only, without a
marketplace. `plugin-feeds.md` gets their columns.

## Everywhere a tool is listed

- The MCP server's tool enum and its descriptions (`packages/mcp/src/server.ts`).
- `rmk`'s post-install notes: Gemini CLI's trusted folders and hook fingerprints; Antigravity's
  MCP variables to set up.
- The web app's `TOOL_PLACES` and `TOOL_PAGES`.
- The messages that name the tools, in all three languages.

The support matrix (026) picks the renderers up from `RENDERERS`.

## Documentation

- **An Antigravity page and a Gemini CLI page** in the Documentation's "Installing" group, like the
  other tools': where each type goes, what's home-folder only, what's left to another target's copy,
  and good to know (the transition from Gemini CLI, trusted folders and hook fingerprints, MCP
  secrets in Antigravity, `manual` rules as skills).
- **Your AI tools:** rows for `antigravity` and `gemini`.
- **Exporting:** `--from antigravity` and `--from gemini`, and what each reads.
- **Usage:** both in "What each AI tool reports".
- **Plugin feeds:** the two mirror folders and how to install from them.
- **Helpers:** a help link from each new place in the app. New topics change
  `apps/web/src/components/help/topics.ts` and ronne-web's `topics.ts` together.
- **Items and types:** their chips appear on their own (026).

## Edge cases

- **A project with `.gemini/` and `.agents/rules/`:** both are detected, and `rmk` asks which (022).
- **Devin also reads `.agents/agents/`** (030): an Antigravity agent there, with Antigravity's tool
  names, would be loaded by Devin too. With both as targets, both are written, since their tool
  names differ (owner, 2026-11-22), and the Devin page says so.
- **An agent name with `_`:** fine for Gemini CLI; Antigravity has no documented pattern.
- **A plugin name Antigravity refuses** (`_`, or two `-` in a row): `pluginNameProblem` says so, as
  for the other tools.

## Acceptance criteria

- [ ] Every example item renders for both renderers in both scopes to the paths and shapes above, and the golden files are committed.
- [ ] Tools and events map as in the table; anything unmappable, every `none` type, and home-folder-only types in a project are warnings.
- [ ] Antigravity leaves out what the "also a target" table says, with `covered_by_target`: in a project, `always`, `glob` and `model` rules with Codex or Gemini CLI as a target; in the home folder, `always` and `glob` rules with Gemini CLI.
- [ ] No secret value is written: Gemini CLI uses `${NAME}`; Antigravity leaves secret fields out with a warning.
- [ ] `rmk export --from antigravity` and `--from gemini` read back what the renderers write, with warnings per `native-readers.md`.
- [ ] `rmk telemetry` installs and removes both run hooks, and payloads captured from the real CLIs are counted.
- [ ] Antigravity plugins and Gemini CLI extensions build for every example item with goldens; the git mirror has `plugins/antigravity/` and `plugins/gemini/`; `rmk feed build --tools antigravity,gemini` works.
- [ ] Every tool list above includes both, with messages in en, pt and fr.
- [ ] End-to-end tests install a skill, an agent, a hook, an MCP server and a rule with `--target antigravity` and with `--target gemini`, and remove them cleanly.
- [ ] The two Documentation pages, rows and sections are in place, with render tests.
- [ ] MVP §3.3 and §15 match what was built.

## Decisions

The owner's, on 2026-11-22:

1. **Two renderers**, `antigravity` and `gemini`: different folders, tool names and formats, and
   people have one or the other.
2. **Antigravity's MCP secrets are left out with a warning**: no reference syntax is documented, and
   `rmk` never writes a secret value.
3. **An agent for Antigravity and Devin is written for both**: their tool names differ, so one file
   can't serve both.
4. **`~/.gemini/config/`** for Antigravity's user skills, rules, agents, hooks and MCP: shared by the
   CLI and the app (the CLI's own `~/.gemini/antigravity-cli/` holds only its settings).
5. **`manual` rules are skills for Antigravity**, as for Codex and Gemini CLI: the CLI has no rule
   mentions.
6. **Plugins are built and mirrored, with no marketplace file**: neither tool can add one.
7. **Full parity**: a reader, run counting, plugins and the mirror, all in this feature, with the
   real CLIs as local test targets.
