# 023 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Re-check and file types.** Re-check the locations against Claude Code's docs; then
  `skill`, `agent`, `rule`, `command` and `output-style`, with markers and the mappings.
  *Done when:* golden files for their example items in both scopes are committed.

- [x] **2. Settings.** `hook`, `permission-policy` and `statusline` in the settings file, with
  `json-array-item` added to 021's change kinds, and `mcp-server` in `.mcp.json` and `~/.claude.json`.
  *Done when:* golden files are committed, and unit tests cover adding and removing one array element
  among others.

- [x] **3. LSP servers and bundles.** The local plugin and marketplace for `lsp-server`, after
  checking how a project enables it; bundles render nothing of their own.
  *Done when:* golden files are committed.

- [x] **4. End to end.** `rmk install --target claude-code` of a skill, an agent, a hook and an MCP
  server into a temporary project, then `rmk remove`.
  *Done when:* it passes in CI, and unmanaged files and keys are untouched.
- [x] **5. Documentation.** The Claude Code section, the types table's links, and the item page's
  helper.
  *Done when:* the docs render tests cover them, and each helper's link lands on a real section.

## Notes
- **Built on the recommendations (2026-09-28).** The owner started 023 without answering the
  spec's open questions: same-named items from two scopes fail with `name_clash` (022's applier
  sees the collision), canonical hook variables warn, and `lsp-server` goes through a local plugin.
- **Task 1 (2026-09-28): re-check and file types.** The locations were checked against Claude
  Code's docs earlier the same day (spec 023), so not repeated. `render/claude-code/`: `mappings.ts`
  (tools, events, models) and `renderer.ts`. Markdown files get `---` on line 1 and the marker
  after the frontmatter; frontmatter values are quoted when YAML would read them as something
  else (`argument-hint: "[target]"`, glob lists). Skills copy the item folder as it is, `ronne.yaml`
  included, with the manifest's `entry` renamed to `SKILL.md`. Agents map tools (unknown ones
  warn) and the model (`default` left out); an agent's only override is `model`. Rules: `always`
  and `glob` to `.claude/rules/`, `model` and `manual` as skills. Commands are skills with
  `argument-hint`, `arguments` and `disable-model-invocation`, `{{name}}` → `$name`.
- **Task 2 (2026-09-28): settings.** Hooks are one `json-array-item` under `hooks.<Event>` with
  `matcher` (the mapped tool, left out when the manifest has none) and one `command` handler with
  the manifest's `timeout`; a `run.script` is written to `.claude/hooks/<n>/` (executable, marker
  after the shebang) and run as `"$CLAUDE_PROJECT_DIR"/…` or `"$HOME"/…`; a command using an
  `$RMK_` variable, or an event Claude Code lacks, is an `unsupported_field` warning. MCP servers
  are `mcpServers.<n>` in `.mcp.json` (user: `.claude.json`): `command`/`args` or `type: http`/`url`/
  `headers`, and `env` with `${NAME}` references only. Permission rules are strings in
  `permissions.<decision>`: `Bash(pattern)`, `Read(…)`, `WebFetch(domain:…)`, `mcp__server__tool`;
  an MCP or web-search rule with a pattern is left out with a warning. The status line script goes
  to `.claude/statusline/<n>/` and `statusLine` points at it. (`json-array-item` was added to 021.)
- **Task 3 (2026-09-28): LSP servers and bundles.** An `lsp-server` is a local plugin,
  `.claude/rmk-plugins/<n>/` (`plugin.json`, `.lsp.json` with `extensionToLanguage` from the
  manifest's languages, and a one-plugin `marketplace.json`), registered as
  `extraKnownMarketplaces.rmk-<n>` and switched on as `enabledPlugins["<n>@rmk-<n>"]` in the
  settings file. One marketplace per plugin, rather than one shared one, so no two items write the
  same settings key. How a project registers a local marketplace is what the docs said on
  2026-09-28; the end-to-end test (task 4) is where it's proven. Bundles write nothing. The renderer
  is in `RENDERERS`, and exported from `@ronneai/core/render`.
- **Task 5 (2026-09-28): documentation.** Installing with rmk gains a "Claude Code" section (where
  each type goes, in plain words, and the six things worth knowing: rules, commands as skills, MCP
  approval and env references, output styles, language servers as plugins, markers). The types
  table has an "In Claude Code" column linking to it, and the item page a "Where does this go in
  Claude Code?" helper next to the type.
- **Task 4 (2026-09-28): end to end**, delivered with 022: `apps/web/e2e/rmk.e2e.ts` installs a
  skill, an agent, a hook and an MCP server into a temporary project with `--target claude-code`,
  updates the hook, and removes them, with the user's own file and setting untouched.
