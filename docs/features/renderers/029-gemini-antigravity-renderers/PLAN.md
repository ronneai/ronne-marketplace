# 029 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Re-spec.**
  - SPEC.md was re-checked against both products' documentation (2026-11-22) and against what was
    built since September (028, 043, 046, 076–078, 097), with the owner's decisions recorded.
  - MVP §3.3: the Antigravity and Gemini CLI columns, the re-check note and the native plugin feeds
    list; §15: a row for their files, and the plugin feeds row.
  - 198's tool table gets Antigravity and Gemini CLI rows.
  - `docs/features/README.md` and the M5b file: 029 `in progress` with its new dependencies.
  - *Done when:* they agree with SPEC.md, and `pnpm witness:check` and `pnpm docs:check` pass.

- [ ] **2. Antigravity's file types.**
  - `packages/core/src/render/antigravity/{renderer.ts,mappings.ts,renderer.test.ts}`, with
    `skill`, `command`, `agent` and `rule` (`manual` as a skill), and `detect()`.
  - The shared skill helpers rooted at `~/.gemini/config/skills/` in user scope.
  - First install the Antigravity CLI on the owner's machine with a scratch home folder, and settle
    what a missing agent `tools` means (Notes).
  - *Done when:* golden files for those example items in both scopes are committed, and the other
    renderers' goldens are unchanged.

- [ ] **3. Antigravity's settings types.** [risky]
  - `hook` (one `hooks.json` key per item, the event table, `SessionStart`/`Stop`'s shape checked
    on the real CLI), `mcp-server` (secrets left out with a warning), and the home-folder-only
    `permission-policy` and `statusline`.
  - `output-style` and `lsp-server` as `none`.
  - *Done when:* golden files are committed, unit tests cover every row of the mapping table for
    Antigravity, and a test shows no secret value is written.

- [ ] **4. Gemini CLI's file types.**
  - `packages/core/src/render/gemini/{renderer.ts,mappings.ts,renderer.test.ts}`, with `skill`,
    `command` (TOML, `{{args}}`), `agent` and `rule` (`GEMINI.md` sections, `model` and `manual`
    as skills), and `detect()`.
  - First install Gemini CLI on the owner's machine with a scratch home folder.
  - *Done when:* golden files for those example items in both scopes are committed, and the other
    renderers' goldens are unchanged.

- [ ] **5. Gemini CLI's settings types.** [risky]
  - `hook` and `mcp-server` in `settings.json` (`${NAME}`, `httpUrl`), the home-folder-only
    `permission-policy` (`~/.gemini/policies/<n>.toml`), and `statusline`, `output-style` and
    `lsp-server` as `none`.
  - *Done when:* golden files are committed, unit tests cover every row of the mapping table for
    Gemini CLI, and a test shows no secret value is written.

- [ ] **6. Other targets and the registry.**
  - Antigravity's "also a target" rows through `render/covered.ts`.
  - Both in `RENDERERS` and `index.ts`; the post-install notes (Gemini CLI's trusted folders and
    hook fingerprints, Antigravity's MCP variables).
  - *Done when:* unit tests cover every row of the "also a target" table, `install.test.ts` covers
    `--target codex,antigravity` and `--target gemini,antigravity`, and the other goldens are
    unchanged.

- [ ] **7. Export.**
  - `packages/core/src/read/antigravity/` and `read/gemini/`, with tests from the renderers'
    output; both in `packages/cli/src/export.ts`, `export-proposal.ts` and the MCP server's export
    tools.
  - `native-readers.md` gets a section for each.
  - *Done when:* exporting each golden output gives back the example item, or the warnings the
    contract names, and `rmk export --from antigravity` and `--from gemini` have CLI tests.

- [ ] **8. Run counting.**
  - `HOOK_TOOLS`, `HOOK_FILES` and `hookChanges` for both, and the handler's payload fields, checked
    on real payloads from both CLIs (say in Notes what was seen).
  - `TOOL_COLOR`, `NO_RUNS`, `--chart-antigravity` and `--chart-gemini` in `tokens.css` and
    `globals.css` (tokens, never red or amber), and the "What each AI tool reports" helper.
  - *Done when:* unit tests cover the hook changes and the handler on the captured payloads.

- [ ] **9. Plugins and the git mirror.**
  - `packages/core/src/plugins/{antigravity,gemini}.ts`, with `PLUGIN_TOOLS`, `build.ts` and
    `pluginNameProblem`, a mirror with no marketplace file for both, and goldens under
    `plugins/__golden__/`.
  - `SERVED_TOOLS`, `PluginFeedsPanel.tsx` and `rmk feed build --tools`; `plugin-feeds.md` gets
    their columns.
  - Install a built plugin with each real CLI from a folder (and by URL if it takes one).
  - *Done when:* plugin goldens are committed, the feed tests include both, and each real CLI loaded
    a built plugin (Notes).

- [ ] **10. Every tool list.**
  - The MCP server's enum, descriptions and `testing.ts`; `TOOL_PLACES` and `TOOL_PAGES`; and the
    messages that name the tools, in en, pt and fr.
  - *Done when:* a search for `"copilot"` finds no tool list without `antigravity` and `gemini`.

- [ ] **11. End to end and the Documentation.**
  - Playwright tests in `apps/web/e2e/rmk.e2e.ts`, like Copilot's: a project with
    `.agents/rules/` picks Antigravity, one with `GEMINI.md` picks Gemini CLI; each installs a
    skill, an agent, a hook, an MCP server and a rule, then removes everything cleanly.
  - In ronne-web, in English, Portuguese and French: the Antigravity and Gemini CLI pages, the Your
    AI tools rows, and the export, usage and plugin feed sections.
  - The app's helpers; `topics.ts` on both sides; MVP §3.3 and §15 as built.
  - *Done when:* the e2e tests pass (run alone with Playwright), the docs render tests cover the new
    pages, and `pnpm docs:check` passes with ronne-web's branch.

## Notes

- **The real CLIs as local test targets** (owner, 2026-11-22): Gemini CLI (Apache-2.0) and the
  Antigravity CLI (proprietary) are installed globally on the owner's machine with scratch home
  folders, so the owner's own `~/.gemini` is untouched. Neither is a dependency of Ronne.
