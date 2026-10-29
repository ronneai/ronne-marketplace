# 145 — Reference MCP servers from items

> Milestone: M23 · Depends on: 096, 097, 089, 012, 031, 023, 024, 025 · Design: [MVP §3.1–§3.3, §4.3](../../MVP/MVP.md), [MVP §15](../../MVP/MVP.md#15-decision-log) ("MCP servers in items") · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md) §2 (`agent`, `mcp-server`), §3, §5

## Goal

The owner's team has already added the MCP servers it uses (Atlassian for Jira and Confluence,
Playwright, GitHub, Slack and others) as `mcp-server` items, by hand (owner, 2026-10-29). Someone
writing a skill, agent or command should be able to say "this uses the GitHub MCP server" in one
step, and have that reference checked and turned into each tool's own wiring. Installing the item
then installs the server ([146](../146-mcp-server-setup/SPEC.md) covers the install and the set-up
steps).

## What's already built

Read before planning, so this feature adds only the gap:

- **Any item may depend on an `mcp-server` item** (096), through the form's dependency picker, the
  composer canvas and the YAML (089 decides who can be picked).
- **Installing an item installs its dependencies** (resolver, MVP §4.3), so a skill that depends on
  `@team/github` already gets `github` written into `.mcp.json` / `.claude.json`,
  `.codex/config.toml` or `.cursor/mcp.json`, with env var references, never values.
- **Agents name MCP tools** as `mcp:<server>` or `mcp:<server>/<tool>` in `agent.tools` (manifest
  §5), mapped per tool (`mcp__<server>` in Claude Code, `Mcp(<server>:*)` in Cursor's permission
  rules). `<server>` is the MCP server item's name without its scope (manifest §2, "the server's
  key in platform configs").
- **Export** (041) already reads a Claude Code skill's or command's `allowed-tools` and offers the
  MCP servers behind it as dependencies.
- **Plugin builders** (076) put a plugin's MCP server dependencies in the plugin's `.mcp.json` /
  `mcp.json`.

What's missing: in the web, `mcp:<server>` is typed by hand (`manifest-fields.ts`: "`mcp:<server>` is
typed out") and nothing checks it names a dependency; nothing links a skill's or command's
`allowed-tools` to its MCP server dependencies; two MCP servers with the same short name collide
silently; and Claude Code agents don't declare the servers they use.

## What each tool supports (checked 2026-10-29)

- **Claude Code subagents** take `mcpServers`: a list whose entries are a server name already
  configured in the session, or an inline definition. `tools` names a whole server's tools as
  `mcp__<server>__*`. Plugin subagents ignore `mcpServers` (code.claude.com/docs/en/sub-agents).
