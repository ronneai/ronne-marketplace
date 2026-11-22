# 028 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Re-check and the file types.** The locations against docs.github.com and VS Code's docs;
  then `skill`, `command`, `agent` and `rule`.
  *Done when:* golden files for their example items in both scopes are committed.

- [ ] **2. Settings.** `hook` (one file per item), `mcp-server` (the two files), `lsp-server`, and the
  user-only `statusline`, with the mappings.
  *Done when:* golden files are committed, and unit tests cover the mappings.

- [ ] **3. Other targets.** What Copilot leaves out when Claude Code, Codex or Gemini CLI is a target
  too (the shared helper from 030 or 029, whichever lands first); `none` types; the renderer in
  `RENDERERS`.
  *Done when:* unit tests cover every row of the "also a target" table.

- [ ] **4. End to end and documentation.** `rmk install --target copilot` in the Playwright suite;
  the GitHub Copilot page, its row, and MVP §3.3.
  *Done when:* it passes in CI, and the docs render tests cover the new page.

## Notes
