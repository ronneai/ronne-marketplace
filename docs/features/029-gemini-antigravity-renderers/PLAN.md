# 029 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Re-check.** Both products' documentation; confirm the paths, Antigravity's MCP secrets
  and `statusLine`, and Gemini CLI's policy files; update the spec where they moved.
  *Done when:* the spec's tables match the docs on the day.

- [ ] **2. The Antigravity renderer.** Every type, the mappings, and what it leaves to other
  targets.
  *Done when:* golden files in both scopes are committed, and unit tests cover the mappings.

- [ ] **3. The Gemini CLI renderer.** Every type (TOML commands, `GEMINI.md` sections, `settings.json`
  hooks and MCP, user policies), the mappings, and the trusted-folder note.
  *Done when:* golden files in both scopes are committed, and unit tests cover the mappings.

- [ ] **4. End to end and documentation.** Both renderers in `RENDERERS`; Playwright installs for
  each; the two Documentation pages, their rows, and MVP §3.3.
  *Done when:* it passes in CI, and the docs render tests cover the new pages.

## Notes
