# 025 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Re-check and the file types.** The locations against Cursor's docs; then `skill`,
  `agent`, `rule` (project only) and `command`, with markers and mappings.
  *Done when:* golden files for their example items in both scopes are committed.

- [ ] **2. Settings.** `hook` (with the shared `version` key and the applier change it needs),
  `mcp-server` with `${env:NAME}`, and `permission-policy` for the CLI.
  *Done when:* golden files are committed, and applier tests cover a key two items want.

- [ ] **3. The rest.** `output-style`, `statusline` and `lsp-server` as `none`, bundles, user-scope
  rules, and the renderer in `RENDERERS`.
  *Done when:* golden files and `rmk platforms` show them.

- [ ] **4. End to end and documentation.** `rmk install --target cursor` and `--target
  claude-code,cursor` in the Playwright suite, and the Documentation section and helper.
  *Done when:* it passes in CI, and the docs render tests cover the new section.

## Notes
