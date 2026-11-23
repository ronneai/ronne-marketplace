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
