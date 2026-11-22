# 028 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Re-spec

Witnessed: 2026-11-22 15:24 EST, by a fresh agent (blind). Commit: 79633e4c + working-tree diff (6 files: MVP.md, 028 SPEC/PLAN, 029/030 SPEC, features/README.md). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | SPEC was re-checked against Copilot's documentation on 2026-11-22 | n/a | can't check here | SPEC "Surfaces" lists the pages checked; vendor docs can't be fetched here; the statusline key is left to task 3 (SPEC, PLAN task 3) |
| 2 | The code the spec builds on (043, 046, 076–079, 097) exists under the names it uses | n/a | confirmed | `grep -n`: cursor/renderer.ts:42 `claudeCodeCovers`; plugins/types.ts:13; marketplace.ts:34,61; codex.ts:17; usage-hooks.ts:22,29,38; export.ts:81,84; mcp server.ts:213; tool-paths.ts:57; UsageCard.tsx:21; feed.ts:23; feed-build.test.ts:421 |
| 3 | The status of each feature the spec relies on matches what it says | n/a | confirmed | README: 042, 043, 046, 047, 076, 077, 079, 097 done; 078 in progress (mirror built); 145, 146, 198 specified |
| 4 | The owner's decisions are recorded and match the body | n/a | confirmed | SPEC "Decisions" 1–5 each match a body line |
| 5 | The "also a target" table follows from "What Copilot reads from other tools" | n/a | partly | hooks: by the spec's facts only the CLI runs `.claude/settings.json` hooks, so VS Code's Copilot harness gets none with `claude-code,copilot` |
| 6 | Every canonical hook event has a Copilot event | n/a | confirmed | ronne.schema.json:182–191, 10 events, all mapped |
| 7 | The MVP §3.3 Copilot column matches the SPEC table | n/a | confirmed | MVP.md:237–247 vs SPEC table |
| 8 | The MVP re-check note dates the Copilot column 2026-11-22 | n/a | confirmed | MVP.md:233 |
| 9 | The native plugin feeds list has Copilot | n/a | confirmed | MVP.md:261; minor: MVP.md:266 area doesn't name Copilot as git-mirror only |
| 10 | §13 milestone table: M5b off hold | n/a | confirmed | MVP.md:793 |
| 11 | §14 plugin feeds line updated | n/a | confirmed | MVP.md:863 |
| 12 | §15 Platforms and "Copilot's files (028)" rows agree with SPEC | n/a | partly | MVP.md:954 says VS Code's Copilot harness reads "only" `.github/skills/` and `.mcp.json`, and the Local harness is "the only reader" of `.agents/skills/` (the CLI reads it too) |
| 13 | The rest of MVP.md agrees with SPEC about Copilot | n/a | partly | MVP.md:144 `PreToolUse` for Copilot (SPEC: `preToolUse`); MVP.md:113 "Copilot permissions" (SPEC: none) |
| 14 | features/README.md: M5b off hold | n/a | confirmed | README:111, 113 |
| 15 | README: 028 `in progress` with its new dependencies | n/a | confirmed | README:119 matches the SPEC header |
| 16 | README: 029 and 030 `specified`, banners agree | n/a | partly | 029/030 SPEC headers say "Depends on: 021, 022, 025", README adds 028 |
| 17 | No stale "on hold" wording for M5b, 028–030 | n/a | confirmed | `grep -rni "on hold"` finds only dated lines and the general rule |
| 18 | Nothing says Copilot is already built | n/a | confirmed | no `render/copilot/`, every tool list still three tools, acceptance boxes unticked |
| 19 | PLAN tasks 2–7 name files that exist, or are clearly new | n/a | confirmed | as row 2, plus install.test.ts; `git diff --check` exit 0 |
| 20 | `pnpm witness:check` passes | n/a | confirmed | exit 0 |
| 21 | `RONNE_WEB_DIR=../ronne-web-028 pnpm docs:check` passes | n/a | confirmed | exit 0 |

**Overall:** not met (rows 5, 12, 13, 16).

Fixes after the pass:
- Row 5: re-checked on 2026-11-22 (code.visualstudio.com hooks page, docs.github.com hooks configuration): VS Code's Copilot harness also runs `.claude/settings.json` and `.claude/settings.local.json` hooks, and `chat.useClaudeHooks` is for the Local harness only. SPEC "What Copilot reads" and the table's reason say so; "Decisions" now separates the owner's four from the two kept from September's recommendations (hooks, rules).
- Row 12: MVP.md's "Copilot's files (028)" rationale reworded ("of the skill folders … only `.github/skills/`, of the MCP files only `.mcp.json`; within VS Code, only the deprecated Local harness reads `.agents/skills/` …").
- Row 13: MVP.md:113 says Copilot has no committed permissions; MVP.md:144 puts Copilot with `preToolUse`.
- Row 16: the 029 and 030 headers depend on 028.
- Row 9 (minor): MVP §15 "Native plugin feeds" names Copilot among the git-mirror tools.
- Also: `COPILOT_HOME` is no longer followed (SPEC "Surfaces", edge cases, PLAN task 2), as no tool's home override is (`CODEX_HOME`, `CLAUDE_CONFIG_DIR`: no match in `packages/` or `apps/web/src`).

