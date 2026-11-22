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
