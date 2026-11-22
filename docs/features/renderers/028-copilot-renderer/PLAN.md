# 028 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Re-spec.**
  - SPEC.md was re-checked against Copilot's documentation (2026-11-22) and against what was built
    since September (043, 046, 076–079, 097), with the owner's decisions recorded.
  - MVP §3.3: the Copilot column, the note that the Copilot column was re-checked, and the native
    plugin feeds list. M5b is off hold in §13's milestone table, §14's plugin feeds line and §15's
    "Platforms" row.
  - `docs/features/README.md`: M5b off hold, 028 `in progress` with its new dependencies, and 029
    and 030 `specified` (re-checked when each starts).
  - *Done when:* the three agree with SPEC.md, and `pnpm witness:check` and `pnpm docs:check` pass.

- [x] **2. The file types.**
  - `packages/core/src/render/copilot/{renderer.ts,mappings.ts,renderer.test.ts}`, with `skill`,
    `command`, `agent` and `rule`.
  - The shared skill helpers (`agents-skills.ts`, `skill-frontmatter.ts`) take a root, so Copilot
    writes `.github/skills/` (and `.copilot/skills/` in user scope) with the same bytes.
  - `detect()` as the spec says.
  - *Done when:* golden files for those example items in both scopes are committed, and the other
    renderers' goldens are unchanged.

- [x] **3. The settings types.** [risky]
  - `hook` (one file per item, the event table, matchers only where Copilot filters them),
    `mcp-server` (`.mcp.json` and `~/.copilot/mcp-config.json`, `${NAME}`, `tools`), `lsp-server`,
    and the user-only `statusline`. First confirm its key against the config-dir reference.
  - `permission-policy` and `output-style` as `none`.
  - *Done when:* golden files are committed, unit tests cover every row of both mapping tables, and
    a test shows no secret value is written.

- [x] **4. Other targets and the registry.**
  - Move Cursor's `claudeCodeCovers`/`covered` into a shared `render/covered.ts`, without changing
    Cursor's goldens, and use it for Copilot's "also a target" table.
  - `copilotRenderer` in `RENDERERS` and `index.ts`. `rmk install` picks it up through
    `rendererById`; add a post-install note on folder trust for MCP servers.
  - *Done when:* unit tests cover every row of the "also a target" table, `install.test.ts` covers
    `--target claude-code,copilot`, and Cursor's goldens are unchanged.

- [x] **5. Export.**
  - `packages/core/src/read/copilot/` (agents, rules and MCP servers; skills through the shared
    reader), with tests from the renderer's output. Language servers aren't read: `rmk export`
    reads no `lsp-server` for any tool (changed while building, 2026-11-22).
  - `copilot` in `packages/cli/src/export.ts` (`SourceTool`, `EXPORT_TOOLS`, the folder tables) and
    `export-proposal.ts`, and in the MCP server's export tools.
  - `native-readers.md` gets a Copilot section.
  - *Done when:* exporting each golden output gives back the example item, or the warnings the
    contract names, and `rmk export --from copilot` has CLI tests.

- [x] **6. Run counting, plugins and every tool list.**
  - `HOOK_TOOLS`, `HOOK_FILES` and `hookChanges` for `copilot`, and the handler's payload fields,
    checked on a real Copilot CLI payload (or the documented example, if no CLI is at hand; say
    which in Notes).
  - `packages/core/src/plugins/copilot.ts`, with `PLUGIN_TOOLS`, `build.ts`, `MARKETPLACE_PATHS`,
    `marketplaceFor` and `pluginNameProblem`, and goldens under `plugins/__golden__/copilot/`.
  - The feeds: `SERVED_TOOLS`, `plugin-feed.ts`, `PluginFeedsPanel.tsx`, the git mirror, and
    `rmk feed build --tools` (`feed-build.test.ts` stops refusing `copilot`). `plugin-feeds.md`
    gets the Copilot column.
  - The lists: the MCP server's enum, descriptions and `testing.ts`; `TOOL_PLACES` and
    `TOOL_PAGES`; `TOOL_COLOR`, `NO_RUNS` and `--chart-copilot` in `tokens.css` and `globals.css`
    (a token, never red or amber); and the messages that name the tools, in en, pt and fr.
  - *Done when:* unit tests cover the hook changes and the handler, plugin goldens are committed,
    the feed tests include Copilot, and a search for `"cursor"` finds no tool list without
    `copilot`.

- [x] **7. End to end and the Documentation.**
  - A Playwright test in `apps/web/e2e/rmk.e2e.ts`, like Cursor's. A project with
    `.github/copilot-instructions.md` picks Copilot by itself. It installs a skill, an agent, a hook,
    an MCP server and a rule (no language server is seeded: goldens and unit tests cover it); then
    installs with `--target claude-code,copilot` (the covered rows); then removes everything cleanly.
  - In ronne-web (`docs/marketplace-028-copilot-renderer`), in English, Portuguese and French:
    - the GitHub Copilot page;
    - the Your AI tools row;
    - the export, usage and plugin feed sections.
  - The app's helpers; `topics.ts` on both sides; MVP §3.3 and §15 as built.
  - The status line on a real Copilot CLI (owner, 2026-11-22, moved from task 3): does the
    `"$HOME"/…` command run? Record it in Notes, and settle SPEC "Open questions" 1.
  - *Done when:* the e2e test passes (run alone with Playwright), the docs render tests cover the
    new page, `RONNE_WEB_DIR=../ronne-web-028 pnpm docs:check` passes, and the status line was run on
    a real Copilot CLI (or the spec says what changed instead).

## Notes

- **The Copilot CLI as a local test target** (owner, 2026-11-22): `@github/copilot` 1.0.114 is
  proprietary, so it is never a dependency of Ronne (not in the repo, the lockfile or CI). It was
  installed globally on the owner's machine to capture real payloads, with `COPILOT_HOME` (and for
  the status line `HOME`) set to a scratch folder so the owner's own `~/.copilot` was untouched.
  `COPILOT_ALLOW_ALL=true` trusts the working directory, which loads its hooks and MCP servers.
- **What the real CLI showed (task 6):** payloads don't name their event (except
  `permissionRequest`'s `hookName`); a skill is `toolName: "skill"` with `toolArgs.skill`; an MCP
  tool is `<server>-<tool>` in `postToolUse` and `<server>/<tool>` in `permissionRequest`; a
  subagent is `subagentStart` with `agentName`; a hook `matcher` of `probe-ping` fired only for that
  MCP tool, and `~/.copilot/hooks/*.json` runs. This corrected task 3: MCP tools get a matcher.
  A second run (after the task 6 witness) captured a subagent's own `view` call, which carries the
  subagent's `agentId` (the main agent's `task` call doesn't), and showed an empty `{}` file in
  `~/.copilot/hooks/` loads without a warning.
- **The status line (task 7):** the interactive screen couldn't be driven from here (`expect`
  stalls on the terminal's colour queries, and there's no tmux), so the owner ran it in a terminal
  (2026-11-22): with a scratch `HOME` whose `.copilot/settings.json` had
  `"statusLine": {"type": "command", "command": "\"$HOME\"/'.copilot/statusline/probe/my status.sh'"}`,
  `copilot` 1.0.114 ran the script, which wrote the session JSON it got on stdin (`"version":"1.0.114"`).
  So a shell runs the command: `"$HOME"` expands and a quoted path with a space works. The owner
  also saw the script's output, `STATUS-OK`, in Copilot's status line.
