# 043 — Export from Codex's and Cursor's files

> Milestone: M7 · Depends on: 040 · Design: [MVP §3.3](../../MVP/MVP.md#33-platform-renderers), [§12](../../MVP/MVP.md#12-security-considerations) · Contracts: [`docs/spec/native-readers.md`](../../spec/native-readers.md), [`docs/spec/manifest.md`](../../spec/manifest.md)

## Goal

`rmk export` and the MCP export tools also read what a person wrote for **Codex** and **Cursor** in
those tools' own files, not only Claude Code's (040) and the shared `.agents/skills/` (038). A team
that works in Cursor or Codex gets the same way into the marketplace.

## Scope

**In:**
- Readers for Codex: agents (`.codex/agents/*.toml`) and MCP servers (`[mcp_servers.<n>]` in
  `.codex/config.toml`), in the project and the home folder.
- Readers for Cursor: agents (`.cursor/agents/*.md`), rules (`.cursor/rules/*.mdc`), commands
  (`.cursor/commands/*.md`) and MCP servers (`mcpServers` in `.cursor/mcp.json`), in the project and
  the home folder (rules: project only, as Cursor keeps user rules in its settings).
- Telling what the person wrote from what `rmk` installed for these tools: state entries of kind
  `file`, `json-key` and `toml-key`, and the markers the Codex and Cursor renderers write.
- Which tool an item comes from, in the list, the preview and the ambiguity rules; `--from <tool>`
  in `rmk export` and `from` in the MCP tools.
- The contract: `docs/spec/native-readers.md` gains a section per tool, dated when checked.

**Out** (and where it goes instead):
- Rules written as sections of `AGENTS.md` (Codex's instructions file): nothing marks where one
  starts and ends (contract §7, as for `CLAUDE.md`).
- Codex's `.rules` files (Starlark prefix rules): permission policies, not read (contract §9).
- Hooks in `.codex/hooks.json` and `.cursor/hooks.json`, and Cursor's `cli.json` permissions:
  not read (contract §9).
- Codex's custom prompts (`~/.codex/prompts/`): deprecated by Codex; commands come from skills.
- Cursor's legacy `.cursorrules` file: one unnamed rule for the whole project, deprecated by
  Cursor. The person moves it into `.cursor/rules/` first.
- Cursor's user rules: in its settings, not in a file.
- Proposals from Codex or Cursor installs: 042's, once both are built (its merge reads with these
  readers).

## Behaviour

Everything 038–041 do stays: the scope is chosen by the person, the preview comes first, nothing is
uploaded without a yes, secrets never leave, dependencies are found and asked about. This feature
adds where items are found and how each tool's files are read. The field-by-field mapping is the
contract's; it's the Codex (024) and Cursor (025) renderers reversed, and it's checked against both
tools' documentation before building (the first task).

**What is found**, next to Claude Code's:

| Tool | Type | Where | The item gets |
|---|---|---|---|
| Codex | agent | `.codex/agents/*.toml` | `ronne.yaml` and `prompt.md` (`developer_instructions`) |
| Codex | mcp-server | `[mcp_servers.<n>]` in `.codex/config.toml` | `ronne.yaml` only |
| Cursor | agent | `.cursor/agents/*.md` | `ronne.yaml` and `prompt.md` |
| Cursor | rule | `.cursor/rules/*.mdc` | `ronne.yaml` and `rule.md` |
| Cursor | command | `.cursor/commands/*.md` | `ronne.yaml` and `command.md` |
| Cursor | mcp-server | `mcpServers.<n>` in `.cursor/mcp.json` | `ronne.yaml` only |

Skills are already found in `.agents/skills/`, the folder Codex and Cursor share (038).

**Which tool.** Each item found says which tool it's from. The same name in two tools (an agent
`reviewer` for Claude Code and for Cursor) is ambiguous, as two types are in 040: the command lists
them and asks for `--from cursor`, `--type`, or the path. The same MCP server configured for two
tools is two items; a person who wants one of them names it.

**What is kept and lost.** As in 040, each dropped setting is one warning in the preview:

| Tool | Type | Kept | Lost, with a warning |
|---|---|---|---|
| Codex | agent | name, description, the instructions; the model as `targets.codex.overrides.model`, which the Codex renderer reads, so Codex keeps it and other tools use their default | every other key, such as sandbox or reasoning settings. Codex agents have no tool list, so the item has none |
| Codex | mcp-server | stdio's command, arguments and variables (`env` keys and `env_vars`, names only); http's address, `bearer_token_env_var` as an `Authorization: Bearer ${VAR}` header, `env_http_headers` as `${VAR}` headers | every value; literal `http_headers` go through 040's credential rules; timeouts, `enabled`, tool lists and other keys |
| Cursor | agent | name, description, the prompt; `readonly: true` as the tools `read`, `grep` and `glob`; the model as `targets.cursor.overrides.model` | other keys, such as running in the background |
| Cursor | rule | the body; `alwaysApply: true` as `always`, `globs` as `glob`, a description alone as `model`, none of them as `manual` | nothing Cursor reads |
| Cursor | command | the body, and its first line as the description | nothing: Cursor commands have no arguments or settings |
| Cursor | mcp-server | command, arguments, the variables' names, address, headers; `${env:NAME}` read as `${NAME}` | every value; other keys |

