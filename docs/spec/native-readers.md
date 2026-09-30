# Native readers spec

How a file a person wrote in their AI tool's own format becomes a Ronne item, for `rmk export` and
the MCP export tools (M7: features [038](../features/038-rmk-export/SPEC.md)–[041](../features/041-export-dependencies/SPEC.md)).
A reader is the reverse of a renderer ([MVP §3.3](../MVP/MVP.md#33-platform-renderers)): a
renderer turns `ronne.yaml` into a tool's files, and a reader turns a tool's files into a
`ronne.yaml` and the files that go with it ([manifest spec](./manifest.md)).

Status: the skill reader is built (038, `readSkill` in `@ronneai/core/read`); the other four types
are specified by 040. §5–8 were checked against Claude Code's documentation (sub-agents, commands
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
  input allows it. What it can't fix (no description at all) arrives as an issue on the draft.
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
| `.rmk/state.json` (or the user-scope state) has an entry for exactly this folder, file or key ([cli-files](./cli-files.md)) | `rmk` installed it; the hash says whether it was edited since | refused, pointing to **Propose a change** on the item's page (a change proposal is 042) |
| The folder's `ronne.yaml` has a `version` | a copy from a registry: the packer sets `version`, authors leave it out | refused; `rmk export --force` exports it as a new item without the version |
| The file carries the managed marker (`managed by rmk: @scope/name@x.y.z`) | `rmk` rendered it | refused |
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
- References (for 041): MCP servers named in `allowed-tools` (`mcp__<server>__…`).

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
  stopped (§3).
- Dropped, with a warning each: `oauth`, `headersHelper`, `timeout`, `alwaysLoad`, and any other
  key.
- An `env` value is read on the machine only to tell whether the variable is a secret; a value that
  references another variable (`"API_KEY": "${OTHER}"`) is declared as `API_KEY`, with a warning
  that the installed item expects `API_KEY` itself.
- The server `rmk mcp-setup` registered is never listed.

## 9. Not read

Hooks, permission policies, status lines and LSP servers live as keys inside the tools' settings
files next to the person's own settings; output styles and bundles are rare. They're authored in
the web app. Codex's and Cursor's own formats (other than the shared `.agents/skills/`) are 043.
