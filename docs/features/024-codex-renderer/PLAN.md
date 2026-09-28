# 024 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. TOML in the applier.** The library through the dependency checklist, and `toml-key`
  created, replaced, removed, edited and unmanaged in `planChanges` and `applyPlan`.
  *Done when:* applier unit tests cover each case over a temporary folder, keeping other keys.

- [ ] **2. Re-check and the file types.** The locations against Codex's docs; then `skill`,
  `agent` (TOML), `rule` (sections and skills) and `command`.
  *Done when:* golden files for their example items in both scopes are committed.

- [ ] **3. Settings.** `hook`, `mcp-server` (`toml-key`, with the header shapes) and
  `permission-policy` (`.rules`), plus the trust and `/hooks` notes rmk prints.
  *Done when:* golden files are committed, and unit tests cover the header and decision mappings.

- [ ] **4. The rest.** `output-style`, `statusline` and `lsp-server` as `none`, bundles, the
  `AGENTS.md` size warning, and the renderer in `RENDERERS`.
  *Done when:* golden files and `rmk platforms` show them.

- [ ] **5. End to end and documentation.** `rmk install --target codex` in the Playwright suite,
  and the Documentation section.
  *Done when:* it passes in CI, and the docs render tests cover the new section.

## Notes
