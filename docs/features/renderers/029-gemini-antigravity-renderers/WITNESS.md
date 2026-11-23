# 029 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../../knowledge/state-witness.md).

## Task 1 — Re-spec

Witnessed: 2026-11-22 20:17 EST, by a fresh agent (blind). Commit: 9bb6335f + working-tree diff (MVP.md, README.md, 198 SPEC, M05b file, 029 SPEC and PLAN). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | SPEC.md was re-checked against the Antigravity and Gemini CLI documentation on 2026-11-22 | no | can't check here | vendor docs can't be fetched here; SPEC "Two products" names the pages and versions (CLI v1.5.12, Gemini CLI v0.70.0, both 2026-11-19) |
| 2 | SPEC.md was re-checked against 028, 043, 046 and 076–078 as built | no | confirmed | `render/covered.ts` `alsoTarget`/`covered`; `usage-hooks.ts:22` `HOOK_TOOLS`; `feeds/models/feed.ts:24` `SERVED_TOOLS`; `plugins/types.ts` `PLUGIN_TOOLS`; `plugins/names.ts:41` `pluginNameProblem`; `plugin-feeds.md:198-203` mirror layout; `ronne.schema.json:68-80,111,182-191,560` |
| 3 | SPEC.md was re-checked against 097 | no | partly | `grep -n "097\|skills:\|context: fork"` on the SPEC → no match; nothing on a skill's `agent:` or an agent's skill dependencies (`agents-skills.ts:26-55`) |
| 4 | The owner's decisions are recorded | no | confirmed | SPEC "Decisions" 1–7; matching notes in Behaviour, Edge cases and Plugins; MVP.md:959 |
| 5 | SPEC's tables, behaviour text and acceptance criteria agree with each other | no | partly | `model` rules: Codex writes them as `.agents/skills/<n>/` (`codex/renderer.ts:90-92`), Antigravity reads that and writes `model_decision` too, so twice; criterion 3 has no scope qualifier against the user-scope paragraph |
| 6 | MVP §3.3 Gemini CLI and Antigravity CLI columns agree with SPEC | no | confirmed | `git diff docs/MVP/MVP.md`: skill, agent, rule, hook, mcp-server, permission-policy, statusline cells match |
| 7 | MVP §3.3 re-check note is updated | no | confirmed | MVP.md:233 |
| 8 | MVP §3.3 native plugin feeds list is updated | no | confirmed | MVP.md:262 |
| 9 | MVP §15 has a row for their files (029) | no | confirmed | MVP.md:959 |
| 10 | MVP §15 "Native plugin feeds" row is updated | no | confirmed | MVP.md:1016 |
| 11 | MVP's other Gemini and Antigravity lines agree | no | confirmed | `grep -n -i "gemini\|antigravity" docs/MVP/MVP.md`: 113, 145, 212, 218, 228, 797, 867, 957 |
| 12 | 198's tool table has Antigravity and Gemini CLI rows | no | confirmed | 198 SPEC:34-35 |
| 13 | Index row: 029 is `in progress` | no | confirmed | `docs/features/README.md:160` |
| 14 | M5b row: 029 is `in progress` with the new dependencies | no | confirmed | `M05b-tier-2-platforms.md:12` = SPEC line 3 |
| 15 | No text still claims 029 is on hold or built | no | confirmed | `grep -i "on hold"` → only the past range |
| 16 | References to 029 from other features still resolve | no | partly | `030-devin-renderer/SPEC.md:150` "029's open question 3", now a decision |
| 17 | PLAN tasks 2–11 name files that exist or are clearly new | no | confirmed | `test -e` on each existing path; new: `render/{antigravity,gemini}/`, `read/{antigravity,gemini}/`, `plugins/{antigravity,gemini}.ts` |
| 18 | `pnpm witness:check` passes | no | confirmed | exit 0 |
| 19 | `pnpm docs:check` passes | no | confirmed | exit 0 |

**Overall:** not met (rows 3, 5, 16).

Fixes after the pass:
- Row 5: the "also a target" table gets a `model` rules row (in a project, left to the shared skill with Codex or Gemini CLI), and a note that `manual` rules are the same skill for all three; the user-scope paragraph says Antigravity doesn't read `~/.agents/skills/`; acceptance criterion 3 names both scopes.
- Row 3: SPEC says a skill's `agent:`/`context:` are left out with the shared warning, which will name Antigravity and Gemini CLI too, and that both tools' agents warn on skill dependencies, as Copilot's do.
- Row 16: 030 SPEC:150 says "029's decision 3".
- Also (minor): `docs/spec/manifest.md:193` lists `antigravity` among the renderer ids.

### Re-check 1

Witnessed: 2026-11-22 20:21 EST, by a fresh agent (blind). Commit: 9bb6335f + working-tree diff (MVP.md, README.md, 198 SPEC, M05b file, 029 SPEC and PLAN, 030 SPEC, manifest.md). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | SPEC.md was re-checked against 097 | no | confirmed | SPEC:121-123, :130-131, :175-176; `agents-skills.ts:24-55`; `copilot/renderer.ts:82-87` |
| 5 | SPEC's tables, behaviour text and acceptance criteria agree with each other | no | partly | SPEC:103-104 `manual` note has no scope; in the home folder Antigravity's skills go to `~/.gemini/config/skills/` (SPEC:77, :119-120) |
| 16 | References to 029 from other features still resolve | no | confirmed | `030-devin-renderer/SPEC.md:150` "029's decision 3" = 029 SPEC:356 |
| 20 | The "also a target" table has a `model` rules row and a note on `manual` rules | no | partly | model row SPEC:100 matches `codex/renderer.ts:90-94`; the manual note lacks its scope (row 5) |
| 21 | The user-scope paragraph says Antigravity doesn't read `~/.agents/skills/` | no | confirmed | SPEC:106-108, consistent with SPEC:77; vendor fact can't be checked here |
| 22 | Acceptance criterion 3 names both scopes | no | confirmed | SPEC:338 matches SPEC:97-100, :106-108 |
| 23 | The `agent:`/`context:` warning will name Antigravity and Gemini CLI too | no | confirmed | SPEC:121-123; `agents-skills.ts:24,52` take `place.readers` |
| 24 | Both tools' agents warn on skill dependencies, as Copilot's do | no | confirmed | SPEC:130-131, :175-176; `copilot/renderer.ts:82-87` |
| 25 | `docs/spec/manifest.md` lists `antigravity` among the renderer ids | no | confirmed | `manifest.md:193` |
| 26 | After the fixes, SPEC agrees with MVP §3.3 and §15 | no | partly | MVP.md:237, :239 agree; MVP.md:959 leaves `always`/`glob` unscoped, where SPEC:106-108 says only Gemini CLI covers them in the home folder |
| 27 | `pnpm witness:check` passes | no | confirmed | exit 0 |
| 28 | `pnpm docs:check` passes | no | confirmed | exit 0 |

**Overall:** not met (rows 5, 20, 26: a missing scope each).

Fixes after the re-check:
- Rows 5 and 20: the `manual` note says "in a project", and that in the home folder they are two copies (`~/.gemini/config/skills/` and `~/.agents/skills/`).
- Row 26: MVP.md:959 scopes it: in a project with Codex or Gemini CLI, `always`, `glob` and `model` rules; in the home folder, `always` and `glob` rules to Gemini CLI's `~/.gemini/GEMINI.md`.
- Row 23 (wording, to match the code being written for task 2): the shared warning names the tool that drops the keys (`SkillPlace.readers`), Antigravity or Gemini CLI.

### Re-check 2

Witnessed: 2026-11-22 20:22 EST, by a fresh agent (blind). Commit: 9bb6335f + working-tree diff (MVP.md, README.md, 198 SPEC, M05b file, 029 SPEC and PLAN, 030 SPEC, manifest.md; the untracked `packages/core/src/render/antigravity/` belongs to task 2 and was not checked). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | SPEC's tables, behaviour text and acceptance criteria agree with each other | no | confirmed | SPEC:103-106 scopes the `manual` note (one shared copy in a project, two in the home folder), matching SPEC:77, :79, :108-110 and criterion 3 at :340 |
| 20 | The "also a target" table has a `model` rules row and a note on `manual` rules | no | confirmed | SPEC:100; SPEC:103-106 |
| 23 | The `agent:`/`context:` warning names the tool that drops the keys | no | confirmed | SPEC:124-125; `agents-skills.ts:21,52` put `${place.readers}` in the message |
| 26 | After the fixes, SPEC agrees with MVP §3.3 and §15 | no | confirmed | MVP.md:959 matches criterion 3 (SPEC:340) and SPEC:99-110; MVP.md:237, :239 agree with SPEC:77, :79 |
| 27 | `pnpm witness:check` passes | no | confirmed | exit 0 |
| 28 | `pnpm docs:check` passes | no | confirmed | exit 0 |

**Overall:** met.

Left for task 2 (not blocking): the shared warning reads "Antigravity don't choose" with one tool name, and MVP.md:252's list of `.agents/skills/` readers leaves out Antigravity.

## Task 2 — Antigravity's file types

Witnessed: 2026-11-22 21:04 EST, by a fresh agent (blind). Commit: d00a0888 + working-tree diff (untracked `packages/core/src/render/antigravity/`, edits to `agents-skills.ts`, `MVP.md`, 029 `SPEC.md` and `PLAN.md`). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `antigravity/{renderer.ts,mappings.ts,renderer.test.ts}` exist and render `skill`, `command`, `agent` and `rule` | no | confirmed | `renderer.ts` switch; hook, mcp-server, permission-policy and statusline warn "isn't rendered for Antigravity yet" (task 3), as the goldens show |
| 2 | `detect()` is true for `.agents/rules`, `.agents/agents`, `.agents/hooks.json` or `.agents/mcp_config.json`, not for `.agents/` or `.agents/skills/` alone | no | confirmed | detect list; test passes; mutation (adding `.agents`) → test fails |
| 3 | Skills and commands: in a project byte for byte the shared `.agents/skills/<n>/`; in user scope `~/.gemini/config/skills/<n>/` | no | confirmed | test against `codexRenderer`; goldens `secure-coding/user/files/.gemini/config/skills/…`; mutation → 3 tests fail; real CLI listed `secure-coding` among its skills |
| 4 | A skill's `agent:` and `context:` are dropped, and the shared warning names Antigravity | no | confirmed | probe2, both scopes → "…; Antigravity can't choose an agent for a skill, so it runs in the current one." No unit test covers it |
| 5 | Agent at `.agents/agents/<n>.md` (user `.gemini/config/agents/`) with `name`, `description`, mapped `tools`, MCP tools as `unmapped_tool`, the prompt as body | yes | confirmed | `mappings.ts` = SPEC table; golden `code-reviewer.md`; real CLI `agy agents` lists `code-reviewer` |
| 6 | Model hint `fast`→`flash`, `strong`→`pro`, `default`→`inherit`, or the override; other overrides warn | no | confirmed | MODELS; golden `model: pro`; override test; mutation → 1 test fails |
| 7 | A manifest without `tools` leaves the key out (platform default); on CLI 1.5.14 that's a default set | yes | confirmed | `renderer.ts:79`; mutation → test fails; `manifest.md:54`; real CLI log of `probe-none` calling `read_file`, `send_message`. Remark: a list where nothing maps also drops the key |
| 8 | Skill dependencies warn that they aren't preloaded | no | confirmed | golden `code-reviewer/*/warnings.json` |
| 9 | Rules: `always_on`, `glob` with one quoted comma-separated `globs`, `model_decision` with `description`, at `.agents/rules/` (user `.gemini/config/rules/`) | no | confirmed | golden `house-style.md`; triggers pinned by test; mutation → test fails |
| 10 | A `manual` rule is the same skill as Codex's (user: `.gemini/config/skills/`); a body over 24,000 bytes warns | no | confirmed | tests pass |
| 11 | Goldens for the example items exist in both scopes | no | confirmed | `find antigravity/__golden__ -type f`: all 11 items, `project/` and `user/` |
| 12 | The other renderers' goldens are unchanged, after the `agents-skills.ts` wording change and MVP.md:252 | no | confirmed | `git status --short --untracked-files=all packages/core/src/render/*/__golden__` → only antigravity; 46 files, 494 tests passed |
| 13 | Typecheck and lint pass | no | confirmed | typecheck exit 0; `pnpm lint` exit 0 |
| 14 | The Antigravity CLI is installed with a scratch home, and the missing-`tools` meaning is settled in SPEC.md | yes | confirmed | `agy --version` → 1.5.14; SPEC diff |
| 15 | (Notes) CLI tool names; payload has `hookEventName` and `cwd`; `*` and `""` match every tool | yes | confirmed | `agy-log/*.json`; aliases and dropped names rest on the implementer's logs |