**Whose it is** (contract §2) now includes the Codex and Cursor renders: a state entry for the
file, the JSON key or the TOML key (`mcp_servers.<n>`) means `rmk` installed it; so does the marker,
a `# managed by rmk` comment in a TOML file or the HTML comment in Markdown. The `ronne-registry`
server `rmk mcp-setup` registers for each tool is never listed.

**Dependencies** (041). References are matched against items from every tool. When a name is
configured for more than one tool, the one from the dependent's own tool wins (a Cursor agent's
server is looked for in `.cursor/mcp.json` first).

**For the features that build on this.** The readers are
`packages/core/src/read/codex/{agent,mcp-server}.ts` and `…/cursor/{agent,rule,command,mcp-server}.ts`,
with the Codex and Cursor renderers' tables reversed in code. A Codex reader takes the parsed TOML
value, not the text: `rmk` parses it with `smol-toml`, which it already depends on, so core's
runtime dependencies don't change. `LocalItem` gains `tool`.

## Edge cases

- **`.codex/config.toml` or `.cursor/mcp.json` that doesn't parse:** that tool's MCP servers are
  skipped with the reason; everything else lists.
- **A Codex agent without `name`:** the file's name, as Codex does (checked in the first task).
- **A Codex agent's instructions in a separate file** (if Codex allows a path): read from that
  file, and the preview names it.
- **An `.mdc` rule with `alwaysApply: true` and `globs`:** `always`, as Cursor applies it; the
  globs are dropped with a warning.
- **A Cursor MCP server with `${env:NAME}` inside other text:** read as `${NAME}` in the same
  place; a literal credential around it goes through 040's rules.
- **A Codex server with `bearer_token_env_var` and a literal `Authorization` in `http_headers`:**
  the variable wins; the literal is dropped with a warning (and never uploaded).
- **Codex's trust:** Codex reads a project's `.codex/` only in a trusted project; export reads the
  files regardless, since they're the person's.
- **A command in `.cursor/commands/` and a skill of the same name in `.agents/skills/`:** two
  items of two types; `--type` chooses.

## Documentation

- **Exporting your own items** (038's topic): "What it reads" lists Codex's and Cursor's places;
  "What each type keeps and loses" gains the rows above; `--from` in the options.
- **Codex → Where each type goes** (`codex#paths`) and **Cursor → Where each type goes**
  (`cursor#paths`): a sentence that `rmk export` reads the same places for the types it exports.
- **Registry MCP server → The tools** (`mcp#tools`): `list_local_items` says the tool, and the
  tools take `from`.

## Acceptance criteria

- [ ] The mappings in `docs/spec/native-readers.md` for Codex and Cursor carry the date they were checked against each tool's documentation.
- [ ] For each type in the table, the example item rendered for that tool reads back into an item that passes the schema and package checks, and rendering it again gives the same files where the type loses nothing.
- [ ] Every dropped setting produces exactly one warning that names it, in the CLI's preview and in `plan_export`.
- [ ] No value of a Codex `env` or Cursor `env`, and no literal credential from headers, appears in any request; a test greps the request bodies for the fixture's secrets.
- [ ] Items `rmk` installed for Codex and Cursor (files, JSON keys, TOML keys, markers), and each tool's `ronne-registry` server, are refused or not listed.
- [ ] The same name in two tools is ambiguous and `--from` (MCP: `from`) settles it; the list and the preview name the tool.
- [ ] An end-to-end test exports a Cursor rule and a Codex MCP server with the built `rmk`.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Open questions

1. **`--from` or `--tool`** for the source tool. Recommended: `--from`, since `--target` already
   means the tools `rmk install` writes for, and "from" reads as where the item is read.
2. **Cursor's `.cursorrules`.** Recommended: out (deprecated, one file for the whole project, no
   name); the alternative is one `always` rule named after the project folder.
3. **Codex's custom prompts** (`~/.codex/prompts/*.md`, deprecated). Recommended: out; the
   alternative is reading them as commands in user scope, with `$1`… left as written.
4. **An agent's model as an override.** Recommended: keep it in `targets.<tool>.overrides.model`,
   which the Codex and Cursor renderers already read, so the tool it was written for keeps it.
   The same would help Claude Code's `sonnet` and full model ids, which 040 reads as `default`;
   changing 040 is a separate decision (its renderer reads the override too).
