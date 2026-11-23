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
