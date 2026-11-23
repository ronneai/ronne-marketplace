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