**Overall:** met.

After the pass (wording only, from the witness's remarks): `renderer.ts:78`'s comment says no `tools` means Antigravity's default set, not the parent's tools; 097 SPEC:96 quotes the warning as "can't choose"; 029 SPEC says a list where nothing maps is written as no list.

## Task 3 — Antigravity's settings types

Witnessed: 2026-11-22 21:41 EST, by a fresh agent (blind). Commit: 476d0646 + working-tree diff. Machine: macOS (Darwin 27.2), Node v24.0.0 (not the `.nvmrc` 26).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A hook is one `json-key` per item, `<n>` in `.agents/hooks.json`, or `~/.gemini/config/hooks.json` at home | no | confirmed | `renderer.ts:252-256`; goldens `format-on-edit/{project,user}/changes.json` |
| 2 | Events: `session.start`→`SessionStart`, `tool.before`→`PreToolUse`, `tool.after`→`PostToolUse`, `agent.stop`→`Stop`; the other six warn and write nothing | no | confirmed | `mappings.ts` EVENTS; test covers all ten |
| 3 | `SessionStart`/`Stop` take bare handlers, tool events `{matcher, hooks:[…]}`, and the real CLI 1.5.14 refuses the wrapped form | yes | confirmed | own scratch project: bare start/stop and matcher hooks fired; wrapped SessionStart → "invalid hook "w-start": command hook must specify 'command'", no hook in the file fired; mutation → 2 tests fail |
| 4 | A matcher names the CLI's and the app's names as an anchored regex, for all 8 tools; an MCP filter, an unknown tool or a filter on a non-tool event warns | yes | confirmed | test covers all 8 and `mcp:…`, `constructor`, Stop; real CLI: `^(?:read_file\|view_file)$` fired only on the read, `^(?:run_command)$` only on the shell call |
| 5 | A `run.script` goes to `hooks/<n>/` next to `hooks.json` and runs as `./hooks/<n>/<script>` in both scopes | yes | confirmed | real CLI: project hooks ran with `cwd=…/proj/.agents`, user `./hooks/ucwd/run.sh` wrote `…/agy-home/.gemini/config`; test covers both scopes; a name with a space and `'` is quoted |
| 6 | `$RMK_` variables in a command warn | no | confirmed | `renderer.ts:228-233`; golden warnings |
| 7 | mcp-server: stdio `command`+`args`, http `serverUrl`+headers without a variable; the real CLI accepts it | yes | confirmed | goldens; own stdio probe answered and logged `W_TOKEN=inherited-ok`; agy log "OAuth setup failed for github-mcp" (parsed and contacted) |
| 8 | No secret is written: `env` and headers that name a variable are left out with a warning naming each, and a test shows it | no | confirmed | test with `not.toContain("API_TOKEN")`; mutations → 2 tests fail each |
| 9 | permission-policy home-only, `permissions.<decision>` items in `~/.gemini/antigravity-cli/settings.json` by the action table; grep, glob, web-search warn | yes | confirmed | test covers every row; golden `safe-git/user/keys`; mutations → 2 tests fail each |
| 10 | statusline home-only: script under `~/.gemini/antigravity-cli/statusline/<n>/` and `statusLine {type:"command", command:"\"$HOME\"/…"}` | no | confirmed | golden `git-branch/user`; project warns `--scope user`; mutation → 2 tests fail |
| 11 | The status line works on the real CLI | no | can't check here | only shows in the interactive UI |
| 12 | `output-style` and `lsp-server` are `none`, with a warning | no | confirmed | `supports()`; goldens `concise`, `typescript-lsp` |
| 13 | Unit tests cover every row of Antigravity's mapping table | no | partly | nothing tests `supports()`: making `output-style` "native" → 500/500 still pass |
| 14 | Goldens exist for the settings examples in both scopes; other renderers' goldens unchanged | no | confirmed | `git status --short --untracked-files=all packages/core/src/render/*/__golden__` → only `antigravity/` |
| 15 | Core tests, typecheck and lint pass | no | confirmed | 46 files, 500 passed; `tsc --noEmit` clean; `pnpm lint` exit 0 |

**Overall:** not met (rows 11, 13).

Bugs the pass found, beyond the rows: an MCP `url` or `args` naming `${VAR}` is written as is with no warning; a shell rule of `*` is dropped instead of `command(*)`; a header `a$b` is dropped as a variable; and a hook's `run.command` runs from `.agents/`, not the project root, so the `format-on-edit` golden would format `.agents/`.

Fixes after the pass:
- Row 13: a test pins `supports()` for every type.
- The working folder: in a project, a command is written as `cd .. && <command>` and a script runs as `cd .. && ./.agents/hooks/<n>/<script>`, so both run from the project root (checked on the CLI 1.5.14: both `pwd`s were the project root); in the home folder, as before. SPEC and the `format-on-edit` golden say so.
- A `${NAME}` in an MCP URL or arguments is written with a warning that the server gets it unexpanded; only `${NAME}` (the manifest's syntax) counts as a variable, so `a$b` is kept; `*` alone is `command(*)`. Each has a test.
- Row 11: the owner is checking the status line in a terminal (pending).

### Adversarial pass

Witnessed: 2026-11-22 21:43 EST, by a fresh agent (adversarial). Commit: 476d0646 + working-tree diff (packages/core/src/render/antigravity/*, its __golden__, 029 SPEC/PLAN/WITNESS). Machine: macOS (Darwin 27.2), Node v24.0.0; real Antigravity CLI 1.5.14 with the scratch home.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A hook is one `json-key` per item, `<n>` in `.agents/hooks.json` / `~/.gemini/config/hooks.json` | no | confirmed | probe `adv.probe.test.ts`; goldens |
| 2 | Four events mapped, the other six warn; prototype event names write nothing | no | confirmed | probe: `__proto__`, `constructor` → no change, a warning; replacing `own()` with an index keeps 19/19 green (untested guard; the schema refuses them) |
| 3 | The CLI accepts every shape written and doesn't drop the file | yes | confirmed | real CLI `tproj`: bare SessionStart `timeout:600`, bare Stop `timeout:1` with a Unicode command, PreToolUse with no matcher all ran |
| 4 | Matchers: anchored regex; MCP, unknown or `__proto__` tool → no matcher plus a warning; non-tool event filter warns | yes | confirmed | probe; real CLI `^(?:run_command)$` fired on `ls` |
| 5 | A project command runs from the project root (`cd .. && <command>`) | yes | partly | `;`, `\|\|`, `\|` and multi-line keep the cd; `cd .. && true & pwd` wrote `…/proj/.agents` |
| 6 | The `cd ..` holds in nested layouts | no | confirmed | started from `proj/sub/deeper` → `proj/.agents/hooks.json`, `cd ..` → `proj`; with `proj/sub/.agents` too, each reached its own root |
| 7 | A script runs as `cd .. && ./.agents/hooks/<n>/<script>` / `./hooks/<n>/<script>`, and an odd name can't inject | yes | confirmed | real CLI pwd `…/proj`; `a b/$(touch x)';.sh` quoted; `-x.sh` prefixed `./` |
| 8 | No secret value reaches a written file | no | confirmed | RenderInput carries no env values (`render/types.ts:19-51`); `${…}` only as a reference; `grep -rl GITHUB_TOKEN __golden__` → only `warnings.json` |
| 9 | A test shows no secret is written | no | confirmed | `renderer.test.ts:239`; mutation → 2 tests fail |
| 10 | Header names `__proto__` and `constructor` are safe | no | confirmed | own keys inside the value; `apply.ts:207-218` |
| 11 | A permission `decision` outside allow/ask/deny can't be written | no | confirmed | schema enum; `apply.ts` would throw `unsafe_key` |
| 12 | Odd permission patterns don't break the CLI's settings | no | confirmed | real CLI: malformed rules beside `command(echo)` → `echo hi` still denied |
| 13 | Permission rules by the action table, home folder only | yes | confirmed | probe; mutation → 3 tests fail |
| 14 | An `allow` rule's prefix doesn't widen to compound commands | no | can't check here | headless `-p` ran `echo hi; touch control.txt` with no rules at all |
| 15 | statusline home only, odd names quoted | no | confirmed | `dir/a b'$(x).sh` → quoted |
| 16 | The status line works on the real CLI | no | can't check here | interactive UI only |
| 17 | `output-style` and `lsp-server` are `none`, and a test pins `supports()` | no | confirmed | mutation → test fails |
| 18 | Goldens for both scopes; the other renderers' goldens unchanged | no | confirmed | `git status --short --untracked-files=all packages/core/src/render` |
| 19 | Core tests and typecheck pass | no | confirmed | 46 files, 504 passed; typecheck exit 0 |

**Overall:** not met (row 5; rows 14 and 16 need an interactive session).

Fixes after the pass:
- Row 5: a project command (and a script) now runs after a line of its own, `cd .. || exit 1`, so `&` and a leading `#` comment can't take it apart (on the CLI 1.5.14 `true & pwd`, a commented command and a plain one all ran at the root); a test pins it, and SPEC says so.
- Row 2: a test pins `own()` for `constructor`, `__proto__` and `toString` events.
- Row 16: the owner ran the status line in a terminal (PLAN Notes): `agy` 1.5.14 ran the quoted `"$HOME"/'…/my status.sh'` and showed `STATUS-OK`.
- Row 14: Antigravity's own matching, which rmk doesn't decide: SPEC says a prefix `allow` covering a compound command isn't documented, and the Antigravity page will say so.

### Re-check 1

Witnessed: 2026-11-22 21:57 EST, by a fresh agent (adversarial). Commit: 476d0646 + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0; real Antigravity CLI 1.5.14 with the scratch home.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Adversarial row 5: a project hook's command runs from the project root, whatever it holds | yes | confirmed | `renderer.ts:197`; 12 SessionStart hooks with the prefix: `true & pwd`, a leading comment, a trailing `\`, `<<EOF` and `<<'EOF'` heredocs, `pwd; exit 3`, `(sleep 1; pwd) &` and the control all wrote the project root; `exit 0` then `pwd` and a comment-only command wrote nothing |
| 2 | None of these hooks makes Antigravity drop `hooks.json` | no | confirmed | agy log "loaded 14 named hooks from 2 hooks.json file(s)"; only `exit 3` and the background job logged as failed (their own results); the schema refuses an empty command |
| 3 | A tool-event hook with the prefix still gets the event on stdin | no | confirmed | `proj2`: `stdin.json` holds the event JSON, `pwd` the project root |
| 4 | A test pins the own-line prefix | yes | confirmed | `atRoot` as `cd .. && …` → 6 tests fail |
| 5 | Row 2's `own()` guard is tested | yes | confirmed | `renderer.test.ts:423`; index lookup → 1 test fails |
| 6 | Blind row 13: unit tests cover every row, `supports()` included | yes | confirmed | `renderer.test.ts:355-380`; dropping a case → test fails |
| 7 | Blind row 11 / adversarial row 16: the status line works on the real CLI | yes | confirmed | own pty run via `expect`, statusLine through `--settings` with a path needing quotes (`r1 w/it'\''s.sh`) → screen showed `R1-STATUS-OK`, the script saved the session JSON; backs the owner's run |
| 8 | Adversarial row 14: a prefix `allow` rule doesn't widen to a compound command | yes | can't check here | `allow: ["command(echo)"]`: `echo hi; touch compound.txt` ran unasked, but so did a command with no rules at all (`proj5`), so this home auto-runs commands; Antigravity's matching, not rmk's output |
| 9 | SPEC discloses row 14 instead of claiming it | yes | confirmed | `SPEC.md:177-178` |
| 10 | SPEC's hook bullet matches the code and the `format-on-edit` golden | yes | confirmed | `SPEC.md:156-161`; golden command `"cd .. \|\| exit 1\nnpx --no-install biome format --write $RMK_FILE_PATHS"`; at home as is (`renderer.ts:241,248`) |
| 11 | Core tests, typecheck and lint pass | no | confirmed | 46 files, 505 passed; `tsc --noEmit` exit 0; `pnpm lint` exit 0 |

**Overall:** not met (row 8 only).

Owner's decision on row 8 (2026-11-22): re-scope the claim. rmk writes the prefix rule (confirmed, adversarial row 13) and discloses the open question (row 9); whether Antigravity's prefix `allow` covers a compound command is Antigravity's matching, which rmk doesn't decide, and the Antigravity page says so. With that scope, every claim of task 3 is confirmed, and the task is ticked.

Also after this re-check (its risk note, not tested): the `cd .. || exit 1` line is POSIX shell, and Antigravity runs commands through `cmd /c` on Windows (status line docs), so SPEC now says a project hook wouldn't run there, like every hook command rmk writes.

## Task 4 — Gemini CLI's file types

Witnessed: 2026-11-22 22:03 EST, by a fresh agent (blind). Commit: ed4a66fd + working-tree diff (untracked `packages/core/src/render/gemini/`, 029 SPEC.md and PLAN.md). Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Gemini CLI 0.70.0 is installed with a scratch home and was used to check the output | no | confirmed | imported `core-HYVGBZPP.js` and `chunk-FHK4RNCX.js` with a scratch `HOME`; `CLI_VERSION = "0.70.0"` |
| 2 | A skill goes to `.agents/skills/<n>/` (`~/.agents/skills/<n>/`), byte for byte what Codex writes, and Gemini CLI reads it | no | confirmed | `renderer.ts:39,239`; test against `codexRenderer`; CLI `getUserAgentSkillsDir`/`getProjectAgentSkillsDir`; its `loadSkillsFromDir` loaded `secure-coding` |
| 3 | A command goes to `.gemini/commands/<n>.toml` in both scopes, `#` marker, `description`, multi-line `prompt`, one argument as `{{args}}` | yes | confirmed | goldens; `FileCommandLoader` → `user-file` and `workspace-file` `review-diff`; run with `src/x.ts` substituted; mutation → 2 tests fail |
| 4 | Several arguments keep their placeholders with a note and a warning; `!{`/`@{` warns; a `'''` prompt becomes a basic string; CRLF and Unicode survive | no | confirmed | all loaded and ran in `FileCommandLoader`; mutation → 1 test fails |
| 5 | An agent goes to `.gemini/agents/<n>.md` in both scopes, with only keys the strict schema accepts | yes | confirmed | `localAgentSchema` `.strict()`; all 10 rendered agents loaded with no errors |
| 6 | Agent `model` only from the override; a hint warns, other overrides `invalid_override`, skill dependencies warn | no | confirmed | `renderer.ts:73-95`; `cr-override` loaded with `gemini-3-pro` |
| 7 | Tool names match the Mappings table and the CLI's own; an MCP name the CLI can't parse warns | yes | confirmed | bundle `*_TOOL_NAME` = `mappings.ts:6-15`; agents with all 8 tools and odd MCP names loaded |
| 8 | The tests pin the tool names | no | partly | mutation `edit: "replace"`→`"edit"` → 11/11 still pass: the test compared `toolOf` with `TOOLS` itself |
| 9 | `always` and `glob` rules are `GEMINI.md` sections (`~/.gemini/GEMINI.md`), `glob` with its files' line, as Codex's | no | confirmed | `renderer.ts:188-202` = `codex/renderer.ts:110-124`; goldens; mutations → 2 tests fail each |
| 10 | `model` and `manual` rules become the shared skills, the same as Codex's | no | confirmed | test against `codexRenderer`; CLI loaded both. Remark: 0.70.0 has no `disable-model-invocation`, so the model can still pick a `manual` rule's skill |
| 11 | `detect()` is true for `.gemini` or `GEMINI.md`, false for `.agents`, `.agents/rules`, `AGENTS.md` | no | confirmed | test; mutation → 1 test fails |
| 12 | Golden files for those example items are present in both scopes | no | confirmed | `git status --short --untracked-files=all packages/core/src/render/*/__golden__` |
| 13 | The other renderers' goldens are unchanged | no | confirmed | same, without `render/gemini/` → no lines |
| 14 | Core tests, typecheck and lint pass | no | confirmed | 47 files, 516 passed; typecheck exit 0; `pnpm lint` exit 0 |
| 15 | (note) The CLI refuses an agent with an unknown tool | yes | confirmed | `teleport` → "Failed to load agent"; an extra key (`color: red`) refused too |
| 16 | (note) The CLI skips a command whose `prompt` isn't a string | yes | confirmed | `prompt = 5` → not loaded |

**Overall:** not met (row 8).

Fixes after the pass:
- Row 8: the test writes the eight expected names out and checks `TOOLS` against them; `edit: "edit"` in `mappings.ts` now fails it (checked, then restored).
- Row 10's remark: SPEC says Gemini CLI 0.70.0 ignores `disable-model-invocation`, so the model can still pick a `manual` rule's skill, which the Gemini CLI page will say.

### Re-check 1

Witnessed: 2026-11-22 22:10 EST, by a fresh agent (blind, scoped to row 8 and the fixes). Commit: ed4a66fd + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 8 | The tests pin the tool names | yes | confirmed | `renderer.test.ts:121-133`; each of the eight values mutated in a scratch copy (`<name>` → `<name>_x`) → 1 to 3 of 11 tests fail each; restored → 11 of 11 pass |
| 10 (remark) | SPEC says Gemini CLI 0.70.0 ignores `disable-model-invocation`, so the model can still pick a `manual` rule's skill | yes | confirmed | SPEC.md:205-208; the website page can't be checked here |
| 14 | Core tests, typecheck and lint pass | no | confirmed | 47 files, 516 passed; typecheck exit 0; `pnpm lint` exit 0 |

**Overall:** met.

## Task 5 — Gemini CLI's settings types

Witnessed: 2026-11-22 22:14 EST, by a fresh agent (blind). Commit: 581e3279 + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Core tests, typecheck, lint pass | no | confirmed | 47 files, 521 passed; typecheck exit 0; `pnpm lint` exit 0 |
| 2 | Goldens for hook, mcp-server and permission-policy in both scopes; no other renderer's goldens changed | no | confirmed | `git status … \| grep -v render/gemini/` → empty |
| 3 | A hook is a `json-array-item` under `hooks.<Event>` in `.gemini/settings.json`, `{matcher, hooks:[{type, command, name, timeout}]}`, timeout in ms | yes | confirmed | golden `timeout: 30000`; real `loadSettings` loaded it under `AfterTool`; mutation (no ×1000) → 2 tests fail |
| 4 | Seven events map; `permission.request` and `subagent.*` warn | no | confirmed | `EVENTS` = bundle `HookEventName`; test covers all |
| 5 | Matchers anchored on the tool table's names; `mcp:<s>` → `mcp_<s>_.*`; a filter on another event warns | yes | confirmed | bundle `matchesToolName` unanchored; mutation (unanchored) → 2 tests fail |
| 6 | A `run.script` runs as `$GEMINI_PROJECT_DIR/…` unquoted in a project, `"$HOME"/…` at home | yes | confirmed | `my fmt.sh` through the bundle's `escapeShellArg` and bash in `proj with 'q space` → `RAN`; mutation (quoted) → test fails |
| 7 | mcp-server: stdio `command`, `args`, `env` with `${NAME}`; http `httpUrl`, `headers` | yes | confirmed | real `loadSettings` with `GITHUB_TOKEN=sekrit` → expanded in memory only |
| 8 | A test shows no secret value is written | no | partly | mutation `process.env[name] ?? envRef(...)` still passes when the variables aren't set in the test |
| 9 | permission-policy home only, `~/.gemini/policies/<n>.toml`; project warns; `supports` degraded | yes | confirmed | goldens; mutation → 2 tests fail |
| 10 | Policy rules: `[[rule]]` each, prefix/MCP/decision/priority, `#` marker | yes | confirmed | real `loadPoliciesFromToml` → `errors: []`; `PolicyEngine.check` deny over ask; mutation → 2 tests fail |
| 11 | statusline, output-style, lsp-server `none` and warn | no | confirmed | `supports`, `NO_PLACE`, goldens |
| 12 | Unit tests cover every row of the Gemini mapping table | no | confirmed | events, matchers, policy rows |
| 13 | An untrusted project's settings aren't loaded | yes | confirmed | `loadSettings` without trust → project hook and server gone |
| 14 | A `settings.json` rmk can't parse is refused with a message | no | confirmed | `cli/src/apply.ts:141-148` |
| 15 | The golden policy loads at user-tier priorities | yes | confirmed | tier 2 → 2.3/2.2/2.2, same order |

**Overall:** not met (row 8). Also flagged: a shell pattern with no `*` became `commandPrefix`, widening an `allow` if the pattern means that command exactly.

### Adversarial pass

Witnessed: 2026-11-22 22:24 EST, by a fresh agent (adversarial). Commit: 581e3279 + working-tree diff (as of 22:21, after the `commandRegex` change below). Machine: macOS (Darwin 27.2), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Goldens in place; golden test passes | no | confirmed | 18 gemini tests passed |
| 2 | Core tests and typecheck pass | no | confirmed | 521 passed; `tsc` clean |
| 3 | Seven events map, prototype keys don't slip through | no | confirmed | `constructor`, `__proto__`, `permission.request` → no change, a warning |
| 4 | Hook matchers anchored on the CLI's real names | no | confirmed | bundle constants; `formatMcpToolName`; `glob` doesn't match `glob_extra` |
| 5 | MCP rules and matchers match the name Gemini CLI calls | no | partly | `generateValidName` cuts names over 63 chars to `first30...last30`: a deny for a 78-char name → `ask_user` for the cut name, with no warning |
| 6 | Project script `$GEMINI_PROJECT_DIR/…` unquoted, user `"$HOME"/…` | no | partly | works for `proj with 'q" sp`; breaks for a script name with `$NAME` (settings load expands it inside single quotes) and when `GEMINI_PROJECT_DIR` is already set where Gemini starts |
| 7 | mcp-server shapes load | no | confirmed | `loadSettings` expanded the header in memory only |
| 8 | No secret value written, and a test shows it | no | confirmed | header `${X}` → `process.env[X]` mutation → "writes no value from the environment…" fails |
| 9 | No secret value reaches any written file for any manifest the schema allows | no | not met | hook `run.command: "echo $GITHUB_TOKEN …"`: settings load expands it, and `checkProjectHooksTrust()` wrote `echo ghp_SECRETVALUE123 …` to `~/.gemini/trusted_hooks.json`; `'$HOME'` expanded too |
| 10 | permission-policy home only | no | confirmed | project → warning |
| 11 | Every policy file rmk writes is valid TOML Gemini CLI loads | no | not met | pattern `"git\x7f push*"` written raw by `tomlString` → `toml_parse` "Control characters … 0x7f are not allowed", rules 0, other rules in the file lost; a lone surrogate the same |
| 12 | deny beats ask beats allow among rmk's rules | no | confirmed | `PolicyEngine.check`; rmk rules beat yolo.toml; mutation → 2 tests fail |
| 13 | rmk's rules don't override the person's own policies or plan mode | no | not met | rmk `allow` at 100 beat the person's denies at 50 and 10; in plan mode rmk `allow` beat plan.toml's deny-all (1.04) |
| 14 | Shell patterns: trailing `*` → `commandPrefix`, no `*` → exact `commandRegex`, `*` elsewhere warns | no | confirmed | `commandRegex = "git push\""` → `git push`, `git push; rm x`, `ls && git push` denied; `a*b` warns |
| 15 | statusline, output-style, lsp-server `none` | no | confirmed | tests, goldens |
| 16 | Unit tests cover every row of the mapping table | no | confirmed | |

**Overall:** not met (rows 9, 11, 13; rows 5, 6 partly). Also: `read` maps only to `read_file`, so a deny on `read` misses `read_many_files`; the `format-on-edit` golden's `$RMK_FILE_PATHS` is empty under Gemini CLI (warned).

Fixes after both passes:
- Blind row 8: a test stubs `GITHUB_TOKEN` and `API_TOKEN` (`vi.stubEnv`) and checks no value reaches any output.
- Blind's flag: a shell pattern with no `*` is an exact `commandRegex` (the escaped command and its closing quote); Gemini CLI's own `PolicyEngine` allowed `git status` and not `git statusx` or `git status; rm -rf x` (PLAN Notes). Antigravity has no exact rule (`command(regex:^echo hi$)` also denied `echo hi there`), so there a pattern with no `*` stays a prefix for `deny` and `ask` and is left out of `allow`, with a warning; tests pin both.
- Adversarial row 9: a hook command that names a variable warns that Gemini CLI fills it in when it loads settings and may save it in `~/.gemini/trusted_hooks.json`, and says to use a script; rmk can't stop the CLI's own expansion.
- Adversarial row 11: `tomlString` (shared with Codex) escapes DEL and turns a lone surrogate into U+FFFD, so what rmk writes is always valid TOML; a policy pattern with a control character or lone surrogate is left out with a warning. The trailing `*` is now trimmed without a regular expression (`docs/knowledge/codeql-regex.md`), in both renderers.
- Adversarial row 13: priorities are deny 3, ask 2, allow 1, so a person's own rule at 4 or more wins (Gemini CLI's engine: the person's `allow git push` at 10 beat rmk's `deny git push --force` at 3); `allow` and `ask` carry `modes = ["default","autoEdit","yolo"]`, so plan mode's own rules hold.
- Adversarial row 5: an MCP name over 63 characters, or a whole server whose `mcp_<s>_` runs past 30, can't be named (agent, matcher or policy), with a warning.
- Adversarial row 6: a script whose name has `$` is left out with a warning. `GEMINI_PROJECT_DIR` already set where Gemini CLI starts is the CLI's own expansion, not rmk's output; not changed.
- `read` is `read_file` and `read_many_files` in agents, matchers and policies.

### Re-check 1

Witnessed: 2026-11-22 22:37 EST, by a fresh agent (adversarial). Commit: 581e3279 + working-tree diff. Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Core tests and typecheck pass | no | confirmed | 527 passed; `tsc --noEmit` exit 0 |
| 2 | `pnpm lint` passes | no | not met | 2 errors at `gemini/renderer.ts:351`: `noControlCharactersInRegex` on `/[\u0000-\u001f\u007f]/` |
| 3 | Blind 8: a test shows no secret value is written | no | confirmed | mutation `process.env[name] ?? envRef(...)` → the stubbed-env test fails |
| 4 | Adv 5: MCP names Gemini CLI would cut warn | no | confirmed | `generateValidName` limits = `mappings.ts`; 64-char name and 31-char prefix left out with warnings; the test pins both boundaries |
| 5 | Adv 6: a `$` script left out; project/user script paths | no | partly | `run$HOME.sh` refused; a preset `GEMINI_PROJECT_DIR` is still expanded at settings load, and SPEC doesn't say so |
| 6 | Adv 9: a hook command naming a variable warns about `trusted_hooks.json` | no | partly | `${SLACK_TOKEN}` warns, but `fmt $RMK_FILE_PATHS; curl -H "$SLACK_TOKEN"` gets only the `$RMK_` warning (`if / else if`) |
| 7 | Adv 11: every policy file rmk writes is valid TOML Gemini CLI loads | no | confirmed | DEL and lone-surrogate patterns left out with warnings; the guard is linear |
| 8 | `tomlString` escapes every control char and DEL, maps lone surrogates to U+FFFD, keeps pairs | no | confirmed | U+0000–U+001F, DEL, pairs, lone high/low, U+0085/U+2028/U+2029 round-trip through smol-toml; `loadPoliciesFromToml` → `errors: []` |
| 9 | That escaping is covered by a test | no | not met | `tomlString = JSON.stringify(value)` → all 129 render tests still pass |
| 10 | Codex's goldens and tests unchanged | no | confirmed | only `codex/toml.ts` changed; Codex tests pass |
| 11 | Adv 13a: rmk allow/ask don't override plan mode | no | confirmed | `createPolicyEngineConfig({}, "plan", undefined)` with the bundle's `policies/` → `git push`, `git status`, `npm i`, `write_file`, `mcp_gh_list` deny (plan.toml 1.04/1.065); rmk denies still apply (4.003). Remark: rmk's `ask` on `read` doesn't apply in plan mode, and read-only.toml (1.05) lets `read_file` through |
| 12 | Adv 13b: a person's own rule at priority ≥4 beats rmk's | no | confirmed | allow at 4 → 4.004 over rmk deny 4.003; deny `write_file` at 4 over rmk allow 4.001 |
| 13 | Deny > ask > allow among rmk's rules | no | confirmed | default mode: deny 4.003, ask 4.002, allow 4.001; mutation dropping `modes` → 2 tests fail |
| 14 | `read` is `read_file` and `read_many_files` | no | confirmed | both → rmk's `ask_user` |
| 15 | Trailing `*` trim matches the old `/\s*\*$/` | no | confirmed | edge cases plus 20,000 random strings → 0 differences; no new polynomial regex |
| 16 | Antigravity: a pattern without `*` left out of `allow`, a prefix for deny/ask | no | confirmed | mutation → 1 test fails |
| 17 | SPEC permission bullets match the behaviour | no | confirmed | `SPEC.md:173-183`, `:234-246` |
| 18 | SPEC hook and agent bullets match the behaviour | no | partly | the hook bullet's "a command that names a variable warns" is false beside `$RMK_` (row 6) |

**Overall:** not met (rows 2, 9; rows 5, 6, 18 partly).

Fixes after the re-check:
- Row 2: the control-character check is a loop over code points, not a regular expression; `pnpm lint` exits 0.
- Rows 6 and 18: the `$RMK_` and variable warnings are separate checks, and the variable one ignores `$RMK_…` itself; a test pins `fmt $RMK_FILE_PATHS; curl -H "$SLACK_TOKEN"` getting both.
- Row 9: a test parses `tomlString`'s output with smol-toml for every control character and DEL, a surrogate pair, lone surrogates and quotes, and a Gemini command whose description holds DEL and a lone surrogate; reverting `tomlString` to `JSON.stringify` fails it (checked, then restored).
- Row 5: SPEC says a `GEMINI_PROJECT_DIR` already set where Gemini CLI starts takes over a project script's path, which rmk can't prevent, and the Gemini CLI page says so.
- Row 11's remark: SPEC says that in plan mode an item's `ask` on a read doesn't apply and plan mode lets reads through.

### Re-check 2

Witnessed: 2026-11-22 22:41 EST, by a fresh agent (adversarial). Commit: 581e3279 + working-tree diff. Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | `pnpm lint` passes; the control-character check is a loop over code points | no | confirmed | `pnpm lint` exit 0; U+0000–U+001F and DEL refused, U+0080/U+0085/U+00A0/U+2028/U+FEFF kept; ordinary text up to 100,000 chars parses with smol-toml; lone surrogates refused |
| 5 | SPEC says a preset `GEMINI_PROJECT_DIR` takes over a project script's path | no | confirmed | `SPEC.md:227-229`. Remark: the Gemini CLI page is PLAN task 11's |
| 6 | Both hook warnings beside `$RMK_`, separate checks, pinned by a test | no | partly | behaviour holds; reverting to `if / else if` → 1 test fails; but folding both texts into one warning → 131/131 pass: the test never counts the warnings |
| 9 | `tomlString`'s escaping is covered by a test | no | confirmed | reverting it, dropping the DEL escape, or dropping `wellFormed` → 1 test fails each |
| 18 | SPEC hook bullet matches the behaviour | no | confirmed | `SPEC.md:223-227` |
| — | Core tests and typecheck pass; no new polynomial regex | no | confirmed | 529 passed; typecheck exit 0; `/\$RMK_[A-Z_]+/g` linear (≤1.3 ms on 1,000,000 chars) |

**Overall:** not met (row 6: a test gap only).

Fix after the re-check: the test expects exactly two warnings for `fmt $RMK_FILE_PATHS; curl -H "$SLACK_TOKEN"` (`toHaveLength(2)`); removing the variable warning now fails 2 tests (checked, then restored).

### Re-check 3

Witnessed: 2026-11-22 22:42 EST, by a fresh agent (adversarial). Commit: 581e3279 + working-tree diff. Machine: macOS (Darwin 27.2.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | Both hook warnings beside `$RMK_`, from two separate checks, pinned by a test | no | confirmed | `renderer.ts:278-292` two independent `if`s; `renderer.test.ts:460` `toHaveLength(2)`; folding both into one warning → 1 failed / 130 passed ("to have a length of 2 but got 1"); `else if` → the same; restored → 131/131 |
| — | Core tests, typecheck and lint pass on the repo as it is | no | confirmed | 47 files / 529 passed; typecheck exit 0; `pnpm lint` exit 0 |

**Overall:** met. With the blind and adversarial rows met through re-checks 1–3, every claim of task 5 is confirmed.

## Task 6 — Other targets and the registry

Witnessed: 2026-11-22 22:58 EST, by a fresh agent (blind). Commit: 50bbf833 + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | In a project, Antigravity leaves out `always` and `glob` rules when Codex or Gemini CLI is a target, with `covered_by_target` | no | confirmed | `antigravity/renderer.ts:453-476` through `covered.ts`; probe: Codex writes `section:AGENTS.md`, Gemini CLI `section:GEMINI.md`, Antigravity `[]` plus the warning; alone with cursor and claude-code it writes `.agents/rules/house-style.md` |
| 2 | In a project, Antigravity leaves out `model` rules when Codex or Gemini CLI is a target | no | confirmed | both write `dir:.agents/skills/house-style`; warning "(the skill in .agents/skills/)" |
| 3 | `manual` rules: the same skill for all three in a project; two copies in the home folder | no | confirmed | project changes identical; user: `.gemini/config/skills/` vs `.agents/skills/` |
| 4 | In the home folder, only Gemini CLI covers `always`/`glob`; Antigravity keeps its `model` rule | no | confirmed | probe; test `covered("always", ["codex"], "user")` → 1 change |
| 5 | A target with the item turned off doesn't cover it | no | confirmed | `covered.ts:11-12`; test's `off` case |
| 6 | Unit tests cover every row, and fail without the code | no | confirmed | `renderer.test.ts:451-499`; four mutations each fail 1 of 22 |
| 7 | The shared `.agents/skills/<n>/` is one state entry, and remove deletes it | no | confirmed | `--target codex,gemini,antigravity` → one entry; remove → exit 0 |
| 8 | `install.test.ts` covers `--target codex,antigravity` and `--target gemini,antigravity` | no | confirmed | `install.test.ts:426-465`; 21 passed |
| 9 | Both renderers in `RENDERERS` (after copilot) and exported from `render/index.ts` | no | confirmed | `registry.ts:14-21`, `index.ts:3,8` |
| 10 | Post-install note for a project install that wrote `.gemini/settings.json` or `.gemini/commands/`; none in user scope | no | confirmed | `install.ts:518-524`; mutations fail the tool-notes test |
| 11 | Antigravity's MCP variables reach the person as the render warning | no | confirmed | stdout "Warning: Antigravity: … `GITHUB_TOKEN` wasn't written…" |
| 12 | The web tests that list every tool name both new ones, and pass | no | confirmed | web 6966 passed |
| 13 | Nothing else lists tools by a fixed count that now breaks | no | confirmed | whole monorepo `pnpm test` passed; the 4-tool lists left (feeds tests, MCP enum) are tasks 9 and 10 |
| 14 | The other goldens are unchanged | no | confirmed | `git status … __golden__` → empty |
| 15 | `pnpm lint` passes | no | not met | formatter error at `item-page.test.tsx:474` (a line this diff added, too long) |
| 16 | `pnpm typecheck` passes | no | confirmed | exit 0 |

**Overall:** not met (row 15).

Fix after the pass: `biome format --write` on `item-page.test.tsx` puts the assertion's argument on its own line; `pnpm lint` exits 0.

### Re-check 1

Witnessed: 2026-11-22 22:53 EST, by a fresh agent (blind). Commit: 50bbf833 + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 15 | `pnpm lint` passes | no | confirmed | exit 0, 0 errors, none in `item-page.test.tsx`; `biome format` on it → no fixes |
| 15a | The fix only changes formatting; the assertion's text is unchanged | no | confirmed | `git diff`: the `toContain` wraps over :474–476 with the same literal |
| 15b | The item-page test passes | no | confirmed | 1 file, 30 tests passed |

**Overall:** met.

## Task 7 — Export

Witnessed: 2026-11-22 23:20 EST, by a fresh agent (blind). Commit: 381c0174 + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm lint`, `pnpm typecheck` and `pnpm test` pass | no | confirmed | lint exit 0; typecheck exit 0; core 541, rmk 301, mcp 53, web 6966 passed |
| 2 | Antigravity goldens (agent, rule, MCP) read back to the example, or lose only what the renderer warned about | no | confirmed | agent `{tools:[read,grep,glob,shell], model:strong}`; `mcp:github-mcp` missing as the golden's `unmapped_tool` says; rule globs exact; MCP headers and env missing as the golden's warnings say |
| 3 | Gemini CLI agent and command goldens read back | no | confirmed | agent tools include `mcp:github-mcp`; `strong` missing as warned; command description matches, `target` → `args` |
| 4 | The Gemini CLI MCP golden reads back to the example | no | partly | `Bearer ${GITHUB_TOKEN}` read back with no `env` entry for `GITHUB_TOKEN`, no warning |
| 5 | Skill goldens read back through the shared skill reader | no | confirmed | secure-coding in every folder; Antigravity's review-diff as a skill |
| 6 | No env value reaches an uploaded item | no | confirmed | hostile env values → names only; `rmk export gh --from antigravity --yes` → no `ghp_` in requests |
| 7 | No literal credential reaches an uploaded item through these readers | no | not met | Gemini header `"s3cr3tP4ss$Word"` and `"Bearer hunter2hunter2$X"` → uploaded as `s3cr3tP4ss${Word}`, `Bearer hunter2hunter2${X}`, no warning; §8's `cleaned()` lets a literal beside a reference through (the Claude Code reader too) |
| 8 | `$NAME` is read as `${NAME}` | no | partly | works, but making `braced()` the identity keeps 90/90 green |
| 9 | SSE `url` is read as http with a warning | no | confirmed | warning given. Remark: `type:"sse"` refused, `type:"http"` with `url` warned |
| 10 | Antigravity `serverUrl` (or `url`) is read as http | no | confirmed | `serverUrl` wins over `url` |
| 11 | Gemini TOML commands, invalid TOML, subfolder names | no | confirmed | `bad.toml` refused, exit 1; `a/b/deep.toml` → `a-b-deep` |
| 12 | A `kind: remote` agent is refused | no | confirmed | `gemini.test.ts` |
| 13 | Folder-per-agent `agent.md` named by its folder | no | confirmed | `fixer`. Remark: `.agents/agents/fixer/notes.md` is offered as an agent |
| 14 | Scope-only folders | no | confirmed | project `.gemini/config/*` and home `.agents/rules`, `.agents/agents` not listed |
| 15 | A `.gemini/settings.json` with comments gives a clear problem | no | confirmed | "settings.json isn't valid JSON (…), so its MCP servers can't be read.", exit 0 |
| 16 | `--from antigravity` and `--from gemini` select correctly, the shared `.agents/skills/` included | no | confirmed | CLI probe |
| 17 | `rmk export --from antigravity\|gemini` has CLI tests | no | partly | only `planExport` is tested; nothing goes through `run()` |
| 18 | Both tools are wired into `export-proposal.ts` (042) | no | partly | wired, but removing the four branches keeps 106/106 green |
| 19 | The MCP server's export tools take both | no | confirmed | `server.ts:215` enum, used at :230 and :258 |
| 20 | `native-readers.md` has a section for each | no | confirmed | §13 and §14 |
| 21 | No new regex carries polynomial risk | no | confirmed | `/\$([A-Za-z_][A-Za-z0-9_]*)/g` linear on 50,000 chars |

**Overall:** not met (row 7; rows 4, 8, 17, 18 partly).

Fixes after the pass:
- Row 7: §8's shared `cleaned()` keeps a credential-named header only when it's a reference, alone or after a scheme; a literal beside a reference (`s3cr3tP4ss${Word}`, `Bearer hunter2hunter2${X}`) is replaced whole by a declared variable. This changes the Claude Code reader too, which had the same gap; `native-readers.md` §8 says so. Tests in both readers check neither literal reaches the result.
- Row 4: the Gemini CLI reader declares every variable the URL, a header or an argument references; the golden reads back with `GITHUB_TOKEN` declared as a secret.
- Row 8: a test reads `$HOME/bin/srv` and `$REGION` as `${HOME}`, `${REGION}` (and the mixed-credential test reads `$TENANT` in the URL).
- Row 9's remark: `type: "http"` with `url` is plain http, no warning; `type: "sse"` is read as http with the SSE warning.
- Row 13's remark: in an Antigravity agent's folder only `agent.md` is an item (`FileSource.nested`); a test checks `notes.md` isn't offered.
- Row 17: `cli.test.ts` runs `rmk export --from antigravity|gemini` through `run()`: listing, and uploading both servers with no secret in any request.
- Row 18: `export-proposal.test.ts` reads Antigravity's `serverUrl` and Gemini CLI's `httpUrl` servers and edited agents and servers; removing the four branches now fails a test (checked, then restored).

### Re-check 1

Witnessed: 2026-11-22 23:16 EST, by a fresh agent (adversarial). Commit: 381c0174 + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm lint`, `pnpm typecheck` and `pnpm test` pass | yes | not met | lint and test exit 0; typecheck exit 1: `cli.test.ts(931,9)` TS2345, the tuple array has no `as const` |
| 4 | The Gemini CLI MCP golden reads back to the example | yes | confirmed | dropping the `uses` loop fails 2 tests. Remark: `${X:-default}` isn't declared |
| 7 | No literal credential reaches an uploaded item | yes | partly | 22 credential-named header variants clean in all six readers; still uploaded as written in every reader (since 040): URL userinfo password and `?api_key=…`, args `--password=…` and `--token hunter2hunter2${X}`, a non-credential-named header `X-Tenant: hunter2hunter2${X}` |
| 8 | `$NAME` is read as `${NAME}` | yes | confirmed | `braced()` identity fails 2 tests |
| 9 (remark) | `type:"http"` with `url` plain http; `type:"sse"` warned | yes | confirmed | mutation fails a test |
| 13 (remark) | Only `agent.md` is an item in an Antigravity agent's folder | yes | confirmed | removing the `nested` filter fails a test |
| 17 | `rmk export --from antigravity\|gemini` has CLI tests through `run()` | yes | partly | tests catch the Gemini fallback mutation, but the file breaks typecheck (row 1) |
| 18 | Removing the proposal branches fails a test | yes | partly | removing all four fails 1 test; removing only the agent/rule or agent/command branch keeps 10/10 green |
| 19 | Reverting `cleaned()` fails a test | yes | confirmed | fails both readers' tests |
| 20 | Existing readers still behave | no | confirmed | core 544, rmk 307, mcp 53 passed |
| 21 | No new regex carries polynomial risk | no | confirmed | 50,000-char crafted inputs in 2–25 ms |

**Overall:** not met (rows 1, 7, 17, 18).

Owner's decision on row 7 (2026-11-23): fix the older leak in 029 rather than a separate issue.

Fixes after the re-check:
- Rows 1 and 17: the tuple array has `as const`; `pnpm typecheck` exits 0.
- Row 7: §8's shared reader also takes out the password in the address, a query value whose name reads as a credential, the value of a credential flag (`--password=…`, `--api-key …`, `--token …`, split on `-`/`_` with no backtracking pattern; a reference is kept), and, in a header or an argument that also holds a reference, a literal run of 12+ letters and digits beside it (never a variable's own name). A test runs the witness's URL, args and `X-Tenant` header and finds none of the literals; `?page=2`, `core-${TEAM}` and `--sort-key name` stay. `native-readers.md` §8 says so.
- Row 4's remark: the Gemini CLI reader declares a variable referenced with a default; a test checks `${D_KEY:-hunter2hunter2}` declares `D_KEY` and uploads no `hunter2`.
- Row 18: the agent proposal test adds a tool in each tool's own names (`run_command`, `run_shell_command`) and expects `shell` back; removing either file branch alone now fails it (checked, then restored).

### Re-check 2

Witnessed: 2026-11-23 09:04 EST, by a fresh agent (adversarial). Commit: 381c0174 + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm lint`, `pnpm typecheck` and `pnpm test` pass | yes | confirmed | all exit 0 (`typecheck --force`) |
| 4 (remark) | A variable referenced with a default is declared | yes | confirmed | `gemini.test.ts:210-221`; mutation → 3 tests fail |
| 7 | No literal credential reaches an uploaded item | yes | not met | the four mutations each fail a test, and many variants are caught; still uploaded in every reader: an arg connection string `postgresql://admin:…@localhost/db`, `--header "Authorization: Bearer …"`, `-e API_KEY=…`, `--url=https://…?api_key=…`, user-only userinfo, `%3A` colon, no-scheme and `//` addresses, `#access_token=`, `?pas%73word=`, `;token=`, `--auth`/`--bearer`/`--pw`/`--key`, `--password:x`, `--token -x`, `hunter2!hunter2${X}`. Over-replaced: `--secret server.js`, `--no-password server.js`, `?key_id=abc`, `--workspace=project2024alpha${ENV}` |
| 17 | `rmk export --from …` has CLI tests through `run()` | yes | confirmed | 112/112; swapping either reader fails a test |
| 18 | Removing the proposal branches fails a test | yes | confirmed | each branch alone → 1 failed |
| 21 | No new regex or loop carries polynomial risk | no | not met | `token=a&`×6250 (50k chars) → 204,311 ms: `newVariable` rescans `taken` per candidate, O(k³), reached once per param or arg |

**Overall:** not met (rows 7, 21).

Fixes after the re-check:
- Row 21: `newVariable` keeps a set of names and a running suffix, so naming is linear; a test names 6,250 variables from one URL in under 5 seconds.
- Row 7, caught now (a test checks none of the literals is uploaded): an argument that is an address or a connection string goes through the address rules (also a `--url=…` value); a header passed as an argument (`Name: value`) through the header rules; a credential-named `NAME=value` argument (`-e API_KEY=…`); a token as the address's only userinfo (when it reads as one); the `%3A` colon; a `//` address; credential-named values after `#`; percent-encoded parameter names; `--auth`, `--bearer`, `--pw`.
- Row 7, over-replacement: a `--no-…` flag takes no value, and a value after a credential flag that reads as a file path is kept (`--no-password server.js`, `--secret ./secret.json`); the "literal beside a reference" rule applies to headers only, so `--workspace=project2024alpha${ENV}` stays; `git@`, `/@me` and `?email=a@b.com` stay (tested).
- Row 7, not caught, and said in `native-readers.md` §8 so the preview is read before uploading: `--key …` (often a file), `;token=` path parameters, `--password:…`, addresses with no scheme, and a literal broken up by punctuation beside a reference. `?key_id=…` is still replaced, as an access key's id.

### Re-check 3

Witnessed: 2026-11-23 09:17 EST, by a fresh agent (adversarial). Commit: 381c0174 + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm lint`, `pnpm typecheck` and `pnpm test` pass | no | confirmed | all exit 0 |
| 7a | Each listed caught shape is caught in all six readers | no | partly | 21 shapes × 6 readers absent; a `//` address as an argument is uploaded as written |
| 7b | The listed ordinary values stay | no | confirmed | all six readers keep them |
| 7c | §8's "not caught" list matches what still gets through | no | not met | also leak, not named: `--header "Authorization:Bearer …"` (no space), `-H "X-Api-Key:…"`, `--passphrase …`, `-pmy77pw`, `--token -dash77`, `command: "srv --password=…"`, `//user:…@h` as an argument |
| 7d | No secret reaches `io.requests` in an end-to-end `rmk export` | no | confirmed | 7 servers with the new shapes, 42 requests → leaked `[]` |
| 7e | Reverting each new rule fails a test | no | partly | 11 of 18 mutations fail; 7 survive: `%3A`, `bearer`, `pw`, `--no-`, the extension rule, the `/` rule, the beside rule on args |
| 21 | No new regex or loop is polynomial | no | confirmed | 30 crafted 50k inputs, 0.1–67 ms each; the old `newVariable` fails the 5 s bound |

**Overall:** not met (7a, 7c, 7e).

Fixes after the re-check:
- 7a, 7c: a `//` address as an argument goes through the address rules; a header argument with no space after the colon is read as a header, now only after `--header`/`-H` or when its name reads as a credential (so `localhost:5432` stays), its spacing kept; `--passphrase` is a credential flag. `-pVALUE`, a value starting with `-`, and a credential in `command` itself are added to §8's "not caught" list.
- 7e: a test pins each surviving rule with a case only it decides: `--bearer`, `--pw` and `--passphrase` take the next value; `--no-password plainvalue` and `--secret secret.json` / `--secret conf/secret` are kept; `--workspace=project2024alpha${ENV}` is kept; the no-space header after `--header`; `-H "X-Team: core"` and `localhost:5432` kept; a `//` address argument; `user%3Apc77@`.

### Re-check 4

Witnessed: 2026-11-23 09:20 EST, by a fresh agent (adversarial). Commit: 381c0174 + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm lint`, `pnpm typecheck` and `pnpm test` pass | no | confirmed | all exit 0 |
| 7a | Every caught shape in §8 is caught in all six readers | no | confirmed | 33 caught cases × 6 readers, none of the secrets in the output |
| 7b | The listed ordinary values stay, plus `localhost:5432` and `-H "X-Team: core"` | no | confirmed | all six readers. Side note: `--label author:jane` becomes `author:${SRV_TOKEN}` (over-catch) |
| 7c | §8's "not caught" list matches what still gets through | no | not met | not listed and leaking: `--dsn=//admin:…@db/x`, `--header=Authorization: Bearer …` and `--header=X-Api-Key:…` as one argument, `-H "X_Api_Key: …"`; `--password:…` is listed but now caught |
| 7e | Undoing each rule makes a test fail | no | partly | 21 of 26 mutations fail; survive: the `HEADER_FLAGS` gate, `-H` in it, `mixed=false` on header arguments, the credential-name gate, and the gate always true |
| 21 | No new regex or loop is polynomial | no | confirmed | 40 crafted 50k inputs, slowest 71 ms |

**Overall:** not met (7c, 7e).

Fixes after the re-check:
- 7c: a flag's value that is an address goes through the address rules whatever its form (`--dsn=//…`); `--header=Name: value` as one argument is a header; header names may hold `_`. `--password:…` is off §8's "not caught" list.
- 7b's side note: with no flag, an argument is a header only when its name reads as a credential header (has a `-`, or is `Authorization`/`Cookie`), so `author:jane` and `keyspace:main` stay.
- 7e: a test pins each gate with a case only it decides: `-H "X-Custom:hunter2hunter2${X}"` (`HEADER_FLAGS`, `-H`, and the mixed rule on header arguments); `Authorization:Bearer nf88` with no flag (the credential-name gate); `author:jane`, `keyspace:main`, `localhost:5432` kept (the gate not always true); `--header=…`, `--dsn=//…`, `X_Api_Key`. Header parsing is checked before any cleaning, so an argument that isn't used as a header declares no variable (tested).

### Re-check 5

Witnessed: 2026-11-23 09:35 EST, by a fresh agent (adversarial). Commit: 381c0174 + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm lint`, `pnpm typecheck` and `pnpm test` pass | no | confirmed | all exit 0 |
| 7a | Everything §8 lists as caught is caught in all six readers | no | not met | 44 cases × 6 readers clean, but: a header argument whose value holds `=` (`Authorization: Basic YWRtaW46cHc=`, `X-Api-Key: k3y=v4l`) is taken by the `NAME=value` branch and mostly uploaded; regression: `--header=Referer: https://admin:…@h/x` uploaded as written (the one-argument header branch now runs before the address branch) |
| 7b | The ordinary values stay | no | confirmed | 31 cases × 6 readers |
| 7c | §8's "not caught" list matches what leaks | no | partly | no-flag headers whose name has no `-` (`API_KEY:…`, `Token: …`) and a `//` address in a header value leak and aren't listed |
| 7e | Undoing each rule or gate makes a test fail | no | partly | 33 of 36 fail; survive: the `-` part of the no-flag gate, `flagged` in the one-argument form, `flag` requiring a leading `-` |
| 7f | An unused header parse declares no variable | no | confirmed | 0 orphans over 143 cases × 6 readers |
| 21 | No polynomial input | no | confirmed | 48 crafted 50k inputs, slowest 126.6 ms |

**Overall:** not met (7a, 7c, 7e).

Fixes after the re-check:
- 7a: a `NAME=value` argument is read as a variable only when `NAME` is environment-style (`ENV_NAME`), so a header argument's value stays whole, `=` included; a header's value that is an address (`Referer: https://…`, `X-Upstream: //…`) goes through the address rules, in every header form.
- 7c: §8's "not caught" list names a header with no flag whose name has no `-` and a variable passed on with a lowercase name; the caught list says a header's value is kept whole and its address cleaned.
- 7e: tests pin `Authorization: Basic …=` and `X-Api-Key: k3y=v4l` (whole value), `--header=Referer: https://…` and `-H "X-Upstream: //…"` (address rules), `X-Api-Key:v4lue` with no flag (the `-` rule), `--header=X-Custom:hunter2hunter2${X}` (`flagged` in the one-argument form), and `-e API_KEY=hunter2` still a variable.

### Re-check 6

Witnessed: 2026-11-23 09:52 EST, by a fresh agent (adversarial). Commit: 381c0174 + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm lint`, `pnpm typecheck` and `pnpm test` pass | no | confirmed | all exit 0 |
| 7a | Everything §8 lists as caught is caught in all six readers | no | not met | 62 cases × 6 readers clean, re-check 5's fixes included; regression: a credential header argument holding `://` or starting `//` got only the address rules (`-H "Cookie: sid=…; next=https://app/x"`, `-H "Authorization: Bearer … https://h"`, `-H "X-Api-Key: //…"`) |
| 7c | §8's "not caught" list matches what leaks | no | partly | not listed: an address with a password in an http server's `headers`; a no-flag header with a `-` that isn't credential-named holding an address; `NAME=value` with a non-environment-style name (`X-Api-Key=…`, `--header=X-Api-Key=…`, `Authorization=Bearer …`, `Api_Key=…`, `apiKey=…`); `-e API_KEY=…://x` |
| 7e | Undoing each rule or gate makes a test fail | no | confirmed | 40 mutations, all fail |
| 7f | No orphan variables | no | confirmed | 0 over 190 cases × 6 readers |
| 21 | No polynomial input | no | confirmed | 56 crafted 50k inputs, slowest 118.7 ms |

**Overall:** not met (7a, 7c).

Fixes after the re-check:
- 7a: a credential header's value always gets the whole-value rule, address or not (`headerValue`), and a header argument is recognised before the address rule; only a header that isn't credential-named gets the address rules for an address value.
- 7c: the same `headerValue` runs for an http server's `headers`, so an address with a password there is cleaned; a variable pair is any single word that reads as a credential, then `=` (`X-Api-Key=…`, `Api_Key=…`, `apiKey=…`, `--header=X-Api-Key=…`, `Authorization=Bearer …`), checked before the address rule (`-e API_KEY=…://x`); a no-flag header whose name doesn't read as a credential stays unread, and §8's "not caught" list says so. Tests pin each case.

### Re-check 7

Witnessed: 2026-11-23 09:54 EST, by a fresh agent (adversarial). Commit: 381c0174 + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm lint`, `pnpm typecheck` and `pnpm test` pass | no | confirmed | all exit 0 |
| 7a | Everything §8 lists as caught is caught in all six readers | no | partly | 80 caught cases × 6 readers absent, re-check 6's leaks included; regression: `_TOKEN=lu71` uploaded (the name pattern needs a leading letter) |
| 7b | The ordinary values stay | no | partly | `author=jane`, `tokenizer=bpe`, `session=default`, `keyspace=main`, `sort_key=name` now become `…=${…}` (credential substrings) |
| 7c | §8's "not caught" list matches what leaks | no | partly | not listed: `--env=API_KEY=…`, `-e=API_KEY=…` (new kind); a second address in one value (new kind); `X-Next: /path?api_key=…` in an http header (variant of "address with no scheme"); dotted names (`API.KEY=…`, `--set api.key=…`) |
| 7e | Undoing each rule or gate makes a test fail | no | partly | all new `headerValue`, `variablePair` and order mutations fail; V2 (`variablePair` without the credential test) and V6 (any flag allowed) survive |
| 7f | No orphan variables | no | confirmed | 0 over 246 cases × 6 readers |
| 21 | No polynomial input | no | confirmed | 66 crafted inputs, slowest 117.7 ms |

**Overall:** not met (7a, 7b, 7c, 7e).

Fixes after the re-check:
- 7a, 7b: a variable pair's name is read by its words (split at `-`, `_`, `.` and camel case, no backtracking pattern): it names a credential when its last word or last two do (`_TOKEN`, `API_KEY`, `apiKey`, `X-Api-Key`, `db.password`), or when it's environment-style and ends in `_KEY` (`STRIPE_KEY`); `author=jane`, `tokenizer=bpe`, `session=default`, `keyspace=main`, `sort_key=name`, `mode=fast` and `-e LOG_LEVEL=debug` stay (tested, which also pins V2).
- 7c: `--env=`, `-e=` and `--set` take a variable pair as their value (`ENV_FLAGS`; V6 pinned: other flags don't); every address in a value that holds several is cleaned (`cleanedUrls`, in arguments and headers); dotted names are read as words. §8's "not caught" list now says "an address or a path with no scheme (`user:pass@host`, `/path?api_key=…` in a header)".
- The header functions' JSDoc is back above `isHeaderArg`.

### Re-check 8

Witnessed: 2026-11-23 10:02 EST, by a fresh agent (adversarial). Commit: 381c0174 + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm lint`, `pnpm typecheck` and `pnpm test` pass | no | confirmed | all exit 0 |
| 7a | Everything §8 lists as caught is caught in all six readers | no | partly | 302 cases × 6 readers; re-check 7's misses hold; still leaking: addresses split by `;` or `\|`, and a second address that starts `//` |
| 7b | The ordinary values stay | no | partly | all listed values stay; over-catch: `-e SORT_KEY=name`, `-e PRIMARY_KEY=id` (the `_KEY` rule), not said in §8 |
| 7c | §8's "not caught" list matches what leaks | no | partly | not listed: `--build-arg=API_KEY=…`, `--set-string=api.key=…` (the `=` form of flags outside `ENV_FLAGS`), `--set a=1,api.key=…`, `-e GITHUB_PAT=…`; exotic names (`1TOKEN=`, non-ASCII) also leak |
| 7e | Undoing each rule or gate makes a test fail | no | partly | survive: the camel-case split, the `authorization`/`cookie` words, `--set` in `ENV_FLAGS`, V6, a part's `//` check |
| 7f | No orphan variables | no | confirmed | 0 over 302 cases × 6 readers |
| 21 | No polynomial input | no | confirmed | 75 crafted inputs, slowest 120.9 ms |

**Overall:** not met (7a, 7b, 7c, 7e).

Owner's decision (2026-11-23): one last round of fixes, then §8 says the cleaner is a best effort and the preview is what to read, and the final re-check lists any further variant in §8 instead of failing the task.

Fixes after the re-check:
- 7a: every address in a value is cleaned when it holds more than one `//`, split at `,`, `;`, `|` or spaces.
- 7c: a variable pair is read after any flag (`--build-arg=…`, `--set-string=…`), and in a comma list (`--set a=1,api.key=…`); `pat` names a credential (`GITHUB_PAT`). `ENV_FLAGS` is gone.
- 7b: §8 says an environment-style `…_KEY` such as `SORT_KEY=name` is replaced too.
- 7e: a test pins each surviving branch: `githubToken=`, `myApiKey=` (camel case), `Authorization=`, `Cookie=`, `--set=api.key=`, `--build-arg=NODE_ENV=production` and `--label=tier=web` kept (any flag, ordinary pairs stay), `https://a,https://b,//u:…@h` (a part's `//`).
- §8 opens its "not caught" list by saying the cleaner is a best effort and the export preview, which shows every value before anything is uploaded, is what to read.

### Re-check 9

Witnessed: 2026-11-23 10:15 EST, by a fresh agent (adversarial; the last round, per the owner's decision). Commit: 381c0174 + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm lint`, `pnpm typecheck` and `pnpm test` pass | no | confirmed | all exit 0 |
| 7a | Everything §8 lists as caught is caught in all six readers | no | partly | 114 caught cases × 6 readers clean, every r8 fix included; regression: a comma list holding a credential pair skips the address rule for its other parts (`--set=x=${K},token=${T},u=https://admin:pw@h` keeps `pw`; caught at r8) |
| 7a′ | Undoing each r8 fix makes a test fail | no | confirmed | 20 mutations, all fail |
| 7b | Ordinary values stay, apart from the over-catch §8 names | no | confirmed | 84 cases × 6 readers; only `SORT_KEY=name`, `PRIMARY_KEY=id` change. Note: `--feature-gates=Auth=true` → `Auth=${…}` (not named) |
| 7c | §8 states the best effort, the preview, and the `…_KEY` over-catch | no | confirmed | `native-readers.md` §8; `ENV_FLAGS` gone |
| 7f | No orphan variables | no | confirmed | 0 over 384 cases × 6 readers |
| 21 | No polynomial input | no | confirmed | 92 crafted inputs, slowest 116.1 ms |

**Overall:** not met (7a's regression). Variants to add to §8, listed by the pass: other address separators (`&`, `+`, brackets, a full-width comma), an address inside another's query, a pair's value holding a comma, pairs split by `;` or spaces, pair names whose last word isn't a credential word (`GH_PAT2`, `API_KEY_1`, `API_KEY_PROD`, `DB_PWD`, `SESSION_ID`, `-e KEY`), other characters or a leading digit in names, other assignment spacing (`TOKEN =v`, `API_KEY:=v`, `/api_key=v`), `///` and `\\` addresses, a user-only userinfo or path token that doesn't look random, unusual header arguments, a credential flag's value that reads as a file path; over-catch: a credential-named pair after any flag (`--feature-gates=Auth=true`) and an empty `token=`.

Fixes after the re-check:
- 7a: in a comma list, each part that isn't a credential pair keeps the address rule (`u=https://user:pass@host`, a bare address); a test with the pass's three inputs finds no password.
- The variants and the two over-catches are named in §8, after the best-effort statement.

### Re-check 10

Witnessed: 2026-11-23 10:17 EST, by a fresh agent (adversarial; scoped to re-check 9's fixes). Commit: 381c0174 + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm lint`, `pnpm typecheck` and `pnpm test` pass | no | confirmed | all exit 0; core `src/read` 104 passed |
| 7a | In a comma list holding a credential pair, each other part keeps the address rule, in all six readers | no | partly | re-check 9's three inputs clean in all six, and many variants; still leaking: a bare address whose query holds `=` beside a pair (`API_KEY=${K},https://admin:pv04@h/?a=b`, `--set=token=${T},https://h/x?token=pv14`): the part is split at the query's `=` |
| 7a′ | Reverting the fix makes a test fail | no | confirmed | restoring re-check 9's code, or dropping the bare-address branch, fails the test |
| 7b | The fix doesn't newly wreck ordinary values | no | confirmed | all kept in all six readers |
| 7f | No orphan variables | no | confirmed | 150 reads, none |
| 21 | The changed path stays linear | no | confirmed | 25k / 50k / 100k addresses: 271 / 485 / 948 ms |
| 7c | §8 names re-check 9's variants and over-catches accurately | no | confirmed | every named example checked |

**Overall:** not met (7a).

Fix after the re-check: a list part is a bare address when it starts with `//` or the text before its first `=` holds `://`, so it isn't split at a query's `=`; the test adds `API_KEY=${K},https://admin:pv04@h/?a=b` and `--set=token=${T},https://h/x?token=pv14`, and neither password reaches the result.

### Re-check 11

Witnessed: 2026-11-23 10:21 EST, by a fresh agent (adversarial; scoped to re-check 10's fix). Commit: 381c0174 + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm lint`, `pnpm typecheck` and `pnpm test` pass | no | confirmed | all exit 0 |
| 7a | A bare address whose query or fragment holds `=`, beside a credential pair, isn't split at it and loses its credential, in all six readers | no | confirmed | 27 leak inputs × 6 readers → `BAD=0`, incl. `&` in the query, `//` starts, fragments, two addresses, `postgres://…?sslmode=require`, `HTTPS://` |
| 7a′ | Reverting the fix makes a test fail | no | confirmed | 1 failed, 18 passed; restored: 19 passed |
| 7b | The fix doesn't newly wreck ordinary values | no | confirmed | 14 ordinary inputs × 6 readers kept byte for byte |
| 7f | No orphan variables | no | confirmed | 246 reads, none |
| 21 | The changed path stays linear | no | confirmed | 25k / 50k / 100k: ~264 / 460 / 873 ms |

**Overall:** met. A further, different variant, listed under the owner's rule (re-check 8) and named in §8: a credential where an address's host goes (`API_KEY=${K},x://token=…`).

## Task 8 — Run counting

Witnessed: 2026-11-23 10:30 EST, by a fresh agent (blind). Commit: 0786fa82 + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `HOOK_TOOLS` and `HOOK_FILES` have both tools | no | confirmed | `usage-hooks.ts:24-46`; `addUsageHooks` → both "Added rmk's usage hook to ~/…" lines |
| 2 | Antigravity's `rmk-telemetry` key loads on the real CLI 1.5.14 and runs only for the matched tools | yes | confirmed | rmk's shape beside the person's keys: logged `read_file` of a `SKILL.md`, a schema `read_file`, `call_mcp_tool`; none for `run_command`; a second run logged `invoke_subagent` |
| 3 | Gemini CLI 0.70.0 accepts rmk's `AfterTool` entry | no | confirmed | its `loadSettings` → `errors: []`, the person's entry kept; the matcher matches `activate_skill`, `invoke_agent`, `mcp_…` only; timeout in ms |
| 4 | Antigravity's handler reads real payloads correctly | yes | confirmed | 4 captured payloads → skill, null, mcp-server, agent |
| 5 | Gemini CLI's handler matches its source | yes | confirmed | `fireAfterToolEvent`, `extractMcpContext`, `SKILL_PARAM_NAME = "name"`, `params.agent_name` |
| 6 | `rmk telemetry hook antigravity` queues the runs | no | confirmed | 4 payloads → exit 0, empty output, 3 events queued |
| 7 | `rmk telemetry` on/off touches only rmk's entries | no | confirmed | the person's key and settings kept; off → files deep-equal their originals; `{}` loads in a real `agy` run |
| 8 | Nothing double-counts across `~/.gemini` | no | confirmed | `agy` doesn't run Gemini's `AfterTool` hooks; Gemini reads `hooks.json` only from extensions. Remark: re-reading a skill's `SKILL.md` counts again |
| 9 | `TOOL_COLOR` and `NO_RUNS` cover both | no | confirmed | `UsageCard.tsx:26-27`, `:41-44` |
| 10 | The tokens are in both themes and `globals.css`, 3:1 or more, not red or amber | no | confirmed | olive `#4d7c0f`, sky `#0284c7`; `tokens.test.ts` 129 passed |
| 11 | The "What each AI tool reports" section is task 11's | no | confirmed | SPEC.md:331-332 |
| 12 | Unit tests cover the hook changes and the handler, and fail without the code | yes | confirmed | 18 passed; three mutations each fail one test |
| 13 | `pnpm lint`, `pnpm typecheck` and `pnpm test` pass | no | confirmed | all exit 0 |

**Overall:** met.

After the pass (wording): SPEC says a skill the model reads again in the same conversation counts again (row 8's remark).

## Task 9 — Plugins and the git mirror

Witnessed: 2026-11-23 10:42 EST, by a fresh agent (blind). Commit: 5357a4dd + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Both in `PLUGIN_TOOLS`, adapters in `build.ts`, `pluginNameProblem` (dot → `-`, `--` refused) | no | confirmed | `types.ts:14-21`; `build.ts:31-32`; `names.ts:53-57` |
| 2 | Plugin goldens for both, checked by the tests | no | confirmed | 9 + 8 folders; 46 passed; mutating either hook path fails a test |
| 3 | No marketplace file for either in the mirror | no | confirmed | `marketplaceFor` null; probe build → only `.rmk-feed.json` and `plugins/{antigravity,gemini}/…`; state `file: ""` |
| 4 | Feed state, conflicts and removal work for both | no | confirmed | edited and unknown folders → exit 3, nothing written; `--force` removes; second build "Nothing changed." |
| 5 | `rmk feed build --tools` takes both | no | partly | works, but the usage text lists four tools (`cli.ts:49`, `feed-build.ts:422`) |
| 6 | `SERVED_TOOLS` has both; the server builds their zips and listings | no | confirmed | probe: `antigravity` and `gemini` zips and marketplaces |
| 7 | The feed tests include both | no | partly | CLI test yes; web `feed.test.ts:22` and `plugin-feed.db.test.ts` don't |
| 8 | The admin panel names both and says mirror-only | no | confirmed | names from `rendererById`; `feeds.intro` in en, pt, fr |
| 9 | `plugin-feeds.md` gets their columns | no | partly | "What each tool accepts" and Names yes; "Plugin contents per type", the manifest list, the git mirror tree and the Endpoints/`feed_not_found` lines no |
| 10 | Antigravity plugins as the SPEC says | no | confirmed | `agy plugin validate --strict` passed all 9 |
| 11 | Gemini CLI extensions as the SPEC says | no | partly | no `contextFileName`, no `policies/` (SPEC:354-359 says both) |
| 12 | Every Antigravity golden installs from a folder and is listed | yes | confirmed | agy 1.5.15, fresh HOME: 7 installed, listed with matching components |
| 13 | Every Gemini CLI golden installs from a folder and is listed | yes | confirmed | 8 installed after trusting the folder; GEMINI.md, MCP, skills listed |
| 14 | A hook script runs from the plugin root / extension path as built | no | can't check here | reproduced through `sh`; a real agent turn was refused by the witness's permissions, and Gemini has no sign-in |
| 15 | Installing by URL | no | can't check here | needs a hosted mirror |
| 16 | No env value reaches a plugin | no | confirmed | `grep -rl SECRETVALUE` → nothing |
| 17 | No other tool's goldens or marketplaces changed | no | confirmed | `git status … __golden__` → only the two new folders |
| 18 | `pnpm lint`, `pnpm typecheck` and `pnpm test` pass | no | confirmed | all exit 0 |

**Overall:** not met (rows 5, 7, 9, 11; 14 and 15 unchecked).

Fixes after the pass:
- Row 5: `cli.ts` and `feed-build.ts` usage name all six tools.
- Row 7: `feed.test.ts` checks `isServedTool` for all six; `plugin-feed.db.test.ts` builds an Antigravity plugin and a Gemini CLI extension and lists them with the same sha256, and its "caps only Claude Code" test covers the two new tools.
- Row 9: `plugin-feeds.md` gets Antigravity and Gemini CLI columns in "Plugin contents per type", their manifests, their mirror folders with no marketplace file and how they're installed, and the six tools in Endpoints and `feed_not_found`.
- Row 11: SPEC corrected to what's built: `GEMINI.md` is the default context (no `contextFileName`), and policies stay out (a plugin is built from the project-scope render, and Gemini CLI's policies are home-folder only).
- Row 14: run by the implementer on the real Antigravity CLI (PLAN Notes): a plugin script hook installed with `agy plugin install` ran from the installed plugin's folder; Gemini CLI can't run a model here (owner's decision), so its hook stays checked by its source's `loadExtensionHooks` and the probe.
- Row 15: by URL wasn't tried; the task asks for it only where the CLI takes one, and it needs a hosted mirror; the Documentation gives installing by folder.

### Re-check 1

Witnessed: 2026-11-23 10:52 EST, by a fresh agent (blind, scoped to rows 5, 7, 9, 11, 14, 15). Commit: 5357a4dd + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | `rmk feed build --tools` takes both, and the usage text names them | no | confirmed | `cli.ts:49`, `feed-build.ts:39,422` list all six |
| 7 | The feed tests include both | no | confirmed | 2 files, 39 passed; dropping both from `SERVED_TOOLS` fails `feed.test.ts` |
| 9 | `plugin-feeds.md` gets their columns | no | confirmed | every section added, matching the builders and goldens |
| 11 | Gemini CLI extensions as the SPEC says | no | confirmed | SPEC:354-367 = `gemini.ts` and the goldens |
| 14 | A hook script runs from the plugin root or extension path as built | no | can't check here | Antigravity rests on the implementer's run (PLAN Notes), consistent with the shape `antigravity.test.ts:53` pins; `agy` wasn't on this agent's PATH; Gemini CLI has no real run |
| 15 | Installing by URL, where the CLI takes one | no | can't check here | both take a GitHub URL; needs a hosted mirror |
| 18 | `pnpm lint`, `pnpm typecheck`, `pnpm test` pass | no | confirmed | all exit 0 |

**Overall:** not met (rows 14, 15 unchecked).

Owner's decision (2026-11-23), on rows 14 and 15: both waived. A Gemini CLI extension's hook rests on its source's `loadExtensionHooks` and the builder's tests, since no model can run here; installing by URL is left untried, and the Documentation gives installing by folder, which both real CLIs did. The Antigravity half of row 14 is checked again by a witness with `agy`'s path (below).

### Re-check 2

Witnessed: 2026-11-23 11:07 EST, by a fresh agent (blind, scoped to the Antigravity half of row 14). Commit: 5357a4dd + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0, Antigravity CLI 1.5.15.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 14 | (Antigravity) A script hook in a plugin built by `antigravity.ts` runs on a real run, from the installed plugin's folder | no | confirmed | `buildPlugin("antigravity", …)` on a `run.script` hook → `hooks.json` `./hooks/format-on-edit/log.sh`, the script 0755; `agy plugin install <folder>` → hooks: 1 installed; a real `agy -p` run that used `run_command` → the script logged `pwd=…/.gemini/config/plugins/examples-format-on-edit`; uninstalled, and `diff -r` of the config backup → no difference |

**Overall:** met. With the owner's waiver of the Gemini half of row 14 and of row 15 (re-check 1), every claim of task 9 is confirmed.

## Task 10 — Every tool list

Witnessed: 2026-11-23 11:13 EST, by a fresh agent (blind). Commit: a1f2793f + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The MCP server's enum and descriptions name both | no | confirmed | `server.ts:215`, `:85`, `:148`, `:218`, `:259`; mcp 53 passed |
| 2 | `testing.ts` fixtures give support for both | no | confirmed | `testing.ts:36-43,62-69` |
| 3 | `TOOL_PLACES` matches what the renderers write, in project scope | no | confirmed | probe against the goldens' `changes.json`, every type |
| 4 | Home-folder-only types point at the home folder; unsupported types have no place | no | confirmed | probe output against `safe-git/user`, `git-branch/user` goldens |
| 5 | `placeFor` names Antigravity's hook key after the item, tested | no | confirmed | `tool-paths.ts:128-130`; mutation → `"key":"<name>"`, which the test rejects |
| 6 | The messages name both, in en, pt and fr | no | confirmed | `common.authShell.lead`, `help.export.answer`; `admin.json` already; web 6976 passed |
| 7 | The CLI's plugin-setup message, the feed workflow and goldens, and the usage name both | no | confirmed | `plugin-setup.ts:73`, `feed-workflow.ts:17,69`, goldens, `cli.ts:49`, `feed-build.ts:39,422`. Remark: `plugin-setup.test.ts:160` tries only `codex`, `copilot` |
| 8 | A search for `"copilot"` finds no tool list without `antigravity` and `gemini` | no | not met | `keywords` in `packages/{cli,core,mcp,server}/package.json`; `admin-settings.test.tsx:111`; `private-feeds-api.db.test.ts:216`; `plugin-setup.test.ts:160`; `plugin-feeds.md:4`. Older lists naming neither Copilot nor the new tools: READMEs, `packages/cli/package.json`'s description, `install.md:302`, `MVP.md:18,115,477,494`, `feed-build.ts:41,172` |
| 9 | Moving `TOOL_PAGES` to task 11 is recorded consistently | no | confirmed | PLAN tasks 10 and 11 |
| 10 | `pnpm lint`, `pnpm typecheck` and `pnpm test` pass | no | confirmed | all exit 0 |

**Overall:** not met (row 8).

Fixes after the pass:
- Row 8: the four packages' `keywords` add `antigravity` and `gemini`; `private-feeds-api.db.test.ts` and `admin-settings.test.tsx` (`notBuilt`, and its count of six rows) cover the six served tools; `plugin-setup.test.ts` checks `antigravity` and `gemini` are refused with the new wording; `plugin-feeds.md`'s opening names Antigravity's and Gemini CLI's folders and 029.
- The older lists: `README.md`, `packages/cli/README.md`, `packages/core/README.md`, `packages/cli/package.json`'s description, `install.md`, `MVP.md` (the platforms line, the status line row, `rmk feed build`'s row and `--tools`, the MCP server line), and `feed-build.ts`'s two comments name the six tools (or "their AI tool").

### Re-check 1

Witnessed: 2026-11-23 11:23 EST, by a fresh agent (blind). Commit: a1f2793f + working-tree diff. Machine: macOS 27.2.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | (remark) `plugin-setup.test.ts` checks `antigravity` and `gemini` are refused with the new wording | no | confirmed | `plugin-setup.test.ts:160` loops over four tools and expects exit 2 and the new wording; 8 tests pass |
| 8 | A search for `"copilot"` finds no tool list without `antigravity` and `gemini` | no | confirmed | every hit in packages, apps/web, docs/spec, docs/runbooks and docs/MVP is a list naming both, a one-tool fact, a test fixture about marketplace files, or `topics.ts` (task 11) |
| 8a | The package.json edits are valid JSON and the lockfile matches | no | confirmed | `JSON.parse` on all six; `pnpm install --frozen-lockfile` → up to date |
| 8b | The older three-tool lists name the six tools and read correctly | no | confirmed | READMEs, CLI description, `install.md`, `MVP.md` (status line row matches §3.3's table and `tool-paths.ts`), `feed-build.ts` |
| 10 | `pnpm lint`, `pnpm typecheck` and `pnpm test` pass | no | confirmed | each exit 0 |

**Overall:** met. Left for task 11: `topics.ts:109,387,392`, `MVP.md:271` (§3.3's plugin feeds bullets), `plugin-feeds.md:78`, `MVP.md:916` (§14.6's usage line).