### Re-check 1

Witnessed: 2026-11-22 15:29 EST, by a fresh agent (blind re-check). Commit: 79633e4c + working-tree diff (6 files: MVP.md, 028 SPEC/PLAN, 029/030 SPEC, features/README.md). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | The "also a target" table follows from "What Copilot reads from other tools" | yes | confirmed | SPEC:86–88 both surfaces read `AGENTS.md`, `.mcp.json` and run Claude Code's hooks; table SPEC:94–95 and SPEC:97–100 follow; the vendor fact itself can't be checked here |
| 12 | §15 "Copilot's files (028)" row agrees with SPEC | yes | confirmed | MVP.md:954 against SPEC:74–75, 84–88 and Decisions 1–3, 5 |
| 13 | The rest of MVP.md agrees with SPEC about Copilot | yes | partly | MVP.md:113 and 144–145 fixed; MVP.md:241 (§3.3 hook cell) still says only the CLI runs Claude Code's hooks |
| 16 | 029 and 030 headers agree with README | yes | confirmed | 029/030 SPEC:3 "Depends on: 021, 022, 025, 028" = README:120–121 |
| 9 | (minor) §15 "Native plugin feeds" names Copilot among the git-mirror tools | yes | confirmed | `git diff MVP.md`; MVP.md:261 |
| 22 | SPEC "Surfaces": `COPILOT_HOME` isn't followed, like `CODEX_HOME` | yes | confirmed | SPEC:55–56; `grep -rn "CODEX_HOME\|CLAUDE_CONFIG_DIR\|COPILOT_HOME" packages apps/web/src` → no match |
| 23 | SPEC "Edge cases": `COPILOT_HOME` still writes under `~/.copilot` | yes | confirmed | SPEC:267; `grep -rn COPILOT_HOME docs/` → no claim that it's followed |
| 24 | SPEC "Decisions": owner's 1–4, then 5–6 kept from September, each matching the body | yes | confirmed | SPEC:288–301; owner attributions only on :5, :75, :141 |
| 25 | PLAN task 2's detect bullet agrees with SPEC | yes | confirmed | PLAN:27, SPEC:77–80 |
| 26 | Nothing says Copilot is built | n/a | confirmed | no `render/copilot/`; boxes unticked; README `in progress` |
| 27 | `pnpm witness:check` passes | n/a | confirmed | exit 0 |
| 28 | `RONNE_WEB_DIR=../ronne-web-028 pnpm docs:check` passes | n/a | confirmed | exit 0; `git diff --check` exit 0 |

**Overall:** not met (row 13).

Fixes after the pass: MVP.md:241's Copilot hook cell says "the CLI and VS Code's Copilot harness also run Claude Code's hooks".

### Re-check 2

Witnessed: 2026-11-22 15:29 EST, by a fresh agent (blind, re-check of row 13 only, wording). Commit: 79633e4c + working-tree diff (MVP.md, 028 SPEC/PLAN, 029/030 SPEC, features README, untracked 028 WITNESS.md). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | docs/MVP/MVP.md agrees with 028 SPEC.md about Copilot everywhere, including the §3.3 hook cell | no | confirmed | MVP.md:241 "the CLI and VS Code's Copilot harness also run Claude Code's hooks" = SPEC:86–88; `grep -n -i copilot docs/MVP/MVP.md`, 17 lines read one by one, none contradicts the SPEC |
| 13a | `pnpm witness:check` exits 0 | no | confirmed | exit 0 |
| 13b | `RONNE_WEB_DIR=../ronne-web-028 pnpm docs:check` exits 0 | no | confirmed | exit 0 |

**Overall:** met.

## Task 2 — The file types

