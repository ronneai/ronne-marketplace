# 030 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Re-check and the file types.** The locations against docs.devin.ai; then `skill`,
  `command` (with the shared helper's `triggers` and `argument-hint`, re-generating Codex's and
  Cursor's golden files), `agent` and `rule`.
  *Done when:* golden files for their example items in both scopes are committed.

- [ ] **2. Settings.** `hook` (`hooks.v1.json`), `mcp-server` (`mcp_config.json`) and
  `permission-policy` (`config.json`), with the mappings.
  *Done when:* golden files are committed, and unit tests cover the mappings.

- [ ] **3. Other targets.** What Devin leaves out when Claude Code, Cursor or Codex is a target too,
  generalising 025's `claudeCodeCovers` into a shared helper; `none` types; the renderer in
  `RENDERERS`; the Restricted Mode note.
  *Done when:* unit tests cover every row of the "also a target" table.

- [ ] **4. End to end and documentation.** `rmk install --target devin` in the Playwright suite; the
  Devin page, its row in Your AI tools, and MVP §3.3.
  *Done when:* it passes in CI, and the docs render tests cover the new page.

## Notes