- **Claude Code skills** have `allowed-tools` (tools usable without a prompt while the skill runs; it
  doesn't restrict tools) and no MCP-specific field (code.claude.com/docs/en/skills).
- **Cursor** subagents (`.cursor/agents/*.md`) inherit every configured MCP server, with no
  per-agent list; the project's `.cursor/mcp.json` is what makes a server available.
- **Codex** custom agents are TOML files; per-agent MCP servers are mentioned by third parties but
  not confirmed in OpenAI's docs. Task 2 checks the official docs before anything is written for
  Codex; until then the server is installed in `config.toml`, which every Codex agent sees.

## Scope

**In:**
- **An "MCP servers" field on the form** for skills, agents and commands (and any type through the
  existing dependency picker): a picker limited to `mcp-server` items, by 089's rule (your own in any
  state, others' once published). Picking one adds it to `dependencies` with the suggested range;
  removing it removes the dependency. The field and the dependency list are one source: the YAML,
  the canvas and the field show the same thing.
- **Agents' tools from their MCP servers:** the agent's Tools field offers, for each MCP server
  dependency, "all of `<server>`'s tools" (`mcp:<server>`); typing `mcp:<server>/<tool>` still works.
  Choosing `mcp:<server>` for a server that isn't a dependency offers to add it (one match) or a
  picker (several matches).
- **Checks** (package checks, so the web, `rmk export` and the API agree):
  - `mcp:<server>` in `agent.tools` or a `permission-policy` rule must name an `mcp-server`
    dependency by its short name: an error at submit, a warning while drafting, with "Add
    `@scope/name` as a dependency" when exactly one visible item matches.
  - A skill's or command's `allowed-tools` naming an MCP server (`mcp__<server>__…`) that isn't a
    dependency: a warning with the same offer (the author's file is never edited).
  - **Two MCP server dependencies with the same short name** (for example `@team/github` and
    `@ops/github`, or the same scope in two workspaces after 118): an error at submit, since both
    would be written under one key. The resolver reports the same when it happens through the
    dependency tree, naming who asked for each, and nothing is written.
- **Claude Code agents declare their servers:** an agent's MCP server dependencies are written as
  `mcpServers: [<server>, …]` (references by name, never inline definitions), as 097 writes its skill
  dependencies as `skills:`. Inline definitions are out: they'd copy the configuration into the
  agent's file, and plugin agents ignore the field anyway.
- **Claude Code's tool name for a whole server** becomes `mcp__<server>__*` if task 2 confirms that
  `mcp__<server>` doesn't match the server's tools in `tools` (the vendor's table says `__*`), with
  the golden files updated.
- **The item page** lists "Uses MCP servers" on the Overview (045) for any item whose dependencies,
  direct or not, include MCP servers, each linking to the server's item page.

**Out** (and where it goes instead):
- **Installing, the missing variables and the set-up steps.** [146](../146-mcp-server-setup/SPEC.md).
- **A starter set of well-known MCP servers** shipped with Ronne. Not planned: the owner's team
  already has its own items (owner, 2026-10-29); an open question below.
- **Per-agent MCP servers in Codex and Cursor**, unless task 2 finds an official way: Cursor has
  none, and Codex's is unconfirmed.
- **Editing a skill's `allowed-tools` from the form.** The author's file stays as written.

## Behaviour

**Authoring a skill.** On the form, under Dependencies, "MCP servers" lists the skill's MCP server
dependencies as chips with their range; "Add MCP server" opens the picker filtered to `mcp-server`.
If the skill's `SKILL.md` has `allowed-tools: mcp__jira__*` and `jira` isn't a dependency, the
issues panel says "`SKILL.md` uses the `jira` MCP server, which isn't a dependency", with "Add
`@team/jira`".

**Authoring an agent.** The same field, and the Tools field's suggestions include
"`mcp:github` — every tool of `@team/github`" for each MCP server dependency. Saving writes both
`dependencies` and `agent.tools` in `ronne.yaml`.

**Rendering.** Claude Code: `mcpServers: [github]` in the agent's frontmatter and
`mcp__github__*` (or the confirmed form) in `tools`. Codex and Cursor: unchanged, the server in the
project's or user's config; Cursor's agent file gets nothing, as today.

## Edge cases

- **A dependency on an MCP server that's yanked or deprecated:** as any dependency (MVP §4.3).
- **The MCP server item is renamed or moved** (113, 118, 134): its short name may change, so
  `mcp:<old>` no longer matches. The check reports it on the next save; published versions are
  unchanged and keep installing under the old key.
- **An agent with `tools` omitted** (the platform default): every server is available; `mcpServers`
  is still written.
- **A private workspace's MCP server** (093): dependable only inside its workspace, as any item.
- **A skill exported from Claude Code** (038, 041) that already names MCP servers: unchanged; it
  now also gets the warning if the author declined to export the server.

## Data

- No migration. The manifest schema is unchanged: the references are `dependencies` and
  `agent.tools`, as today. The package checks gain the rules above.

## Documentation

- **Items and types** (`item-types#mcp-server`): "Using an MCP server from a skill, agent or
  command": add it as a dependency (the MCP servers field), what `mcp:<server>` means, the short
  name and why two can't share it.
- **Writing an item** (the draft editor topic): the MCP servers field and the issues it raises.
- **Helpers:** on the MCP servers field, "What does this do?" → `item-types#using-mcp-servers`; on
  the Tools field's MCP suggestions, "How are MCP tools named?" → the same section.
- `docs/spec/manifest.md` §2 and §5: the new checks and Claude Code's `mcpServers`.

## Acceptance criteria

- [ ] A skill, agent or command gets an MCP server dependency from the MCP servers field, the
  picker shows only `mcp-server` items by 089's rule, and the YAML, canvas and field agree.
- [ ] An agent's Tools field offers `mcp:<server>` for each MCP server dependency.
- [ ] `mcp:<server>` without a matching dependency fails at submit and warns while drafting, with an
  offer to add it; the same in `rmk export`'s checks and `POST /api/v1/drafts`.
- [ ] A skill's or command's `allowed-tools` naming a server that isn't a dependency warns.
- [ ] Two MCP server dependencies with one short name fail at submit, and the resolver refuses
  them through the tree, naming who asked for each.
- [ ] Claude Code agents list their MCP server dependencies in `mcpServers`, with golden files; the
  whole-server tool name matches the vendor's current docs.
- [ ] The Overview lists the MCP servers an item uses, direct or not.
- [ ] Every new screen text is in English, Portuguese and French, and the form passes the phone
  sweep.
- [ ] The Documentation and inline helpers listed above say what the feature does.

## Decisions

1. **References are dependencies, nothing new in the manifest** (Claude, 2026-10-29): 096 already
   allows the link, and the resolver and renderers already install it. The feature makes it easy and
   checked, rather than adding a second way to say the same thing.
2. **Claude Code agents reference servers by name, never inline** (Claude, 2026-10-29): one
   configuration per server, kept where `rmk` tracks it, and the same for plugins, whose agents
   ignore `mcpServers`.
3. **The author's files are never rewritten** for `allowed-tools` (Claude, 2026-10-29), as 097 does
   for anything but `agent:`.

## Open questions

- Should Ronne offer a starter set of well-known MCP server items (Atlassian, Playwright, GitHub,
  Slack) that root can add in one step, for instances that don't have them yet?
- Should two MCP servers with one short name be allowed through a per-dependency alias
  (`as: github-ops`), instead of being refused?