Witnessed: 2026-11-22 15:32 EST, by a fresh agent (blind). Commit: 8628d80c + working tree (`M packages/core/src/render/agents-skills.ts`, `?? packages/core/src/render/copilot/`). Machine: macOS (Darwin 27.2.0), Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `copilot/{renderer.ts,mappings.ts,renderer.test.ts}` exist and render `skill`, `command`, `agent` and `rule` | no | confirmed | `find packages/core/src/render/copilot`; renderer.ts:178–200; `vitest run src/render/copilot/renderer.test.ts` → 11 passed |
| 2 | The shared skill helpers take a root/place; Codex's and Cursor's defaults are unchanged | no | confirmed | `git diff agents-skills.ts`; the shared warning still says "Codex and Cursor"; `vitest run src/render src/plugins` → 107 passed |
| 3 | Skills and commands go to `.github/skills/<n>/` / `.copilot/skills/<n>/` with the shared copy's bytes | no | confirmed | `cmp` codex vs copilot goldens, both scopes → identical; mutation (root → `.agents/skills`) → 3 tests fail |
| 4 | A skill's `agent:` and `context:` are dropped, with a warning (097) | no | confirmed | probe: CRLF SKILL.md with both keys → neither written, CRLF and "é" kept, warning |
| 5 | A command is a skill with `disable-model-invocation: true`, named after its folder | no | confirmed | review-diff golden = Codex's bytes; test checks `name: review-diff` |
| 6 | An agent goes to `.github/agents/<n>.agent.md` / `.copilot/agents/…` with name, description, tools and the prompt | no | confirmed | code-reviewer goldens, both scopes |
| 7 | Agent `tools` follow the Mappings table, each alias once | no | confirmed | mappings.ts:8–19; test "maps every canonical tool"; probe: repeated `mcp:gh/x` once, unknown → `unmapped_tool`; mutation → 3 tests fail |
| 8 | `model` only from `targets.copilot.overrides.model`; hints warn; other overrides refused; skills not preloaded warn | no | confirmed | renderer.ts:62–87; probes `model: fast` / `default`; override test; golden warnings |
| 9 | Rules: `always` → `"**"`, `glob` → comma-joined globs, `model`/`manual` → skills | no | confirmed | house-style goldens; probes; mutations (`"*"`, `", "`, no disable-model-invocation) → each fails a test |
| 10 | `detect()` true for the 8 spec paths, false for `.github/` alone and other tools' files | no | confirmed | renderer.ts:160–172; probes; mutation (adds `.github`) → detect test fails |
| 11 | Goldens for secure-coding, review-diff, code-reviewer, house-style, both scopes, checked by the test | no | confirmed | `__golden__/<item>/{project,user}/…`; `checkGolden` passes, mutations make it fail |
| 12 | The other types' goldens claim no output this task doesn't produce | no | confirmed | hook, mcp-server, lsp-server, statusline, permission-policy, output-style → `changes: []` + "isn't rendered for GitHub Copilot yet"; bundle → `[]` |
| 13 | The other renderers' goldens are unchanged | no | confirmed | `git status --short` on their `__golden__`, `plugins/`, `examples/` → nothing; 107/107 pass |
| 14 | The renderer isn't in `RENDERERS` yet (task 4) | no | confirmed | registry.ts:11–15 |
| 15 | The new code typechecks and lints | no | confirmed | `tsc --noEmit -p packages/core/tsconfig.json` → 0; `biome check` → no issues |

**Overall:** met.

## Task 3 — The settings types

Witnessed: 2026-11-22 15:42 EST, by a fresh agent (blind). Commit: 810c3ecc + working tree (3 copilot source files, 19 changed goldens, 8 new golden files, `docs/MVP/MVP.md`, `docs/features/028-copilot-renderer/SPEC.md`). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Goldens for format-on-edit, github-mcp, typescript-lsp, git-branch, safe-git, concise, both scopes, checked by the test | no | confirmed | `git status` → 8 new files plus changed json; 17/17 pass; mutations (statusLine key, `.mcp.json` path, `cwd`, `tools`) → the golden test fails |
| 2 | A hook is one file per item, `{version:1, hooks:{<event>:[{type, bash, timeoutSec}]}}` | no | confirmed | format-on-edit goldens; renderer.ts `renderHook` |
| 3 | All 10 canonical events map as SPEC's table | no | confirmed | mappings.ts `EVENTS`; test loops all 10; mutation → fails |
| 4 | `matcher` only on preToolUse/postToolUse/permissionRequest as the CLI's names; web-search, `mcp:*` and other events warn and the hook installs | no | confirmed | `HOOK_TOOLS`, `TOOL_EVENTS`; probes; mutations → "writes a tool filter…" fails |
| 5 | Scripts under `<root>/hooks/<n>/`, `cwd:"."` in a project, `"$HOME"/…` in user scope, executable, with the marker | no | confirmed | test "writes a hook's script next to it"; mutation removing `cwd` → 3 tests fail |
| 6 | `$RMK_` in a command warns | no | confirmed | format-on-edit warnings.json, both scopes |
| 7 | MCP: `mcpServers.<n>` in `.mcp.json` / `~/.copilot/mcp-config.json`, stdio and http shapes, `tools:["*"]` | no | confirmed | github-mcp key goldens; stdio test; probes; mutations → 2 tests fail |
| 8 | A test shows no secret value is written | no | confirmed | planted `value:"s3cret"` not written; mutation → fails; headers pass through as written, as in Claude Code |
| 9 | LSP: `lspServers.<n>` in `.github/lsp.json` / `~/.copilot/lsp-config.json`, `fileExtensions` from the languages | no | confirmed | typescript-lsp key goldens; test covers both scopes |
| 10 | Status line user-only; script under `~/.copilot/statusline/<n>/`; `statusLine` in `~/.copilot/settings.json`; `degraded` | no | confirmed | git-branch goldens; project warning; mutation → 2 tests fail |
| 11 | The `statusLine` key was confirmed against the config-dir reference | no | can't check here | vendor docs not fetched; SPEC.md:159 still says task 3 confirms it |
| 12 | `permission-policy` and `output-style` are `none` and warn | no | confirmed | `supports`; safe-git and concise warnings |
| 13 | Unit tests cover every row of both mapping tables | no | confirmed | three tests; one mutation per table fails |
| 14 | No other renderer's goldens changed | no | confirmed | `git status --porcelain` outside copilot and docs → nothing |
| 15 | The hook matcher wording agrees across SPEC and MVP §3.3 / §15 | no | confirmed | `git diff docs/`; no old wording left |
| 16 | The pass left the repository untouched | no | confirmed | `git status` and `cmp` against the snapshot |

