# 040 — Export more types

> Milestone: M7 · Depends on: 038, 039, 023 · Design: [MVP §3.1](../../MVP/MVP.md#31-item-types), [§3.3](../../MVP/MVP.md#33-platform-renderers), [§12](../../MVP/MVP.md#12-security-considerations) · Contracts: [`docs/spec/native-readers.md`](../../spec/native-readers.md), [`docs/spec/manifest.md`](../../spec/manifest.md)

## Goal

`rmk export` and the MCP export tools also take the **agents, commands, rules and MCP servers** a
person wrote for Claude Code, not only skills. These are the types people write by hand as single
files, and the ones a skill or an agent leans on, so 041 can then offer to export what an item
depends on.

## Scope

**In:**
- Readers for four types, from Claude Code's files (contract §5–8):
  `.claude/agents/*.md`, `.claude/commands/*.md`, `.claude/rules/*.md`, and the servers in
  `.mcp.json` (project) or `~/.claude.json` (user).
- Finding them, and telling what the person wrote from what `rmk` installed, for single files and
  for keys in a JSON file.
- `--type` in `rmk export`, and `type` in `list_local_items` and `plan_export`.
- For each type, saying in the preview what the item keeps and what it loses.
- MCP servers: variable names only, never a value.

**Out** (and where it goes instead):
- Turning what an item uses into `dependencies` → 041. Here the readers only collect the
  references.
- Hooks, permission policies, status lines, LSP servers, output styles and bundles: not read
  (contract §9); authored in the web app.
- Codex's and Cursor's own agent, rule and MCP files → 043.
- Rules written as sections of `CLAUDE.md` or `AGENTS.md`: nothing marks where one starts and ends.
- MCP servers Claude Code keeps per project inside `~/.claude.json`: only the project's
  `.mcp.json` and the user-wide servers are read.

## Behaviour

Everything 038 and 039 do stays: the scope is chosen by the person, the preview comes first,
nothing is uploaded without a yes, a draft arrives (037). This feature adds what is found and how
each type is read. The field-by-field mapping is the contract's; this is what the person sees.

**What is found.** `rmk export` with no argument, and `list_local_items`, now list five types. A
name that matches more than one item (`review` the skill and `review` the command) is ambiguous:
the command lists them and asks for `--type`, or for the path.

| Type | Where | The item gets |
|---|---|---|
| agent | `.claude/agents/` | `ronne.yaml` and `prompt.md` (the file's body) |
| command | `.claude/commands/` | `ronne.yaml` and `command.md` |
| rule | `.claude/rules/` | `ronne.yaml` and `rule.md` |
| mcp-server | `mcpServers.<n>` in `.mcp.json` | `ronne.yaml` only |

The path decides the type: a folder under `skills/` is a skill even when it acts like a command,
and a rule that Claude Code applies by description or by hand is a skill on disk and is exported
as one. Subfolders of `agents/`, `commands/` and `rules/` are read, as Claude Code reads them. A
command or rule in a subfolder is named with it (`review/diff.md` → `review-diff`); an agent is
named by its frontmatter `name` wherever it is. Checked against Claude Code's documentation on
2026-09-30 (contract §5–8).

**Whose it is** (contract §2) now covers single files and keys: a state entry of kind `file` for
that path, or `json-key` for that key, means `rmk` installed it; so does the managed marker in a
Markdown file. The server `rmk mcp-setup` registered never appears.

**What is kept and lost.** A native file can say things a portable item can't. The reader drops
them one by one, each with a warning in the preview, so the person decides before uploading:

| Type | Kept | Lost, with a warning |
|---|---|---|
| agent | name, description, prompt, tools that have a canonical name (manifest spec §5), a `haiku` or `opus` model as `fast` or `strong` | tools Ronne has no name for; any other model (`sonnet`, `inherit`, another id); every other setting in the frontmatter |
| command | description, body, named arguments, license | tool restrictions, model, other settings; positional placeholders (`$0`, `$ARGUMENTS[N]`) work only in Claude Code; a command the model could invoke itself becomes one only the person invokes |
| rule | body, the paths it applies to | nothing Claude Code itself reads (`paths` is its only field) |
| mcp-server | transport (`stdio`, or `http` and `streamable-http`), command and arguments, address, headers that reference variables, the variables' names | every value, and the default in `${VAR:-default}`; `oauth`, `headersHelper`, `timeout`, `alwaysLoad` and other keys |

**MCP servers and secrets.** A server's configuration is where tokens live, so this reader is the
strict one:
- The values under `env` are never read into the item. Each key becomes a variable the item
  *declares* (manifest spec §2), marked secret when its name or value looks like a credential.
- A header or argument that contains a literal credential is replaced in the item by a `${VAR}`
  reference, the variable is declared, and the preview says which value was taken out (not the
  value).
- If the reader can't separate a credential from what surrounds it, the item is stopped (038).
- An MCP server has no description on disk. In a terminal `rmk export` asks for one; otherwise
  `--description`, or `plan_export`'s `description`, gives it, and without one the draft arrives
  with the issue.

**For the features that build on this.** The readers are
`packages/core/src/read/claude-code/{agent,command,rule,mcp-server}.ts`, and their tool, model
and placeholder tables are the renderer's (`render/claude-code/mappings.ts`) reversed in code, not
copied, so the two directions can't drift. Each returns `references` (038), which 041 uses.

## Edge cases

- **An agent whose `name` differs from its file's name:** the `name` wins, as in Claude Code.
- **An agent with no `tools`:** the item has none either (the platform's default applies, manifest
  spec §2).
- **A command in a subfolder** (`review/diff.md`): named `review-diff`.
- **The same command as a file and as a skill folder:** two items of two types; `--type` chooses.
- **`paths` as one comma-separated string:** read like a list.
- **An MCP server with a transport the manifest doesn't have** (`sse`, which Claude Code
  deprecates, or `ws`): listed as not exportable, with the reason.
- **A variable name that isn't a valid one** (lowercase, dashes): dropped with a warning.
- **`.mcp.json` or `~/.claude.json` that doesn't parse:** the MCP servers are skipped with the
  reason; the other types still list.
- **An agent, command or rule over 1 MB, or not UTF-8:** refused, like any file over the limits.
- **A description over 300 characters** (common for agents, whose description tells the model when
  to use them): cut with a warning; unlike a skill's, the full text isn't kept anywhere in the
  item. See Open questions.

## Documentation

- **Exporting your own items** (038's topic): a section "What each type keeps and loses", with
  the two tables above in words; the MCP server rules (names, never values) in their own
  paragraph.
- **Claude Code → Where each type goes** (`claude-code#paths`): a sentence that `rmk export` reads
  the same places for agents, commands, rules and MCP servers.
- **Registry MCP server → The tools** (`mcp#tools`): `list_local_items` and `plan_export` take
  `type`.
- **Items and types → The types** (`items#types`): which types can be exported from an AI tool,
  and that the rest are made here.

## Acceptance criteria

- [ ] For each of the four types, the example item rendered for Claude Code reads back into an item that passes the schema and package checks, and rendering that gives the same files (where the type loses nothing). A command is rendered as a skill (023), so its round trip goes through the same text written as a `.claude/commands/` file, and compares the manifests and bodies.
- [ ] Every dropped field produces exactly one warning that names it, shown in the CLI's preview and in `plan_export`.
- [ ] No value of an `env` key, and no literal credential from a header or argument, appears in any request; a test greps the request bodies for the fixture's secrets.
- [ ] Items `rmk` installed (files and JSON keys), and `rmk mcp-setup`'s server, are refused or not listed.
- [ ] `rmk export --type` and the tools' `type` narrow the list, and an ambiguous name asks for it.
- [ ] The mappings in `docs/spec/native-readers.md` §5–8 carry the date they were last checked against Claude Code's documentation.
- [ ] An end-to-end test exports one agent and one MCP server with the built `rmk`.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Open questions

1. **Long descriptions for agents and commands.** The manifest allows 300 characters and the
   renderer writes the manifest's description back into the file, so a cut description changes how
   the installed agent is triggered. Recommended: cut with a loud warning for now; raising the
   manifest's limit, or a separate "when to use" field, is a schema decision for the owner.
2. **A command as `command` or as `skill`.** `command` is portable to every tool but loses what
   only Claude Code has; exporting it as a skill would keep everything in Claude Code. Recommended:
   `command`, with the losses listed; an `--as skill` choice can come later.
3. **A model the manifest doesn't name** (anything but the fast and the strong one). Recommended:
   `default` with a warning; a per-tool override in `targets` is possible if the renderer reads one
   (check when building).
4. **MCP servers without a description.** Recommended: ask, as above. The alternative is a
   placeholder ("MCP server <name>"), which passes the checks and tells a reviewer nothing.
