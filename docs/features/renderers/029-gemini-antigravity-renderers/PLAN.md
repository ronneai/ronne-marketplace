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

- [x] **2. Antigravity's file types.**
  - `packages/core/src/render/antigravity/{renderer.ts,mappings.ts,renderer.test.ts}`, with
    `skill`, `command`, `agent` and `rule` (`manual` as a skill), and `detect()`.
  - The shared skill helpers rooted at `~/.gemini/config/skills/` in user scope.
  - First install the Antigravity CLI on the owner's machine with a scratch home folder, and settle
    what a missing agent `tools` means (Notes).
  - *Done when:* golden files for those example items in both scopes are committed, and the other
    renderers' goldens are unchanged.

- [x] **3. Antigravity's settings types.** [risky]
  - `hook` (one `hooks.json` key per item, the event table, `SessionStart`/`Stop`'s shape checked
    on the real CLI), `mcp-server` (secrets left out with a warning), and the home-folder-only
    `permission-policy` and `statusline`.
  - `output-style` and `lsp-server` as `none`.
  - *Done when:* golden files are committed, unit tests cover every row of the mapping table for
    Antigravity, and a test shows no secret value is written.

- [x] **4. Gemini CLI's file types.**
  - `packages/core/src/render/gemini/{renderer.ts,mappings.ts,renderer.test.ts}`, with `skill`,
    `command` (TOML, `{{args}}`), `agent` and `rule` (`GEMINI.md` sections, `model` and `manual`
    as skills), and `detect()`.
  - First install Gemini CLI on the owner's machine with a scratch home folder.
  - *Done when:* golden files for those example items in both scopes are committed, and the other
    renderers' goldens are unchanged.

- [x] **5. Gemini CLI's settings types.** [risky]
  - `hook` and `mcp-server` in `settings.json` (`${NAME}`, `httpUrl`), the home-folder-only
    `permission-policy` (`~/.gemini/policies/<n>.toml`), and `statusline`, `output-style` and
    `lsp-server` as `none`.
  - *Done when:* golden files are committed, unit tests cover every row of the mapping table for
    Gemini CLI, and a test shows no secret value is written.

- [x] **6. Other targets and the registry.**
  - Antigravity's "also a target" rows through `render/covered.ts`.
  - Both in `RENDERERS` and `index.ts`; the post-install notes (Gemini CLI's trusted folders and
    hook fingerprints, Antigravity's MCP variables).
  - The web app's tests that list every tool (the item page, the catalogue, the registry API and
    the composer) name the two new ones.
  - *Done when:* unit tests cover every row of the "also a target" table, `install.test.ts` covers
    `--target codex,antigravity` and `--target gemini,antigravity`, and the other goldens are
    unchanged.

- [x] **7. Export.**
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
- **What the Antigravity CLI 1.5.14 showed (task 2, 2026-11-22)**, in a scratch project with a
  logging `PreToolUse`/`PostToolUse` hook in the scratch `~/.gemini/config/hooks.json` and probe
  subagents asked to list their tools:
  - The CLI's own tool names are `read_file`, `write_file`, `edit_file`, `run_command`,
    `search_web`, `invoke_subagent` (plus `send_message`, `manage_task`, `schedule`,
    `define_subagent`, `manage_subagents`, `run_workflow`, `swarm`, `ask_question`). It has no grep,
    glob or fetch tool: the model ran `ls`, `grep` and `curl` through `run_command`.
  - A subagent's `tools` takes the documented names as aliases: `view_file`, `replace_file_content`,
    `write_to_file`, `run_command` and `search_web` gave `read_file`, `edit_file`, `write_file`,
    `run_command` and `search_web`; `grep_search`, `find_by_name` and `read_url_content` were dropped
    without a hang. `send_message` and `manage_task` are always added.
  - A subagent without `tools` got `read_file`, `search_web`, `send_message`, `manage_task`,
    `schedule` and `generate_image`: the platform's default, not its parent's tools.
  - The hook payload has `hookEventName` and `cwd` (not in the docs), with `toolCall.name` and
    `toolCall.args`, `conversationId`, `workspacePaths`, `transcriptPath`, `stepIdx`; `PostToolUse`
    adds `error`. A `matcher` of `*` and of `""` both matched every tool. These matter for tasks 3
    and 8: a hook matcher needs the CLI's names (and the app's, from the docs).