**Overall:** not met (row 11).

### Adversarial pass

Witnessed: 2026-11-22 15:40 EST, by a fresh agent (adversarial). Commit: 810c3ecc + uncommitted working tree (renderer.ts, mappings.ts, renderer.test.ts, goldens, SPEC.md, MVP.md). Machine: macOS (Darwin 27.2.0), Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1a | MCP `env` is written only as `${NAME}`, whatever else the entry holds | no | confirmed | probe with `value`, `default`, `secret`, empty and raw entries → only `{"TOKEN":"${TOKEN}"}` |
| 1b | MCP `headers` are written only as `${NAME}` references | no | partly | renderer.ts:232 copies header values as they are; `{"X-Api-Key":"abc123literal"}` is written; Claude Code and Cursor do the same; the no-secret test covers only `env` |
| 1c | Copilot expands `${NAME}` in mcp-config `env`/`headers` | no | can't check here | needs the vendor docs or a real CLI |
| 2a | Each hook item has its own file, so no two items share a key | no | confirmed | probe; a short-name clash is the applier's conflict (apply.ts:412–422); mutation (one shared file) → 2 tests fail |
| 2b | Scripts: shape as specified, and a path can't escape or break the command | no | partly | `..` refused by the schema and the applier (apply.ts:54–56); but `run.script: "my script.sh"` is written unquoted, so the command runs `…/my` (also the statusline) |
| 3 | Events and matchers as the tables; a matcher is only a fixed name | no | confirmed | probes; hardening: `event: "constructor"` and `matcher.tool: "__proto__"` read inherited properties (blocked by the schema) |
| 4 | MCP, LSP, statusline, permission-policy and output-style as specified | no | confirmed | tests and probes; minor: a shared extension is overwritten without a warning |
| 4b | The `statusLine` key was confirmed against the config-dir reference | no | can't check here | SPEC.md:158–160 still says task 3 confirms it |
| 5 | The unit tests catch a regression in each mapping row and in the no-secret rule | no | confirmed | 26 mutations, all killed; not covered: literal header values (1b) |
| 6 | Other renderers' goldens and behaviour are unchanged | no | confirmed | `git diff --name-only`; `vitest run src/render src/plugins` → 113 passed |

