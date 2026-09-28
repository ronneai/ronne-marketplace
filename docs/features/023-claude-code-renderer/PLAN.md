# 023 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Re-check and file types.** Re-check the locations against Claude Code's docs; then
  `skill`, `agent`, `rule`, `command` and `output-style`, with markers and the mappings.
  *Done when:* golden files for their example items in both scopes are committed.

- [ ] **2. Settings.** `hook`, `permission-policy` and `statusline` in the settings file, with
  `json-array-item` added to 021's change kinds, and `mcp-server` in `.mcp.json` and `~/.claude.json`.
  *Done when:* golden files are committed, and unit tests cover adding and removing one array element
  among others.

- [ ] **3. LSP servers and bundles.** The local plugin and marketplace for `lsp-server`, after
  checking how a project enables it; bundles render nothing of their own.
  *Done when:* golden files are committed.

- [ ] **4. End to end.** `rmk install --target claude-code` of a skill, an agent, a hook and an MCP
  server into a temporary project, then `rmk remove`.
  *Done when:* it passes in CI, and unmanaged files and keys are untouched.
- [ ] **5. Documentation.** The Claude Code section, the types table's links, and the item page's
  helper.
  *Done when:* the docs render tests cover them, and each helper's link lands on a real section.

## Notes
