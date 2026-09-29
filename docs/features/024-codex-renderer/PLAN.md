# 024 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. TOML in the applier.** The library through the dependency checklist, and `toml-key`
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

- **Task 1, the TOML library** (dependency checklist, `docs/policies/dependencies.md` §3):
  `smol-toml` `^1.9.0` in `@ronneai/rmk`.
  1. *Need:* Node.js has no TOML parser or writer, and a hand-written one that handles quoting,
     dotted keys and tables correctly is more code to own than the library.
  2. *License:* BSD-3-Clause, and it has no dependencies, so the install tree is just it.
  3. *Health:* 1.9.0 released 2026-09-22 (four releases since July), maintained by the Squirrel
     Chat organisation, widely used (Astro and others depend on it), TOML 1.0 compliant.
  4. *Advisories:* three on osv.dev (one high: a parser hang, fixed in 1.7.1; two moderate, fixed
     in 1.3.1 and 1.6.1); none affects 1.9.0.
  5. *Install scripts:* none.
  6. *Weight:* one package, no dependencies.
- rmk writes TOML back in smol-toml's layout, so the note about lost comments and layout compares
  the file with its own canonical rewrite: a file rmk already wrote never triggers it again.

