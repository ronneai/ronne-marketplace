# 146 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §15's "MCP servers in items" row and §4.3's "Secrets" paragraph point at 146;
    `docs/features/README.md` lists 146 in M23.
  - *Done when:* the docs say this, and `pnpm witness:check` passes.

- [ ] **2. `mcp-server.setup` in the manifest.**
  - Schema, package checks (the file exists, is Markdown, within the limits), `docs/spec/manifest.md`
    §2, and a `SETUP.md` in `examples/items/github-mcp`.
  - The draft editor's form shows the Setup file field for MCP servers.
  - *Done when:* schema and package-check tests cover present, missing and too large; the examples
    test passes; a form test covers the field.

- [ ] **3. The servers after an install.** [risky]
  - `rmk install`, `rmk update` and the MCP install tools list each new or changed MCP server with
    its variables' descriptions, set or not set, and its notes' first lines with the item page's
    link.
  - No variable's value is ever read beyond "set or not".
  - *Done when:* CLI and MCP tests cover set, missing, empty, several targets, a new required
    variable after an update, and a test that sets a value and finds it in no output.

- [ ] **4. `rmk mcp check` and `check_mcp_servers`.** [risky]
  - From the lockfile, the state file and the artifact cache (or the registry), for the project or
    `--scope user`; `--json`; exit 1 when a required variable is missing.
  - The MCP server's `check_mcp_servers` returns the same.
  - *Done when:* CLI tests cover each case and the exit codes, an MCP tool test covers the answer,
    and an install made before this feature is checked from its files alone.

- [ ] **5. "Set up on your machine" on the item page.**
  - On the Overview of an MCP server item and of every item that uses one (145's list): variables,
    per-OS and per-tool snippets with the names filled in, the notes as sanitised Markdown, and how
    to check in each tool.
  - *Done when:* component tests cover a server, an item using two, a server with notes only, and
    none (hidden); the phone sweep passes; messages in the three languages.

- [ ] **6. Documentation.** The MCP servers topic with its sections, the `rmk` reference and the
  helpers in the spec's Documentation section, in the three languages; `topics.ts` here and in
  ronne-web together. Each tool's way of reading variables is checked against its current docs.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