**Overall:** not met (1b, 2b; 1c and 4b can't check here).

Fixes after the passes:
- Row 11 / 4b: SPEC "statusline" records the 2026-11-22 check: the config-dir reference's user settings table has a `statusLine` row of type object and its text names `statusLine.command`; the fields beyond that came from a summary, so task 7's notes record a real CLI run if one is at hand. Re-fetching the page in the witness's toolset isn't possible, so this stays a recorded vendor check.
- 1b: SPEC "mcp-server" now says what all three renderers do: `env` always as references; headers as the manifest has them, a literal value caught by the save's secret checks (manifest spec §2 and §6). A test pins that header values pass through as written. The acceptance line says "no `env` value is written".
- 2b: a script path with anything but letters, digits and `._/-` is single-quoted (`shellWord`), for hooks and the status line, with a test (`my script's.sh` in both scopes); SPEC "hook" says so. The goldens don't change.
- 3 (hardening): `EVENTS` and `HOOK_TOOLS` are read through `Object.hasOwn`, with a test for `constructor` and `__proto__`.
- 4 (minor): two languages claiming one extension warn, with a test.
- Blind finding: a tool filter on an event Copilot doesn't filter now says the filter was left out and the hook runs on every such event.

### Re-check 1

Witnessed: 2026-11-22 15:47 EST, by a fresh agent (blind). Commit: 810c3ecc + uncommitted working tree (the same 33 changed or new paths as the first passes). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 11 | The `statusLine` key in `~/.copilot/settings.json` was confirmed against the CLI config-dir reference | yes | confirmed | `curl -sL https://raw.githubusercontent.com/github/docs/main/content/copilot/reference/copilot-cli-reference/cli-config-dir-reference.md` → 200; line 817: "`statusLine` \| `object` \| — \| Custom status line display. `type`: must be `"command"`. `command`: path to an executable script that receives session JSON on stdin …"; renderer.ts:337–340 and the git-branch/user key golden match |
| 11a | The SPEC statusline paragraph matches the reference | yes | partly | it still says the fields came from a summary; line 817 says them verbatim |
| 11b | The written `command` works as Copilot runs it | no | can't check here | `"$HOME"/…` is a shell expression; the reference doesn't say a shell runs it; needs a real CLI |
| 12 | The Copilot renderer tests pass | yes | confirmed | 20/20 |
| 13 | The SPEC "hook" paragraph agrees with the code | yes | confirmed | mappings.ts:37, 43–51; renderer.ts:158–163, 208 |
| 14 | The SPEC "mcp-server" paragraph and the MCP acceptance line agree with the code | yes | confirmed | pass-through test; acceptance line |
| 15 | The pass left the repository untouched | no | confirmed | `git status --short` unchanged |

**Overall:** not met (11a, 11b).

### Adversarial re-check 1

Witnessed: 2026-11-22 15:46 EST, by a fresh agent (adversarial). Commit: 810c3ecc + uncommitted working tree (renderer.ts, mappings.ts, renderer.test.ts, goldens, SPEC.md, MVP.md). Machine: macOS (Darwin 27.2.0), Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1a | No MCP `env` value is ever written, only `${NAME}` | yes | confirmed | `envRef` only; mutation → 1 test fails |
| 1b | SPEC "mcp-server" states the header behaviour truthfully | yes | partly | pass-through true (as Claude Code and Cursor), but "caught when saved" is too strong: `secretLike` (package-checks.ts:119, :320) passes `"Bearer hunter2"` and Basic auth, warns on a long random token, refuses `ghp_…`; manifest.md §6 doesn't cover secrets, §2:118 does |
| 1c | Copilot expands `${NAME}` in mcp-config `env`/`headers` | no | confirmed | CLI command reference (docs.github.com article body): `env` "Supports `$VAR`, `${VAR}`, and `${VAR:-default}` expansion"; `headers` "Supports variable expansion" |
| 2b | A hook script path is one shell word in both scopes and runs exactly that file | yes | confirmed | 15 hostile names (space, `'`, `$(…)`, backticks, `;`, newline, …), each run with `bash -c` in both scopes → all ran exactly, nothing injected |
| 2c | The status line command runs the quoted script | no | can't check here | "path to an executable script"; whether a shell runs it is undocumented |
| 3 | `EVENTS`/`HOOK_TOOLS` lookups are own-property only | yes | confirmed | `Object.hasOwn`; test; mutation → fails |
| 4 | Two languages claiming one extension warn, the last one wins | yes | confirmed | test; 2 mutations killed; survivor: one language listing an extension twice (minor) |
| 5 | Copilot tests kill mutations of the new code | yes | partly | 13 of 15 killed; survived: a space added to the unquoted set (the quoting test's name also holds `'`), and row 4's survivor |
| 6 | Every renderer's goldens are unchanged except Copilot's | no | confirmed | `git status` outside copilot → empty; 116 passed |
| 7 | MCP entry shape as SPEC | no | partly | the CLI reference marks `args` required for local servers; a stdio item without `args` gets none |

**Overall:** not met (1b, 5, 7; 2c can't check here).

Fixes after the re-checks:
- 11a: SPEC "statusline" quotes the reference's row (2026-11-22) and says why the command is `"$HOME"/…`.
- 11b / 2c: the owner moved the real-CLI check of the status line command to task 7 (2026-11-22): SPEC "Open questions" 1, PLAN task 7's bullet and *Done when*. It is no longer a claim of task 3.
- 1b: SPEC says what the save checks catch (a known token format refused, a long random string warned about, a short literal not caught), cites manifest spec §2 only, and records 1c's expansion.
- 5: the quoting test also covers `my script.sh` (a space and no `'`) and a plain name left unquoted; a test pins no warning for one language listing an extension twice.
- 7: a local server always gets `args` (`[]` when the manifest has none), with a test; SPEC says so.

### Re-check 2

Witnessed: 2026-11-22 15:58 EST, by a fresh agent (blind). Commit: 810c3ecc + the uncommitted working tree. Machine: macOS 27.2.1, Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 11a | The SPEC "statusline" paragraph matches the vendor reference row | yes | confirmed | SPEC.md:165–173 word for word with ref.md:817 |
| 11b | The real-CLI check of the status line command has moved out of task 3 | yes | confirmed | SPEC.md:305–307 (Open questions 1, owner 2026-11-22); PLAN.md:82–86 (task 7 bullet and *Done when*); no claim the `"$HOME"/…` command is known to work |
| 12 | The copilot renderer tests pass | yes | confirmed | 22/22 |
| 13 | `pnpm witness:check` exits 0 | yes | confirmed | exit 0 |
| 14 | `RONNE_WEB_DIR=../ronne-web-028 pnpm docs:check` exits 0 | yes | confirmed | exit 0 |

**Overall:** met.

### Adversarial re-check 2

Witnessed: 2026-11-22 15:58 EST, by a fresh agent (adversarial). Commit: 810c3ecc + uncommitted working tree. Machine: macOS (Darwin 27.2.0), Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1b | SPEC "mcp-server" states truthfully what the save checks catch for headers, and that Copilot expands variables | no | confirmed | package-checks.ts:313–338, run on save (submission.ts:170); probe: `ghp_…` refused, long random warned, `hunter2pass` passes, `${NAME}` stripped; manifest.md:118; the CLI command reference on `env` and `headers` expansion |
| 5 | The survivors of re-check 1 are killed; further mutations of shellWord and scriptCommand are killed | no | partly | killed: space in the unquoted set, `before !== id`, escape, both anchors, wrapping, `"$HOME"` → `$HOME`; **survived**: `$` added to the unquoted set (no test pins `$` in a path; the code quotes it) |
| 7 | A stdio MCP server always gets `args`, with a test, and SPEC says so | no | confirmed | renderer.ts:249; renderer.test.ts:308–316; two mutations killed; SPEC.md:148–149 |
| 2c | The status-line check moved to task 7 by the owner | no | confirmed | SPEC.md:305–307, 172–173; PLAN task 7 |

**Overall:** not met (row 5, a test gap).

Fixes after the re-checks: the quoting test also pins `run$X.sh`, ``run`x`.sh``, `run*.sh` and `run;x.sh` as single-quoted. The witness's mutation (`$` in the unquoted set) now fails 1 test, and the file was restored (`cmp`). The owner chose a third, scoped adversarial re-check of row 5 (2026-11-22).

### Adversarial re-check 3

Witnessed: 2026-11-22 16:05 EST, by a fresh agent (adversarial). Commit: 810c3ecc + uncommitted working tree. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | The Copilot tests kill mutations of shellWord and scriptCommand | yes | not met | `mutate.sh` on the set at renderer.ts:159: killed: `$`, backtick, `*`, `;`, space, `.+`; **survived** (22 passed): `'`, `"`, `\|`, `&`, `\`, `()`, `~` (`~` harmless: never at a word's start) |

**Overall:** not met (row 5, a test gap: the loop pinned 4 characters).

Fixes after the re-check: the quoting test now runs every printable ASCII character, a tab and a newline through a script name, and expects each one outside `[A-Za-z0-9._/-]` quoted and each one inside unquoted, plus `run'x.sh` with its escape. The implementer's own run: adding `'`, `"`, `|`, `&`, `()`, `~`, space or `+` to the set fails 1 test each; dropping `-` fails 4; the file restored (`cmp`). The owner chose a fourth, scoped adversarial re-check of row 5 (2026-11-22).

### Adversarial re-check 4

Witnessed: 2026-11-22 16:07 EST, by a fresh agent (adversarial). Commit: 810c3ecc + uncommitted working tree. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | The Copilot tests kill mutations of shellWord and scriptCommand | no | partly | `mut5.sh`, `mut5b.sh` (22 tests each run): the 7 survivors of re-check 3, narrowing the set, widening it, the anchors, always/never quoting, the escape's forms, the `"$HOME"/` prefix, both scopes and the statusline all fail; `[\w./-]` passes (an equivalent set, not a gap); **survived**: `replaceAll` → `replace` (no test name with two `'`) |

**Overall:** not met (row 5: one escape mutation survives).

Fixes after the re-check: a test with `a'b'c.sh` expects `'.github/hooks/format-on-edit/a'\''b'\''c.sh'`. The implementer reran the witness's own `mut5.sh` and `mut5b.sh` on the synced scratch copy (`cmp` equal to the worktree): every mutation fails 1–7 tests, including `escape-replace-first`, except the equivalent `word-class` (22 passed).

### Adversarial re-check 5

Witnessed: 2026-11-22 16:14 EST, by a fresh agent (adversarial), re-check scoped to row 5. Commit: 810c3ecc + uncommitted working tree. Machine: macOS 27.2.1, Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | The Copilot tests kill mutations of shellWord and scriptCommand (renderer.ts:158–163) | yes | confirmed | scratch copy synced (`cmp`, `diff -r`); baseline 22 passed; `escape-replace-first` → 1 failed (renderer.test.ts:291–292, `a'b'c.sh`); `mut5.sh` and `mut5b.sh` rerun: every applied mutation fails 1–7 tests except `[\w./-]` (equivalent); new: no `-`, no `/`, `:` added, `"$HOME"` without `/` → all fail; `+` → `*` passes (equivalent: every path has a prefix); repository untouched (snapshots) |

**Overall:** met.

## Task 4 — Other targets and the registry

Witnessed: 2026-11-22 16:21 EST, by a fresh agent (blind). Commit: d82b75b8 + the uncommitted working tree (15 modified files, 1 untracked: `packages/core/src/render/covered.ts`). Machine: macOS 27.2.1, Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `claudeCodeCovers`/`covered` moved into a shared `render/covered.ts`, and Cursor uses it | no | confirmed | `covered.ts` exports `alsoTarget` and `covered`; cursor/renderer.ts:44–47 uses them with `RENDERER_NAME = "Cursor"`, so the message is the same |
| 2 | Cursor's goldens are unchanged | no | confirmed | `git diff --exit-code d82b75b8 -- packages/core/src/render/cursor/__golden__` → 0; its registry assertion is now `toContain("cursor")` |
| 3 | Copilot leaves MCP servers and hooks to Claude Code when both are targets, in a project | no | confirmed | copilot/renderer.ts:356–366; mutations of each check → 1 test fails; exact message tested |
| 4 | Copilot leaves `always` and `glob` rules to Codex, and still writes `model` and `manual` rules | no | confirmed | renderer.ts:367–373; mutations "glob only", "always only", "any activation" → each fails 1 test |
| 5 | Both rows hold in a project only; in user scope Copilot writes its own copy | no | confirmed | renderer.ts:355; removing it → 1 test fails |
| 6 | An item not offered to the other tool isn't left to it | no | confirmed | `alsoTarget` checks `enabled`; test with `claude-code.enabled: false` → 1 change |
| 7 | Skills, commands, agents, rules and LSP servers are still written with Claude Code as a target | no | confirmed | test loop; probe wrote `.github/skills/secure` with both targets |
| 8 | `copilotRenderer` is in `RENDERERS` and exported from `index.ts` | no | confirmed | registry.ts:16, index.ts:5; `vitest run src/render` → 87 passed; support.test.ts levels match the spec |
| 9 | `rmk platforms` lists Copilot | no | confirmed | probe → `copilot  GitHub Copilot  (renderer 1.0.0)` with its native, degraded and none types |
| 10 | `rmk install` without `--target` picks Copilot from `.github/copilot-instructions.md`, not from a bare `.github/` | no | confirmed | probe → "for copilot."; `.github/workflows/` only → exit 2, "No AI tool detected" |
| 11 | `install.test.ts` covers `--target claude-code,copilot` | no | confirmed | install.test.ts:388–424; 19 passed |
| 12 | The folder-trust note appears after a project install with Copilot that wrote `.mcp.json`, also through `rmk mcp-setup` | no | confirmed | install.ts:513–516; probe printed it; mutation → 1 test fails; mcp-setup.ts:145–150, 7 passed; the `scope === "project"` check has no test (no user-scope path is `.mcp.json`) |
| 13 | The web test changes follow only from a fourth tool being registered | no | confirmed | `git diff apps/web`: support maps, tool lists, "of 4 tools", 3 "skipped", `copilot` → `no-such-tool` in the unknown-tool checks; 4 files, 75 passed |
| 14 | Spec Decision 5 is what the code does | no | confirmed | SPEC.md:331, as row 3 |

**Overall:** met.

## Task 5 — Export

Witnessed: 2026-11-22 16:34 EST, by a fresh agent (blind). Commit: d4efaa65 + uncommitted working tree (8 modified, 4 untracked files under `packages/core/src/read/copilot/`). Machine: macOS 27.2.1 (Darwin 27.2.0), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's own tests pass (core readers, CLI export and proposal, MCP) | no | confirmed | `vitest run src/read` → 79 passed; export and proposal → 69 passed; mcp → 53 passed |
| 2 | `read/copilot/` reads agents, rules and MCP servers, exported from `read/index.ts` | no | confirmed | `read/index.ts` exports; `agent.ts`, `rule.ts`, `mcp-server.ts` |
| 3 | Reading back each Copilot golden output (both scopes) gives the example item, or the warnings §11 names | no | confirmed | probe over every example × scope: code-reviewer, house-style, github-mcp re-render identical; skills give the same files; review-diff back as a skill |
| 4 | Tests cover the round trip | no | confirmed | mutations (`search: ["grep"]`, no `local`→`stdio`) → 1 failed each |
| 5 | §11 agent and rule tables match the code | no | confirmed | agent.ts:19–27; `copilotAgentName`; rule.ts; probe for `excludeAgent`, `target` |
| 6 | §11 MCP table matches the code | no | partly | `${K:-fallbackvalue}` → `${K}` with a warning (§8), not kept; `$API_KEY` in args kept literal, no `env`, no warning; §11 said both are the manifest's syntax |
| 7 | No secret value survives the Copilot MCP reader | no | confirmed | `ghp_…` token in args and URL replaced by references; `env` values never read; `JSON.stringify(plan).includes(tok)` → false |
| 8 | Copilot sources are listed under the right tool and scope | no | not met | agents, rules, MCP right; skills not: `~/.github/skills/` listed in user scope and `<project>/.copilot/skills/` in the project (`SKILL_FOLDERS` scanned in both scopes) |
| 9 | `copilot` is in `SourceTool`, `EXPORT_TOOLS`, the tables, `sourceOfFile`, the dispatch; `--from copilot` takes `.agents/skills/` | no | confirmed | `export.ts` diff; `fromTool`; 4 CLI tests; mutation → 2 failed |
| 10 | A file given by path is Copilot's by `.agent.md` / `.instructions.md` | no | confirmed | export.ts:853–859; CLI test |
| 11 | A change proposal for an item installed for Copilot reaches the Copilot readers | no | partly | agent and rule → place `copilot`, edits read right; a server installed for Copilot alone lands in `.mcp.json`, is discovered as `claude-code`, and unedited shows `mcp-server.args → []` and a `tools` warning |
| 12 | The MCP server's export tools take `copilot` | no | confirmed | packages/mcp/src/server.ts:213, 215, 255 |
| 13 | `native-readers.md` has §11 Copilot and §12 "Not read", no stale pointer | no | confirmed | `git grep` for `§11`, `§12`, `#11-`, `not-read` |
| 14 | Language servers are not read for any tool | no | confirmed | no `lsp-server` in export.ts or `ExportType` |

**Overall:** not met (rows 6, 8, 11).

Fixes after the pass:
- Row 8: Copilot's skill folders belong to one scope each (`SKILL_FOLDER_SCOPE`: `.github/skills` project, `.copilot/skills` user), with a test; undoing the fix fails it. §11 says "project only" / "home only".
- Row 11: `findMcpServers` attributes a project `.mcp.json` key to Copilot when the state file says `rmk` wrote it for Copilot and not Claude Code, so a proposal renders the base with Copilot's renderer. A test installs a server for Copilot only: unedited → `unchanged: true`; an `args` edit → only `mcp-server.args`. Undoing the fix fails it. §11 and SPEC "Export (reader)" say so.
- Row 6: §11's MCP row now says what §8's rules do: `${VAR}` stays, a default is dropped with a warning, a bare `$VAR` is kept as written and declares no variable.
- The stale `fromTool` comment names Copilot too.

### Re-check 1

Witnessed: 2026-11-22 16:38 EST, by a fresh agent (blind). Commit: d4efaa65 + uncommitted working tree (10 modified files, plus untracked `packages/core/src/read/copilot/`). Machine: macOS 27.2.1 (Darwin 27.2.0), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's own CLI tests pass | no | confirmed | scratch copy `cmp`-identical; `vitest run src/export.test.ts src/export-proposal.test.ts` → 71 passed |
| 6 | §11's MCP row matches what the code does with `${VAR}`, `${VAR:-default}` and `$VAR` | yes | confirmed | probe-vars: default dropped with the warning; `$API_KEY` and `/$PATHVAR/` kept as written, no `env`, no warning; native-readers.md §11 line 326 says so |
| 8 | Copilot skill folders are listed only in their own scope | yes | confirmed | stray-skills probe: only `.copilot/skills` in user scope, `.github/skills` in the project; mutation (scope check removed) → 1 failed; §11 line 284 |
| 11 | A proposal for a server installed for Copilot alone in `.mcp.json` is Copilot's and `unchanged` when unedited; shared or claude-code-only servers stay Claude Code's | yes | confirmed | proposal probe: Copilot only → place `copilot`, `unchanged`; edited `args` → only `mcp-server.args`; `[claude-code, copilot]` and `[claude-code]` → `claude-code`, `unchanged`; mutation → 1 failed; §11 and SPEC.md:222 |
| 15 | The `fromTool` comment names Copilot | yes | confirmed | export.ts:117–120 |

**Overall:** met.

After Re-check 1, the pre-commit hook's `pnpm test` stopped the commit: `packages/repo-tools/src/item-names.test.js` ("item names are never split by hand outside names.ts") flagged `read/copilot/agent.ts:59 .indexOf("/")`, which splits a Copilot tool alias (`<server>/<tool>`), not an item name. The alias is now split with `split("/")` and a rest join, with a comment saying what it is; same behaviour (the reader's 6 tests and the repo-tools test pass). No claim above changes.
