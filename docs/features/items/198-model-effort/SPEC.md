# 198 — Model and effort per AI tool

> Milestone: M33 · Depends on: 023, 024, 025, 026, 076, 078, 097, 122, 129, 166 · Design: [MVP §3.3](../../../MVP/MVP.md#33-platform-renderers), [MVP §15](../../../MVP/MVP.md#15-decision-log) (a new "Model and effort" row), [manifest spec](../../../spec/manifest.md), [CLI files spec](../../../spec/cli-files.md)

## Goal

Each AI tool runs every skill, agent and command on the model and effort the session already has.
That is usually the strongest one, even for a skill that only formats a commit message. Claude Code,
Codex and Cursor can each run an item on its own model, but each in different places and with its
own names. Ronne's manifest can express this only for agents, and only as a hint that only Claude
Code maps.

This feature lets an item say which model and effort it expects, for each AI tool, so the cheap
work runs on a cheap model and the hard work on a strong one. The owner's aim is to balance token
use (2026-11-21). Root decides which models the instance allows and what each tier means, on a new
Models tab of Admin › Settings. A project can change the tier map for itself in `rmk.config.json`.

## What the AI tools support

Checked against the vendors' docs on 2026-11-21:
[Claude Code skills](https://code.claude.com/docs/en/skills),
[Claude Code subagents](https://code.claude.com/docs/en/sub-agents),
[Codex subagents](https://developers.openai.com/codex/subagents),
[Codex skills](https://developers.openai.com/codex/skills),
[Cursor subagents](https://cursor.com/docs/subagents),
[Cursor skills](https://cursor.com/docs/skills).
These change often (MVP §3.3), so check them again before building each renderer task.

| Tool | Skill | Agent | Command |
|---|---|---|---|
| Claude Code | `model` (an alias such as `haiku`, a full ID, or `inherit`) and `effort` (`low`, `medium`, `high`, `xhigh`, `max`, depending on the model). They hold for the rest of the turn, or for the forked agent with `context: fork`. | `model` and `effort` in `.claude/agents/<n>.md` | The same frontmatter as skills |
| Codex | None: `SKILL.md` has only `name` and `description`, and `agents/openai.yaml` has no model | `model` and `model_reasoning_effort` (`low`, `medium`, `high`, `xhigh`, `max`, `ultra`, depending on the model) in `.codex/agents/<n>.toml` | None |
| Cursor | None: the frontmatter is `name`, `description`, `paths`, `disable-model-invocation` and a few display keys | `model: inherit` or a model ID. Effort is written only inside the ID, as `claude-opus-5[effort=high]` | None documented |
| Antigravity (029) | None: `SKILL.md` has only `name` and `description` | `model: inherit`, `flash` or `pro` in `.agents/agents/<n>.md`; no effort | None: commands are skills |
| Gemini CLI (029) | None documented | `model` (default `inherit`) and `temperature` in `.gemini/agents/<n>.md`; no effort | None documented (`.gemini/commands/<n>.toml` has `description` and `prompt`) |

What the tools do on their side:
- A Claude Code organisation's `availableModels` list, or `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`, can
  override what an item sets.
- Cursor falls back to the parent's model for an ID it doesn't know, and team admins can block
  models.
- Claude.ai and the Skills API refuse a `SKILL.md` that has `model` or `effort`. So the item's
  authored `SKILL.md` stays clean, and only the copy rendered for Claude Code gets the keys.

## Scope

**In:**

**The manifest.** A `model` block on `skill`, `agent` and `command`, with both keys optional:

```yaml
model:
  tier: fast         # fast | default | strong
  effort: low        # low | medium | high
targets:
  claude-code:
    overrides:
      model: claude-haiku-5-5   # an exact model for this tool (a pin)
      effort: low               # this tool's own effort values
  codex:
    overrides:
      model: gpt-6-luna
      effort: medium
```

- `tier` and `effort` are portable. Every tool maps them through the tier map (below).
- `agent.model: fast` (today's string) still validates and means `model: { tier: fast }`. The
  editor saves the new form.
- `targets.<tool>.overrides.model` and `.effort` pin one tool. A pin always wins over the tier and
  effort for that tool. Pins are accepted on skills, agents and commands, and each renderer checks
  its own effort values.
- A skill's authored `SKILL.md` may also carry `model` and `effort`, as Claude Code reads them. Ronne
  treats them as Claude Code pins, with the same checks. The editor shows a notice saying this,
  so nobody is surprised.

**The tier map and the allowed list (Admin › Settings › Models, root only):**
- For each AI tool Ronne renders (Claude Code, Codex, Cursor; the on-hold renderers once they're
  built):
  - **Allowed models:** a list of model IDs. An empty list means any model is allowed, which is the
    default.
  - **The tier map:** the model for `fast`, `default` and `strong`. An empty value means "write
    nothing", so the tool uses the session's model.
  - **Effort for each tier** (optional): the effort written when an item gives a tier and no
    effort.
- Ronne's built-in values are today's behaviour. For Claude Code, `fast` is `haiku`, `strong` is
  `opus`, and `default` writes nothing. For Codex and Cursor every tier writes nothing. The tab
  shows these built-in values until root saves its own. **Reset to Ronne's values** puts them back.
- Every tier value must be on the allowed list when the list isn't empty.
- Saved with a stale check (the version the form was loaded with) and audited with before and after
  (`settings.model_policy_changed`, 166's context).

**Resolution, in `packages/core` (pure, with no I/O).** `resolveModel(item, tool, policy)` returns
the model, the effort and any warnings. For each tool it goes through these steps:
1. **A pin for this tool.** It's kept if the allowed list is empty or contains it. Otherwise
   Ronne warns and moves on to step 2.
2. **The item's tier**, through the project's local tier map (`rmk.config.json`), else the
   instance's tier map, else Ronne's built-in one.
3. **The effort:** the pin's, else the item's own, else the tier's effort, else none.
4. **What's left:** an item with no `model` block writes nothing, exactly as today.

**What each renderer writes:**
- **Claude Code:** `model` and `effort` in `.claude/agents/<n>.md`, `.claude/commands/<n>.md`
  (or the skill a command becomes) and `.claude/skills/<n>/SKILL.md`. With `context: fork` (097),
  the same keys apply to the forked agent, as Claude Code documents.
- **Codex:** `model` and `model_reasoning_effort` in `.codex/agents/<n>.toml`. For a skill or a
  command with a `model` block or a Codex pin, it warns ("Codex can't choose a model for a
  skill; it uses the session's") and writes the item anyway.
- **Cursor:** `model: <id>` in `.cursor/agents/<n>.md`, with `[effort=<e>]` appended when there's an
  effort. An effort with no model can't be written, so Cursor warns and skips the effort. Skills
  and commands warn, as with Codex.
- **The shared `.agents/skills/` copy** (Codex and Cursor read the same bytes, 024/025): `model`
  and `effort` are removed from `SKILL.md`, the way 097 removes `agent` and `context`, with the same
  warning.
- Today's warnings stay: a hint with no model for the tool ("set targets.cursor.overrides.model")
  is still shown when the tier map gives the tool nothing for that tier.

**Getting the policy to `rmk`:**
- `GET /api/v1/model-policy` returns the instance's allowed lists, tier maps and tier efforts,
  for each tool. It's read-only, behind the same token as the other read routes, and carries no
  secrets.
- `rmk install` and `rmk update` fetch it once per run and pass it to core.
- An instance without the route (older than 198, a 404) means the built-in map. The install never
  fails because of it.
- `.rmk/state.json` records, for each installed entry, the hash of the resolved model and effort.
  `rmk update` re-renders an item whose resolved values changed, even when its version didn't.
  That way root's new map reaches projects at the next update.
- **Server-side renders** use the instance's policy with no local map: the plugin feeds and
  marketplaces (076, 077, 078), and the git export when it's built (153).

**The local override in `rmk.config.json`:**

```json
{
  "models": {
    "claude-code": { "tiers": { "strong": "sonnet" } },
    "cursor": { "pins": false }
  }
}
```

- `tiers` replaces the instance's model (or effort, as `{ "model": "…", "effort": "…" }`) for a tier,
  in this project.
- `pins: false` ignores items' pins for that tool, so only tiers apply. Use it for a developer
  whose plan lacks the pinned model.
- Local values are checked against the instance's allowed list too. A local value outside it
  warns and is ignored, because root's list is the instance's rule.
- People set these values by editing the file. `rmk install --no-models` writes no model and no
  effort for one run.

**The editor and review:**
- The item editor's form (012) gains a **Model** section for skills, agents and commands:
  - the tier;
  - the effort;
  - and per tool, a pin picked from that tool's allowed list, or typed when the list is empty.
- The item page's support matrix (026) shows, for each tool, the model and effort this instance
  would write, or "the session's model" with the reason.
- **Submitting** is refused, with the reason, for a pin that isn't on that tool's allowed list
  (`model_not_allowed`). A pin in `SKILL.md` counts too.
- The review page shows the resolved model for each tool beside the diff.
- **Released versions are immutable.** A pin that root later takes off the list isn't refused at
  install. It falls back to the tier, with a warning (step 1).

**Out** (and where it goes instead):
- **Per-workspace model rules:** root's instance list only. Workspace policies that can only make
  it stricter belong to 178's governance policies.
- **Choosing models per user:** a developer's choice is `rmk.config.json`. Ronne has no per-user
  model setting in the web app.
- **Measuring tokens or cost:** 047 counts invocations, not tokens. A cost view is a later feature.
- **Making Codex or Cursor skills use a model through a generated wrapper agent:** not built (owner,
  2026-11-21). They warn.
- **Rules, hooks and the other types:** the tools have no model setting for them.

## Behaviour

**A skill that should be cheap.** An author's `@platform/commit-message` skill sets
`model: { tier: fast, effort: low }`. On an instance with Ronne's values, Claude Code gets
`model: haiku` and `effort: low` in `.claude/skills/commit-message/SKILL.md`. Codex and Cursor get
the skill in `.agents/skills/` unchanged, and `rmk` says once per tool that they can't choose a
model for a skill.

**An agent that should be strong.** `@platform/security-reviewer` sets `tier: strong, effort: high`
and pins `codex: gpt-6.2-sol`. Root's map gives Cursor's `strong` the value `claude-opus-5`. Claude
Code gets `model: opus` and `effort: high`. Codex gets `model = "gpt-6.2-sol"` and
`model_reasoning_effort = "high"`. Cursor gets `model: claude-opus-5[effort=high]`.

**Root narrows the list.** Root allows only `haiku` and `sonnet` for Claude Code and maps `strong`
to `sonnet`. An existing agent pinned to `opus` installs with `sonnet` and the warning "opus isn't
allowed on this instance; using the strong tier's sonnet". A new submission pinning `opus` is
refused. The projects that installed it get `sonnet` at their next `rmk update`.

**A developer without the model.** Their plan has no Opus, so they set
`"claude-code": { "tiers": { "strong": "sonnet" }, "pins": false }`, and every item resolves within
what they can use.

## Edge cases

1. **An item with no `model` block:** nothing changes, and the golden files stay the same.
2. **Effort without a model for Cursor:** the effort is skipped, with a warning. For Claude Code and
   Codex the effort is written alone, and the tool keeps the session's model.
3. **`inherit`** as a pin or a tier value: written as is for Claude Code and Cursor. For Codex
   nothing is written, because inheriting is its default.
4. **An effort outside the tool's values** (a pin of `ultra` for Claude Code): refused when the
   draft is saved. At install it's dropped with a warning.
5. **A tool's own override wins** (Claude Code's `availableModels`, a forced subagent model, a
   Cursor team block): Ronne writes the file and can't know the outcome. The Documentation says so.
6. **A tier map that changes while a project has local edits** to the rendered file: the usual rule
   holds. A user-edited managed file isn't overwritten, and `rmk update` reports it (MVP §3.3,
   021).
7. **Cursor also reads `.claude/skills/`:** a skill installed only for Claude Code carries `model`
   and `effort`, and Cursor ignores keys it doesn't know. With Codex or Cursor as a target, they
   read the clean `.agents/skills/` copy.
8. **An `agent.model` string and a `model` block in the same item:** schema error ("use one").
9. **Offline `rmk install` from the lockfile** (if supported then): uses the policy last recorded in
   `.rmk/state.json`, else the built-in map.

## Data

- `instance_settings`: one key, `model_policy`, holding JSON. For each tool it has
  `{ allowed: string[], tiers: { fast?, default?, strong? }, efforts: { fast?, default?, strong? } }`
  and a `version` for the stale check. No migration is needed beyond the setting's default.
- The manifest schema (`ronne.schema.json`): a `modelHint` definition used by `skill`, `agent` and
  `command`, plus the string form on `agent.model`.
- `.rmk/state.json`: `modelHash` on each entry ([CLI files spec](../../../spec/cli-files.md)).
- `rmk.config.json`: the optional `models` key.

## Documentation

- **Items and types** (`items#model`, new section): the `model` block, tiers and effort, pins per
  tool, and the table of what each tool supports, in plain words.
- **Admin › Settings** (`settings#models`, new section): the Models tab, the allowed lists, the tier
  map, Reset to Ronne's values, and what changes for released items.
- **`rmk`** (`rmk#models`, new section): `models` in `rmk.config.json`, and `--no-models`.
- **Claude Code, Codex and Cursor** (`claude-code`, `codex`, `cursor`, a model line in each): what
  that tool takes and what it ignores.
- **Helpers:**
  - a help link on the editor's Model section;
  - one on the Models tab;
  - one on the support matrix's model row.
- `topics.ts` here and in ronne-web change together.

## Acceptance criteria

- [ ] An item with no `model` block renders byte for byte as before, for every tool (the golden
  files are unchanged).
- [ ] Every renderer applies the resolution steps in order for skills, agents and commands, and
  `resolveModel` has unit tests for every step and every warning.
- [ ] Claude Code writes `model` and `effort` on agents, commands and its skill copy. Codex writes
  `model` and `model_reasoning_effort` on agents. Cursor writes `model` with `[effort=…]` on agents.
  Every other combination warns and still installs.
- [ ] The `.agents/skills/` copy never carries `model` or `effort`, and the authored `SKILL.md`
  isn't changed.
- [ ] Root can set the allowed lists, tier maps and tier efforts on the Models tab:
  - the saves are stale-checked and audited;
  - a tier value off the list is refused;
  - Reset to Ronne's values works.
- [ ] `GET /api/v1/model-policy` returns the policy. `rmk` uses it, falls back to the built-in map
  on a 404, and re-renders on `rmk update` when the resolved values change.
- [ ] `rmk.config.json`'s `models` replaces tiers and turns pins off for this project, and a value
  off the instance's list is ignored with a warning.
- [ ] Submitting a pin off the allowed list is refused with `model_not_allowed`. A released
  version with a pin off the list falls back at install with a warning.
- [ ] The support matrix shows, for each tool, the model and effort the instance would write.
- [ ] The feeds use the instance's policy.
- [ ] Every screen exists in the three languages. The Documentation and helpers say what the
  feature does.

## Decisions

1. **A portable hint plus a pin per tool** (owner, 2026-11-21). The hint keeps items portable. The
   pin is for authors who know the exact model.
2. **Root's allowed list and tier map for each tool, on Admin › Settings › Models** (owner,
   2026-11-21). One place decides what the instance pays for, and one change to the map moves every
   item that uses a tier.
3. **A project can replace tiers and turn pins off in `rmk.config.json`** (owner, 2026-11-21),
   within root's allowed list (Claude). A developer can always pick something cheaper or available,
   never something the instance doesn't allow.
4. **Skills get a model and effort in Claude Code only, and the other tools warn** (owner,
   2026-11-21). Codex and Cursor have no setting for skills. A generated wrapper agent would change
   how the skill runs.
5. **The authored `SKILL.md` stays clean** (Claude). Claude.ai and the Skills API refuse
   `model` and `effort` there, so Ronne adds them only to the rendered Claude Code copy. Values an
   author writes there anyway count as Claude Code pins.
6. **The install never fails on a model** (Claude, following "degrade, don't fail", MVP §3.3).
   Submitting refuses pins off the list. A released version only warns, because it can't change.
7. **No model block means no change** (Claude). Existing items keep today's output until their
   authors opt in.

## Open questions

None.
