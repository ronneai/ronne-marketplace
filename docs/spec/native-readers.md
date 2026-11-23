# Native readers spec

How a file a person wrote in their AI tool's own format becomes a Ronne item, for `rmk export` and
the MCP export tools (M7: features [038](../features/export-import/038-rmk-export/SPEC.md)–[041](../features/export-import/041-export-dependencies/SPEC.md)).
A reader is the reverse of a renderer ([MVP §3.3](../MVP/MVP.md#33-platform-renderers)): a
renderer turns `ronne.yaml` into a tool's files, and a reader turns a tool's files into a
`ronne.yaml` and the files that go with it ([manifest spec](./manifest.md)).

Status: the skill reader is built (038, `readSkill` in `@ronneai/core/read`); the other four types
are built (040); Codex's and Cursor's own files (§9–10) are
[043](../features/export-import/043-codex-cursor-readers/SPEC.md)'s, checked on 2026-09-30; Copilot's (§11) are
[028](../features/renderers/028-copilot-renderer/SPEC.md)'s, checked on 2026-11-22;
Antigravity's and Gemini CLI's (§13–14) are
[029](../features/renderers/029-gemini-antigravity-renderers/SPEC.md)'s, checked on 2026-11-22;
exporting an edited install as a change proposal is
[042](../features/export-import/042-export-change-proposal/SPEC.md). §5–8 were checked against Claude Code's documentation (sub-agents, commands
and skills, memory and rules, MCP) and its renderer on **2026-09-30**. The readers' tool, model
and placeholder tables are the renderer's (`packages/core/src/render/claude-code/mappings.ts`),
reversed in code.

## 1. Rules for every reader

- **Pure.** A reader gets files (paths, bytes, executable bits) and returns
  `{ manifest, manifestText, files, warnings, references }`. It reads no disk and no network;
  `rmk` finds the files and uploads the result.
- **Read-only.** Export never changes the person's files. When the uploaded copy has to differ
  from the file on disk (a `name` set in `SKILL.md`, a secret replaced by a variable), the
  difference is a warning in the preview.
- **Lossy is allowed, silent isn't.** A field the manifest can't carry is dropped with one warning
  that names it. The draft is reviewed by its author in the web app before anyone else sees it.
- **The output passes the checks a save runs** (manifest spec §6, layers 1 and 2) whenever the
  input allows it.
- **Where the description came from** ([053](../features/export-import/053-export-descriptions/SPEC.md)). Each
  reader reports `descriptionSource`: `item` (the item's own field, such as frontmatter
  `description`), `body` (its body's first line, for want of one: always for a Claude Code rule,
  and for a Cursor rule without `description`), `given` (an MCP server's, given to the reader), or
  `none`. Export uses only `item` and `given` as they are; for `body` and `none` it asks for a
  description, offering the first line as a suggestion, and doesn't upload the item without one.
- **Names.** The item is `@<scope>/<name>`: the scope is the person's choice and never a default;
  the name is the native name when it's a valid item name, else it's put in lowercase with `-` for
  every other character.
- **Descriptions** are one line and at most 300 characters (manifest spec §1): longer ones are cut
  at a word and end with `…`, with a warning.
- **Refusals.** Files that can't become an item at all (no entry file, a `ronne.yaml` that doesn't
  parse or is another type's, a name that isn't `@scope/name`) raise a `ReadError` with a code;
  `rmk` refuses that item and goes on with the others.
- **`references`** are what the item uses that could be another item (a skill an agent loads, an
  MCP server a tool name points at). 041 turns them into `dependencies`.

## 2. Whose item it is

Export is for what the person wrote. In order:

| Sign | Means | Export |
|---|---|---|
| `.rmk/state.json` (or the user-scope state) has an entry for exactly this folder, file or key ([cli-files](./cli-files.md)) | `rmk` installed it; the hash says whether it was edited since | edited: a **change proposal** to the installed version, merged onto it ([042](../features/export-import/042-export-change-proposal/SPEC.md)); unchanged: refused, as there's nothing to export |
| The folder's `ronne.yaml` has a `version` | a copy from a registry: the packer sets `version`, authors leave it out | a change proposal to that version when the item is published (042); `--force` exports it as a new item without the version |
| The file carries the managed marker (`managed by rmk: @scope/name@x.y.z`) | refused: without the state, the edit can't be told from the render; pointing to **Propose a change** |
| none of these | written here | exported |

Entries recorded under `rmk mcp-setup` are never items.

## 3. What is never uploaded

- **Not part of an item:** `.git/`, `.hg/`, `.svn/`, `node_modules/`, `__pycache__/`, `.DS_Store`,
  `Thumbs.db`, `.ronne/`.
- **Likely secrets:** `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa*`, `.npmrc`, `.netrc`.
- **Symbolic links** inside an item's folder (never followed).
- **Values of environment variables and credentials** in MCP server configurations: only the
  variables' names (MVP §12).

Every skipped file is listed in the preview with its reason. A text file that contains a certain
secret (a known provider format, `secretLike` in `packages/core`) stops that item.

## 4. Skill

Source: a folder with a `SKILL.md`, in `.claude/skills/<n>/` or `.agents/skills/<n>/` (project or
home). The folder is the item (manifest spec §2), so the reader adds `ronne.yaml` and changes
nothing else, except `name` in the uploaded `SKILL.md`.

| Manifest | From |
|---|---|
| `name` | `SKILL.md` frontmatter `name`, else the folder's name |
| `type` | `skill` |
| `description` | frontmatter `description`; without one, the body's first line of text, without heading marks (with a warning) |
| `license` | frontmatter `license` |
| `skill.entry` | `SKILL.md` |
| files | the whole folder, less §3 |

- A `ronne.yaml` the person wrote in the folder is kept as the base, with its comments: only `name`
  is set (and `type` when it's missing), and a `version` is removed with a warning. Its
  `skill.entry` names the entry file. The reader finds it among the files it's given.
- The short name `rmk` suggests is `SKILL.md`'s `name` when it's a valid item name, else the
  folder's name made into one (`skillName`).
- `SKILL.md`'s `name` must equal the item's short name (manifest spec §2): the uploaded copy gets
  that line set or added (a frontmatter block with only `name` when it has none), with a warning.
- References (for 041): MCP servers named in `allowed-tools` (`mcp__<server>__…`), and the agent in
  `agent:` (097), unless it's Claude Code's own (`Explore`, `Plan`, `general-purpose`), a plugin's
  (`plugin:agent`) or already an item name; once declared, the uploaded `SKILL.md` names it
  `@scope/name`.

## 5. Agent (040)

Source: `.claude/agents/**/*.md` (subfolders are read; they don't change the name). The agent's
name is its frontmatter `name`, not the file's, as in Claude Code; a `name` that can't be an item
name is made into one (§1).

| Manifest | From |
|---|---|
| `description` | frontmatter `description` |
| `agent.prompt` | `prompt.md`, the file's body |
| `agent.tools` | frontmatter `tools` (a list or a comma-separated string), through the renderer's table reversed (`Read` → `read`, `Bash` → `shell`, …); `mcp__s__t` → `mcp:s/t`. Left out when the file has none |
| `agent.model` | `haiku` (or a full model id with `haiku` in it) → `fast`, `opus` (or an id with `opus`) → `strong`; left out → `default`; anything else (`sonnet`, `fable`, `inherit`, another id) → `default` with a warning |

- Dropped, with a warning each: tools with no canonical name (`Skill`, `Agent`, `NotebookEdit`
  and the like), and every other frontmatter field: `disallowedTools`, `permissionMode`,
  `maxTurns`, `mcpServers` definitions, `hooks`, `memory`, `background`, `omitClaudeMd`, `effort`,
  `isolation`, `color`, `initialPrompt`, `experimental`, and any other.
- References: `skills` in the frontmatter, servers named in `mcpServers`, and the servers of
  `mcp__…` tools.

## 6. Command (040)

Source: `.claude/commands/**/*.md`, which Claude Code still reads next to skills. A file in a
subfolder is named with the folder (`review/diff.md` → `review-diff`; Claude Code calls it
`/review:diff`, and `:` can't be in an item name). A skill folder is always a skill, even when it
behaves like a command; the path decides the type. The renderer writes a command as a skill
(`.claude/skills/<n>/`, 023), so a command `rmk` installed is found as a skill with the managed
marker and refused (§2).

| Manifest | From |
|---|---|
| `description` | frontmatter `description`, else the body's first line |
| `command.body` | `command.md`, the file's body, with named placeholders in the manifest's syntax (`$name` → `{{name}}` for each declared argument); `$ARGUMENTS`, `$ARGUMENTS[N]`, `$N` and an escaped `\$name` stay as written |
| `command.args` | the frontmatter `arguments` (a YAML list or a space-separated string), in order; `required` from `argument-hint` (`<x>` required, `[x]` or absent optional). A name the manifest can't take (`^[a-z][a-z0-9_-]*$`) is dropped with a warning, and its placeholder stays |
| `license` | frontmatter `license` |

- Dropped, with a warning each: `allowed-tools`, `disallowed-tools`, `model`, `effort`,
  `context`, `agent`, `background`, `hooks`, `shell`, `when_to_use`, `user-invocable`,
  `metadata`, `compatibility`, and any other frontmatter field. Positional placeholders (`$0`,
  `$ARGUMENTS[N]`, 0-based) stay as written and work only in Claude Code.
- Rendering a command back makes it one the person invokes (the renderer's choice, 023), so a
  command the model could also invoke by itself loses that.
- References: servers of `mcp__…` names in `allowed-tools`.

## 7. Rule (040)

Source: `.claude/rules/**/*.md` (subfolders are read; `frontend/api.md` → `frontend-api`).

| Manifest | From |
|---|---|
| `description` | the body's first heading or line |
| `rule.body` | `rule.md`, the file's body |
| `rule.activation`, `rule.globs` | frontmatter `paths` (a list or a comma-separated string) → `glob` with those globs; no `paths` → `always`. Frontmatter that doesn't parse is ignored, as Claude Code ignores it, with a warning |

- `paths` is the only field Claude Code reads from a rule, so nothing it uses is lost; other
  fields are dropped with a warning.
- `model` and `manual` rules can't be told from skills in Claude Code's files (the renderer writes
  them as skills): they're found as skills and exported as skills.
- Sections in `CLAUDE.md` or `AGENTS.md` aren't read: there's no boundary that says where a rule
  starts and ends.

## 8. MCP server (040)

Source: `mcpServers.<n>` in the project's `.mcp.json`, and the same key at the top of
`~/.claude.json` for user scope. Nothing else in `~/.claude.json` is read, including the servers
Claude Code keeps per project under `projects.<path>.mcpServers` (its local scope).

| Manifest | From |
|---|---|
| `description` | none in the source: the person is asked for one, or the draft arrives with the issue |
| `mcp-server.transport` | `stdio` (no `type`, or `stdio`, with a `command`) or `http` (`http` or `streamable-http`, with a `url`); `sse` (deprecated) and `ws` aren't exportable |
| `mcp-server.command`, `args` | as written |
| `mcp-server.url`, `headers` | as written, where the values are `${VAR}` references. `${VAR:-default}` is read as `${VAR}`, with a warning: the default isn't uploaded, since it may be a literal credential |
| `mcp-server.env` | one entry per key of `env`, **the name only**, `required: true`, and `secret: true` when the name or the value looks like a credential |

- **No value leaves the machine.** An `env` value is never read into the manifest. A header or
  argument whose value is a literal credential is replaced by a `${VAR}` reference, the variable is
  added to `env` as a secret, and the preview says so; if the reader can't tell, the item is
  stopped (§3). A header named as a credential (`Authorization`, `X-Api-Key`, …) keeps its value
  only when it's a reference, alone or after a scheme (`Bearer ${TOKEN}`): one that mixes a literal
  with a reference (`s3cret${X}`) is replaced whole (029). Also taken out (029): the password in the address
  (`https://user:pass@host/`), a query value whose name reads as a credential (`?api_key=…`), the
  value of a flag that takes one (`--password=…`, `--api-key …`, `--token …`, `--auth …`,
  `--passphrase …`, `--bearer …`, `--pw …`; a
  reference is kept; a `--no-…` flag, or a next value that reads as a file path, isn't), an
  argument that is an address or a connection string, alone or as a flag's value, and every address
  in a value that holds several, split at `,`, `;`, `|` or spaces (`--urls=https://a,//user:pass@b`)
  (`postgresql://user:pass@host/db`, `//user:pass@host`, `--dsn=//user:pass@host`), a header passed
  as an argument (after `--header` or `-H`, as `--header=Name: value`, or with no flag when its
  name reads as a credential and has a `-` or is `Authorization` or `Cookie`, such as `X-Api-Key`;
  with or without a space after the colon; its value whole, `=` included: a credential header's by
  the whole-value rule even when it holds an address, another header's address by the address
  rules, in arguments and in an http server's `headers` alike), a credential-named variable passed
  as one, after any flag or in a comma list (`-e API_KEY=…`, `--build-arg=API_KEY=…`,
  `--set a=1,api.key=…`, `X-Api-Key=…`, `githubToken=…`, `_TOKEN=…`, `GITHUB_PAT=…`, `STRIPE_KEY=…`;
  one word whose last part names a credential, then `=`, so `author=jane` and `sort_key=name` stay,
  though an environment-style `…_KEY` such as `SORT_KEY=name`, a credential-named pair after any
  flag such as `--feature-gates=Auth=true`, and an empty `token=` are replaced too), a token used as the address's user (`https://ghp_…@host`), the encoded
  `%3A` form of the password's colon, credential-named values after `#` and percent-encoded names,
  and, in a header that also holds a reference, a literal run of 12 or more letters and digits
  beside it (`hunter2hunter2${X}`).
- **This is a best effort.** The rules recognise the shapes credentials usually take; no set of
  patterns can recognise every one, so the export preview, which shows every file and value before
  anything is uploaded, is what to read. Not caught, among others: a short credential after a flag
  or in a parameter whose name doesn't say it is one (`--key …`, `;token=` path parameters), a
  value glued to a short flag (`-pSECRET`), a header with no flag whose name has no `-`
  (`API_KEY:…`, `Token: …`) or a header with no flag whose name doesn't read as a credential
  (`X-Upstream: //user:pass@host`), a value that starts with `-`
  (`--token -x…`), a credential written into `command` itself rather than its arguments, an address
  or a path with no scheme (`user:pass@host`, `/path?api_key=…` in a header), and a literal broken up by punctuation beside a reference
  (`hunter2!hunter2${X}`).
  Also not caught (seen in the last review, 2026-11-23): addresses split by other characters (`&`,
  `+`, brackets, a full-width comma) or one inside another's query (`?next=https://user:pass@h`); a
  pair's value holding a comma, pairs split by `;` or spaces; pair names whose last word isn't a
  credential word (`API_KEY_1`, `DB_PWD`, `SESSION_ID`, `KEY`), with other characters (`a[0].token`,
  a leading digit, non-ASCII) or other spacing (`TOKEN = v`, `API_KEY:=v`, `/api_key=v`); `///` and
  `\\` addresses, a user-only userinfo or a path token that doesn't look random; header arguments
  written unusually (a space before the colon, `X-Custom-Pass`, an upper-case `--HEADER=`, a
  leading space, the value as the next argument, a non-ASCII name); and a credential flag's value
  that reads as a file path (`--token abc.defg`).
- Dropped, with a warning each: `oauth`, `headersHelper`, `timeout`, `alwaysLoad`, and any other
  key.
- An `env` value is read on the machine only to tell whether the variable is a secret; a value that
  references another variable (`"API_KEY": "${OTHER}"`) is declared as `API_KEY`, with a warning
  that the installed item expects `API_KEY` itself.
- The server `rmk mcp-setup` registered is never listed.

## 9. Codex (043)

Checked against Codex's documentation (learn.chatgpt.com/docs: agent-configuration/subagents,
extend/mcp) and the Codex renderer (024) on **2026-09-30**. Codex's TOML is parsed by `rmk` with
`smol-toml`; the readers take the parsed value.

**Agent.** Source: `.codex/agents/*.toml` (project) and `~/.codex/agents/*.toml` (home). Codex
requires `name`, `description` and `developer_instructions`, and identifies the agent by `name`.

| Manifest | From |
|---|---|
| name | `name`; without one (Codex would refuse the file), the file's name, with a warning |
| `description` | `description` |
| `agent.prompt` | `prompt.md`, from `developer_instructions` (always inline: Codex has no separate file) |
| `agent.tools` | none: Codex agents have no tool list |
| `targets.codex.overrides.model` | `model`, which the Codex renderer reads; the manifest's own `agent.model` is left at the default |

- Dropped, with a warning each: `model_reasoning_effort`, `sandbox_mode`, `nickname_candidates`,
  `skills`, servers defined inline under `mcp_servers` (export the server on its own), and any
  other key.
- The marker is a `# managed by rmk: …` comment at the top.

**MCP server.** Source: `[mcp_servers.<n>]` in `.codex/config.toml` (project; Codex reads it only
in a trusted project, export reads it regardless) and `~/.codex/config.toml` (home). Codex's
transports are stdio and streamable HTTP (which also serves SSE).

| Manifest | From |
|---|---|
| `transport` | `stdio` with a `command`; `http` with a `url` |
| `command`, `args` | as written |
| `env` | the keys of `env` (never the values) and the names in `env_vars` (a string, or `{ name, source }`); secret by §8's rule |
| `url` | as written |
| `headers` | `bearer_token_env_var` as `Authorization: Bearer ${VAR}`; each `env_http_headers` entry as `${VAR}`; `http_headers` literals through §8's credential rules. Each variable is declared in `env` |

- Dropped, with a warning each: `cwd`, `startup_timeout_sec`, `tool_timeout_sec`, `required`,
  `enabled_tools`, `disabled_tools`, `default_tools_approval_mode`, `tools`, `oauth`, and any other
  key. `enabled = false` is kept out too, with a warning that the server is off in Codex.
- `bearer_token_env_var` and a literal `Authorization` in `http_headers`: the variable wins, the
  literal is dropped (never uploaded).

## 10. Cursor (043)

Checked against Cursor's documentation (cursor.com/docs: context/rules, context/subagents,
context/mcp, and commands) and the Cursor renderer (025) on **2026-09-30**.

**Agent.** Source: `.cursor/agents/*.md` (project) and `~/.cursor/agents/*.md` (home). (Cursor
also reads `.claude/agents/` and `.codex/agents/`; those are §5's and §9's.)

| Manifest | From |
|---|---|
| name | frontmatter `name`, else the file's name, as Cursor does |
| `description` | `description` |
| `agent.prompt` | `prompt.md`, the body |
| `agent.tools` | `readonly: true` → `read`, `grep`, `glob` (the renderer writes `readonly` for tools that change nothing); otherwise none |
| `targets.cursor.overrides.model` | `model`, unless it's `inherit` (Cursor's default) |

- Dropped, with a warning each: `is_background`, and any other field.

**Rule.** Source: `.cursor/rules/**/*.mdc` (project only: Cursor keeps user rules in its settings;
`.md` files there are ignored by Cursor and by export).

| Manifest | From |
|---|---|
| `description` | frontmatter `description`, else the body's first line |
| `rule.body` | `rule.md`, the body |
| `rule.activation` | `alwaysApply: true` → `always` (with `globs` dropped, with a warning); else `globs` → `glob`; else a `description` → `model`; else `manual` |
| `rule.globs` | `globs`, comma-separated (or a list) |

**Command.** Source: `.cursor/commands/**/*.{md,mdc,markdown,txt}` (project) and
`~/.cursor/commands/` (home).

| Manifest | From |
|---|---|
| name | frontmatter `name`, else the file's name (a subfolder joins it, as §6) |
| `description` | frontmatter `description`, else the body's first line |
| `command.body` | `command.md`, the body; Cursor commands take no declared arguments |

**MCP server.** Source: `mcpServers.<n>` in `.cursor/mcp.json` (project) and `~/.cursor/mcp.json`
(home). stdio (`type: "stdio"`, or a `command`) or remote (a `url`, streamable HTTP or SSE).

| Manifest | From |
|---|---|
| `transport` | `stdio` with a `command`; `http` with a `url` |
| `command`, `args`, `url`, `headers` | as written, with `${env:NAME}` read as `${NAME}`; literals through §8's credential rules |
| `env` | the keys of `env` (never the values); secret by §8's rule |

- Dropped, with a warning each: `envFile`, `auth` (OAuth), and any other key. Cursor's other
  variables (`${userHome}`, `${workspaceFolder}`, `${workspaceFolderBasename}`, `${pathSeparator}`,
  `${/}`) have no equivalent: the value stays as written, with a warning.
- Cursor's documentation shows `type: "stdio"` as required for stdio servers; the Cursor renderer
  (025) writes it since this check. Either way the reader reads a `command` as stdio.

## 11. GitHub Copilot (028)

Checked against Copilot's documentation (docs.github.com: custom agents configuration, add custom
instructions, add MCP servers, the CLI config-dir reference; code.visualstudio.com: agent skills)
and the Copilot renderer (028) on **2026-11-22**.

**Skill.** Source: `.github/skills/<n>/` (project only) and `~/.copilot/skills/<n>/` (home only),
read by §4.
A command the renderer wrote there as a skill (`disable-model-invocation: true`) comes back as a
skill, as one from `.agents/skills/` does. `--from copilot` also lists `.agents/skills/`, which the
Copilot CLI reads.

**Agent.** Source: `.github/agents/**/*.agent.md` (project) and `~/.copilot/agents/**/*.agent.md`
(home). (The CLI also reads `.claude/agents/`; those are §5's.)

| Manifest | From |
|---|---|
| name | frontmatter `name`, else the file's name without `.agent.md` |
| `description` | `description` |
| `agent.prompt` | `prompt.md`, the body |
| `agent.tools` | each alias: `read` → `read`; `edit` → `edit`, `write`; `search` → `grep`, `glob`; `execute` → `shell`; `web` → `web-fetch`, `web-search`; `<s>/*` → `mcp:<s>`; `<s>/<t>` → `mcp:<s>/<t>`. An alias that stands for several gives all of them, with a warning |
| `targets.copilot.overrides.model` | `model` |

- An MCP server named in `tools` is a reference to that server (as §5).
- Dropped, with a warning each: an alias Ronne has no name for (`agent`, `todo`, …), and any
  other field (`target`, `mcp-servers`, `handoffs`, …).

**Rule.** Source: `.github/instructions/**/*.instructions.md` (project) and
`~/.copilot/instructions/**/*.instructions.md` (home).

| Manifest | From |
|---|---|
| `description` | frontmatter `description`, else the body's first line |
| `rule.body` | `rule.md`, the body |
| `rule.activation` | `applyTo` with `**` → `always`; other globs → `glob`; no `applyTo` → `manual` (Copilot applies it only when it's attached by hand) |
| `rule.globs` | `applyTo`, comma-separated |

- Dropped, with a warning each: `excludeAgent`, and any other field.
- A rule the renderer wrote as `always` is a section of `.github/copilot-instructions.md`, which
  isn't read: sections have no boundary (§12), as in `AGENTS.md`.

**MCP server.** Source: `mcpServers.<n>` in `.github/mcp.json` (project) and
`~/.copilot/mcp-config.json` (home). A server in the project's `.mcp.json`, which Copilot also
reads, is listed as Claude Code's (§8): the same file and shape. The exception is a key `rmk`
wrote there for Copilot and not for Claude Code (the state file says which): that one is Copilot's,
so a change proposal (042) compares it with Copilot's render.

| Manifest | From |
|---|---|
| `transport` | `stdio` for `type: "local"` or `"stdio"`, or a `command`; `http` with a `url` |
| `command`, `args`, `url`, `headers` | as written, through §8's rules: `${VAR}` is the manifest's syntax and stays; a `${VAR:-default}` loses its default, with a warning; a bare `$VAR`, which Copilot also expands, is kept as written and declares no variable; literals through §8's credential rules |
| `env` | the keys of `env` (never the values); secret by §8's rule |

- `tools: ["*"]` is what an item means anyway. A list that picks some tools is dropped, with a
  warning: an item offers all of a server's tools.

**Not read for Copilot:** language servers (`.github/lsp.json`), hooks (`.github/hooks/`) and VS
Code's prompt files, for §12's reasons; prompt files are also VS Code's deprecated Local harness's
only.

## 12. Not read

Hooks, permission policies, status lines and LSP servers live as keys inside the tools' settings
files next to the person's own settings; output styles and bundles are rare. They're authored in
the web app. Rules written as sections of `AGENTS.md` have no boundary (§7). Codex's custom prompts
and Cursor's `.cursorrules` are deprecated by their tools, and not read. Sections of Gemini CLI's
`GEMINI.md` have no boundary either, as `AGENTS.md`'s.

## 13. Antigravity (029)

Checked against antigravity.google/docs (subagents, rules, mcp, customization-discovery) and the
Antigravity renderer (029), and the CLI 1.5.14's own tool names, on **2026-11-22**.

**Skill.** Source: `.agents/skills/<n>/` (project, §4's shared folder) and
`~/.gemini/config/skills/<n>/` (home only).

**Agent.** Source: `.agents/agents/**/*.md` (project) and `~/.gemini/config/agents/**/*.md` (home);
an agent in a folder is `<n>/agent.md`, named by its folder, and that folder's other files are its
own, not agents.

| Manifest | From |
|---|---|
| name | frontmatter `name`, else the file's name (the folder's, for `agent.md`) |
| `description` | `description` |
| `agent.prompt` | `prompt.md`, the body |
| `agent.tools` | the app's names and the CLI's: `view_file`, `read_file` → `read`; `replace_file_content`, `multi_replace_file_content`, `edit_file` → `edit`; `write_to_file`, `write_file` → `write`; `grep_search` → `grep`; `find_by_name` → `glob`; `run_command` → `shell`; `read_url_content` → `web-fetch`; `search_web` → `web-search` |
| `agent.model` | `flash` → `fast`, `pro` → `strong`; `inherit` → none |
| `targets.antigravity.overrides.model` | any other `model` |

- Dropped, with a warning each: a tool Ronne has no name for, and any other field (`mainAgent`,
  `subagent`, `commandExecutionPolicy`, `mcpServers`, …).

**Rule.** Source: `.agents/rules/**/*.md` (project) and `~/.gemini/config/rules/**/*.md` (home).

| Manifest | From |
|---|---|
| `description` | frontmatter `description`, else the body's first line |
| `rule.body` | `rule.md`, the body |
| `rule.activation` | `trigger`: `always_on` → `always`, `glob` → `glob`, `model_decision` → `model`, `manual` → `manual` |
| `rule.globs` | `globs` (or `glob`), comma-separated |

- A missing or unknown `trigger`, which makes Antigravity drop the rule, is read as `manual`, with a
  warning; so is `glob` with no globs.

**MCP server.** Source: `mcpServers.<n>` in `.agents/mcp_config.json` (project) and
`~/.gemini/config/mcp_config.json` (home), through §8's rules: `serverUrl` (or `url`) is `http`,
`command` is `stdio`. Antigravity's own examples put a literal token in `env`, which §8 keeps out:
only the names are read. Other keys (`cwd`, `disabled`, `enabledTools`, …) are dropped with a
warning.

**Not read for Antigravity:** hooks (`hooks.json`) and its CLI's settings, for §12's reasons.

## 14. Gemini CLI (029)

Checked against geminicli.com/docs (subagents, custom-commands, tools/mcp-server) and the CLI
0.70.0's source, and the Gemini CLI renderer (029), on **2026-11-22**.

**Skill.** Source: `.agents/skills/<n>/` (§4's shared folder), `.gemini/skills/<n>/`, and in the
home folder `~/.agents/skills/<n>/` and `~/.gemini/skills/<n>/`.

**Agent.** Source: `.gemini/agents/**/*.md` (project) and `~/.gemini/agents/**/*.md` (home).

| Manifest | From |
|---|---|
| name | frontmatter `name`, else the file's name |
| `description` | `description` |
| `agent.prompt` | `prompt.md`, the body |
| `agent.tools` | `read_file`, `read_many_files` → `read`; `replace` → `edit`; `write_file` → `write`; `grep_search` (or `search_file_content`) → `grep`; `glob` → `glob`; `run_shell_command` → `shell`; `web_fetch` → `web-fetch`; `google_web_search` → `web-search`; `mcp_<s>_<t>` → `mcp:<s>/<t>` and `mcp_<s>_*` → `mcp:<s>`, split at the first `_` as Gemini CLI does, each a reference to the server |
| `targets.gemini.overrides.model` | `model`, unless `inherit` |

- Dropped, with a warning each: a tool Ronne has no name for, and any other field (`temperature`,
  `max_turns`, `mcp_servers`, …).
- A remote agent (`kind: remote`) runs elsewhere, so it isn't read: `rmk` refuses it with a message.

**Command.** Source: `.gemini/commands/**/*.toml` (both scopes); a subfolder joins the name
(`git/commit.toml` → `git-commit`).

| Manifest | From |
|---|---|
| `description` | `description` |
| `command.body` | `command.md`, the `prompt` |
| `command.args` | one argument, `args`, when the prompt has `{{args}}` (where Gemini CLI puts what the person typed) |

- `!{…}` and `@{…}`, which Gemini CLI runs as a shell command or reads as a file, stay as written,
  with a warning; other keys are dropped with a warning; a file that isn't TOML, or has no `prompt`,
  is refused.

**MCP server.** Source: `mcpServers.<n>` in `.gemini/settings.json` (both scopes), through §8's
rules: `httpUrl` is `http`; `url` is SSE, read as `http` with a warning (unless `type: "http"`);
`command` is `stdio`. A bare `$NAME`, which Gemini CLI also expands, is read as `${NAME}`, and a
variable the URL, a header or an argument references is declared, as Gemini CLI fills it in from
its own environment. Other keys (`trust`, `includeTools`,
`cwd`, `timeout`, …) are dropped with a warning. A `settings.json` with comments, which Gemini CLI
allows, can't be parsed, and `rmk` says so.

**Not read for Gemini CLI:** hooks and policies (`settings.json`'s `hooks`, `~/.gemini/policies/`),
for §12's reasons, and sections of `GEMINI.md`.