- **What the Antigravity CLI 1.5.14 showed (task 3, 2026-11-22)**, in scratch projects trusted with
  `--settings '{"trustedWorkspaces":[…]}'`, with logging hooks:
  - `SessionStart` and `Stop` run bare handlers; wrapped in `{ "hooks": [...] }` they are refused
    ("command hook must specify 'command'"), and one invalid hook drops the whole `hooks.json`.
  - A matcher must match the whole name: `^(?:read_file|view_file)$` fired on `read_file`, `read`
    and `view_file` never fired. `"enabled": false` turns a hook off. A tool event with no `matcher`
    ran for every tool.
  - A hook runs from the folder its `hooks.json` is in: `.agents/` in a project,
    `~/.gemini/config/` at home; `./hooks/<n>/run.sh` ran from both. The only variable it gets is
    `ANTIGRAVITY_CONVERSATION_ID`.
  - An MCP server's `env` values `${PROBE_SRC}` and `$PROBE_SRC` reached it as written, not
    expanded; it inherited `PROBE_SRC` from Antigravity's own environment, and ran in the project
    folder.
  - `permissions.deny: ["command(echo)"]` denied `echo hi` ("Matches user-configured deny rule")
    and let `ls` run.
  - The renderer's own output loaded: the `format-on-edit` golden's matcher fired on `edit_file`,
    and the `github-mcp` golden's `serverUrl` was connected (it then asked for OAuth, its token
    header being left out).
  - After the task 3 witness: `cd .. && pwd` and `cd .. && ./.agents/hooks/sc/run.sh` in a
    project's `.agents/hooks.json` both ran at the project root.
  - After the adversarial pass: `cd .. && true & pwd` ran `pwd` in `.agents/`; with
    `cd .. || exit 1` on a line of its own, `true & pwd`, a command starting with a `#` comment, and
    a plain one all ran at the project root.
  - **The status line** (the owner's terminal, 2026-11-22): with
    `"statusLine": {"type": "command", "command": "\"$HOME\"/'.gemini/antigravity-cli/statusline/probe/my status.sh'"}`
    in the scratch `~/.gemini/antigravity-cli/settings.json`, `agy` 1.5.14 ran the script, which saved
    the session JSON it got on stdin (`"version": "1.5.14"`, `cwd`, `workspace`, `model`, …), and the
    owner saw its output, `STATUS-OK`, in the status line. So a shell runs it: `"$HOME"` expands and a
    quoted path with a space works.
- **What Gemini CLI 0.70.0 showed (task 4, 2026-11-22)**, without a model (the owner's Google
  account can't sign in: "This client is no longer supported for Gemini Code Assist for
  individuals"; owner, 2026-11-22: source and offline runs):
  - Its source's `*_TOOL_NAME` constants are the spec's names (`read_file`, `replace`,
    `write_file`, `grep_search`, `glob`, `run_shell_command`, `web_fetch`, `google_web_search`), plus
    `activate_skill` and `invoke_agent`.
  - `localAgentSchema` is `.strict()` with `kind`, `name` (`^[a-z0-9-_]+$`), `description`,
    `display_name`, `tools` (each `isValidToolName`), `mcp_servers`, `model`, `temperature`,
    `max_turns`, `timeout_mins`; `parseMcpToolName` splits `mcp_<server>_<tool>` at the first `_`.
  - Its own `loadAgentsFromDirectory` (imported from the installed bundle) loaded the golden
    `code-reviewer.md` with tools `read_file, grep_search, glob, run_shell_command,
    mcp_github-mcp_*`, and refused a control agent with the tool `teleport`.
  - Its own `FileCommandLoader` loaded the golden `review-diff.toml` (a `workspace-file` command)
    and skipped a control file whose `prompt` is a number; running it with `src/a.ts` gave the
    prompt with `src/a.ts` where `{{args}}` was. `TomlCommandDefSchema` is `prompt` (required) and
    `description`; `!{` and `@{` are its shell and file injection triggers.
- **What Gemini CLI 0.70.0 showed (task 5, 2026-11-22)**, from its source and its own loaders
  imported from the installed bundle (no model):
  - Hooks: `HookRegistry.processHookDefinition` takes `{ matcher, sequential, hooks: [...] }` and
    skips an invalid entry on its own; `validateHookConfig` needs `type` and `command`; an unknown
    event is skipped with a warning. `matchesToolName` is `new RegExp(matcher).test(toolName)`,
    unanchored. `HookRunner` runs a command with `cwd` the project folder, `GEMINI_PROJECT_DIR`,
    `GEMINI_CWD`, `GEMINI_SESSION_ID` and `CLAUDE_PROJECT_DIR` set, a default timeout of 60,000 ms,
    and `expandCommand` replaces `$GEMINI_PROJECT_DIR` with the folder already shell-quoted. Project
    hooks are blocked in an untrusted folder.
  - Settings: `_doLoadSettings` strips comments before `JSON.parse`; `resolveSettings` expands
    `$NAME`, `${NAME}` and `${NAME:-default}` in every value from the environment, leaving an unset
    one as written.
  - Policies: `PolicyRuleSchema` requires `toolName`, `decision` (`allow`, `deny`, `ask_user`) and
    `priority` (0–999); an MCP rule matches by `mcpName` with `toolName` the tool's own name or `*`.
  - The goldens through its loaders: `loadPoliciesFromToml` read `safe-git.toml`'s three rules at
    priorities 4.3, 4.2 and 4.2 (the user tier), and refused a control rule without `priority`
    ("priority is required"). `loadSettings` on a trusted scratch project (`GEMINI_CLI_TRUST_WORKSPACE=true`)
    loaded the golden hook under `AfterTool` and the golden MCP server, with `Bearer ${GITHUB_TOKEN}`
    expanded in memory from the environment; untrusted, the project's settings weren't loaded.
  - After the task 5 blind pass: Gemini CLI's own `PolicyEngine`, with `commandRegex = "git status\""`
    as `allow`, allowed `git status` and left `git statusx` and `git status; rm -rf x` to its default
    (`ask_user`); `commandRegex` for `echo "a b"` denied it and not `echo "a b" x`. On the Antigravity
    CLI 1.5.14, `deny: ["command(regex:^echo hi$)"]` denied `echo hi` and `echo hi there` and let
    `echo hii` run, so Antigravity has no exact command rule.

