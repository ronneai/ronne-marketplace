# 145 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §15's "MCP servers in items" row points at 145 and 146; `docs/features/README.md` lists
    145 in M23.
  - *Done when:* the docs say this, and `pnpm witness:check` passes.

- [ ] **2. Vendor check.**
  - Re-read Claude Code's subagent and skill docs, Cursor's subagent and MCP docs, and Codex's
    custom agent and `config.toml` docs (official pages only) for how an agent or skill names MCP
    servers and their tools.
  - Record the result in the spec's "What each tool supports", with the date and links, and say
    whether `mcp__<server>` or `mcp__<server>__*` is right in Claude Code's `tools`.
  - *Done when:* the section is updated with the official pages, and any change it implies for
    tasks 4–5 is written into the spec.

- [ ] **3. Checks in `packages/core`.**
  - `mcp:<server>` in `agent.tools` and `permission-policy` rules must match an `mcp-server`
    dependency's short name (error at submit, warning while drafting).
  - A skill's or command's `allowed-tools` naming an MCP server that isn't a dependency: a warning.
  - Two MCP server dependencies with one short name: an error.
  - The resolver refuses two MCP servers with one short name in a resolution, naming who asked for
    each.
  - *Done when:* unit tests cover each rule, the examples still pass the checks, and resolver tests
    cover the collision through a transitive dependency.

- [ ] **4. Claude Code rendering.**
  - Agents write their MCP server dependencies as `mcpServers: [names]`.
  - The whole-server tool name follows task 2.
  - *Done when:* the golden files (`code-reviewer`, `starter-kit`) are updated and the renderer and
    plugin builder tests pass.

- [ ] **5. The MCP servers field and the Tools suggestions.**
  - The field on skills, agents and commands (picker filtered to `mcp-server`, 089's rule), in sync
    with `dependencies`, the YAML and the canvas.
  - The agent's Tools field offers `mcp:<server>` for each MCP server dependency, and offers to add
    a missing one.
  - The issues panel shows task 3's warnings with "Add `@scope/name`".
  - *Done when:* component tests cover adding, removing and the YAML round trip; an end-to-end test
    writes an agent that uses an MCP server and submits it; the phone sweep passes.

- [ ] **6. Uses MCP servers on the Overview.**
  - The Overview lists the MCP servers an item uses, direct or through its dependencies, each linking
    to its item page.
  - *Done when:* tests cover direct, transitive and none (hidden).

- [ ] **7. Documentation.** The topics, sections and helpers in the spec's Documentation section,
  in the three languages; `docs/spec/manifest.md` updated.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
