# 097 — Agents and skills named in frontmatter

> Milestone: Across the app · Depends on: 011, 021, 023, 024, 025, 038, 040, 056, 076, 096 · Design: [MVP §3.3](../../MVP/MVP.md#33-platform-renderers) · Contracts: [manifest spec §2](../../spec/manifest.md), [`docs/spec/native-readers.md`](../../spec/native-readers.md)

## Goal

A skill can say which agent runs it, the way Claude Code does it (owner, 2026-10-05): in its
`SKILL.md` frontmatter, `agent: @test/agent`. Writing it is how the dependency is set. Today it
fails: a YAML value can't start with `@`, so the frontmatter doesn't parse and the editor says
"SKILL.md needs YAML frontmatter with name and description"; and even quoted, the skill was copied
byte for byte, so Claude Code would look for an agent named `@test/agent`. The reverse comes with it:
an agent's skill dependencies become Claude Code's `skills:`, the skills it preloads.

## What each tool supports

Checked against the vendors' docs on 2026-10-05:

| Tool | A skill run by a chosen agent | An agent that preloads skills |
|---|---|---|
| Claude Code ([skills](https://code.claude.com/docs/en/skills), [subagents](https://code.claude.com/docs/en/sub-agents)) | `agent: <name>` in `SKILL.md`, used only with `context: fork`; the name is a built-in (`Explore`, `Plan`, `general-purpose`) or a custom agent in `.claude/agents/` | `skills: [names]` in the agent's frontmatter: each skill's full content is loaded at start; skills with `disable-model-invocation: true` can't be preloaded |
| Codex ([skills](https://learn.chatgpt.com/docs/build-skills), [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)) | No: `SKILL.md` has `name` and `description` | No preload; an agent can only turn skills on or off, by path |
| Cursor ([skills](https://cursor.com/docs/context/skills), [subagents](https://cursor.com/docs/context/subagents)) | No | No |
| The Agent Skills standard ([spec](https://agentskills.io/specification)), and so claude.ai and the Skills API | No: six fields (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`); an upload with any other key is refused | No |

## Scope

**In:**
- **Unquoted `@` values in frontmatter** (owner, 2026-10-05): `agent: @test/agent` is read as if
  quoted, and saved quoted (`agent: "@test/agent"`), so the file stays valid YAML for every tool.
  The `@` list writes it the same way.
- **A real YAML error** when frontmatter doesn't parse, with its line, instead of "needs YAML
  frontmatter with name and description".
- **`agent:` in a skill's `SKILL.md`:** `@scope/name` names an item; it's a dependency, added to
  `ronne.yaml` when the draft is saved if it isn't there (the latest stable release as `^<version>`,
  or `^1.0.0` when it isn't released, as 056's picker does). It must be an agent (checked at submit). A plain
  name (`agent: Explore`, a built-in or a local agent) is left alone and isn't a dependency.
- **Claude Code's skill:** `agent: @scope/name` is written as the installed agent's name
  (`agent: agent`), and `context: fork` is added when it's missing (owner, 2026-10-05), since the
  agent is used only then.
- **The shared `.agents/skills/` copy** (Codex, Cursor): `agent` and `context` are left out, with a
  warning, since neither tool reads them and the Agent Skills standard refuses unknown keys.
- **Claude Code's agent:** its dependencies that are skills are written as `skills: [names]`
  (installed names), except skills with `disable-model-invocation: true`, which Claude Code can't
  preload (owner, 2026-10-05). Codex and Cursor agents get nothing (no such field).
- **Export** (038, 040): a Claude Code skill's `agent: <local name>` is a reference to an agent, so
  export finds it like an agent's `skills:`; when it's exported or published, the uploaded
  `SKILL.md` says `agent: "@scope/name"`.

**Out** (and where it goes instead):
- **`context` and `agent` in commands' files.** Commands' frontmatter isn't read today (only skills'
  is); a later feature.
- **Other frontmatter keys naming items.** None of the tools documents one besides these two.
- **Choosing per agent whether to preload.** Every skill dependency is preloaded in Claude Code
  (owner, 2026-10-05).

## Behaviour

**Reading frontmatter** (`packages/core/src/frontmatter.ts`). Before the YAML is parsed, a value
that is exactly an item name, `@scope/name`, unquoted, after `key:` or a list's `- `, is quoted. So
`agent: @test/agent` reads as `agent: "@test/agent"`. The lines of a `|` or `>` block are text and
are left alone. Anything else that fails gives `frontmatter_yaml`: "SKILL.md's frontmatter isn't
valid YAML: <the parser's message> (line N)." An empty block, or one that isn't keys and values,
still says "needs YAML frontmatter with name and description". The same reading is used by the
package checks, the renderers and the readers.

**Saving a draft** (012), and uploading one (037, 051). The skill's entry file (`SKILL.md` unless
`skill.entry` says otherwise) is saved with such values quoted, and an `agent: @scope/name` in it
that isn't under `dependencies` in `ronne.yaml` is added there, in the same transaction, keeping the
manifest's comments. A `dependencies` that isn't a map is left as it is, for the checks to report.
The editor shows both changes after the save. The `@` list in frontmatter inserts the name as it
does in the body, and the save quotes it.

**The checks.**
- Package checks (011): `agent` must be one name (`frontmatter_agent`: "SKILL.md's agent must be one
  name, such as @team/reviewer."); when it's an item name, it must be listed under
  `dependencies` (`frontmatter_dependency`; the save adds it, so this is for uploads and hand-edited
  manifests).
- Registry checks (013): an `agent:` item name must be an agent (`frontmatter_agent_type`: "SKILL.md
  runs in @x/y, which is a skill, not an agent."), judged by its published item or the submitter's
  own open submission; another author's unreleased item isn't a dependency anyway (089), so its type
  isn't told.

**Rendering** (021). `RenderInput` gains `dependencies`: each dependency's name and type, and for a
skill whether it sets `disable-model-invocation`. `rmk install` and the plugin builders (076) fill it
from what they resolved.
- Claude Code, skill: in `SKILL.md`'s frontmatter, `agent: "@scope/name"` becomes `agent: <short
  name>`, and `context: fork` is added after it when there's no `context`. Everything else in the file
  is kept as written.
- Claude Code, agent: `skills: [<short names>]` from the skill dependencies that can be preloaded, in
  name order; none, no key.
- Claude Code plugins (076): a plugin holds the item and its dependencies, and Claude Code names a
  plugin's own agents and skills `plugin:name`, so inside one they're written `<plugin>:<short
  name>` (the skills docs show `skills: [my-plugin:api-conventions]`, and plugin agents as
  `plugin:agent`; checked 2026-10-05).
- Codex and Cursor, the `.agents/skills/` copy: `agent` and `context` are removed, with a warning
  from each tool that writes it ("<name> names the agent that runs it; Codex and Cursor don't choose
  an agent for a skill, so it runs in the current one."). When Cursor leaves the skill to Claude
  Code's copy (025), it reads `.claude/skills/`, which keeps both keys; Cursor's docs list neither,
  so it's expected to ignore them, and no warning is given there.
- A plain-name `agent:` is written as it is for Claude Code, and removed (with the warning) from the
  `.agents/skills/` copy.

**Export** (038, 040). The Claude Code skill reader adds a reference of a new kind, `agent`, from
`agent:` (with `context: fork` or not); the dependency step finds it among the person's agents,
installed items or published ones, like a skill reference. The uploaded `SKILL.md` names it
`@scope/name` when it's declared; a built-in (`Explore`, `Plan`, `general-purpose`) is left as it is,
with no reference.

## Edge cases

- **`agent: @test/agent` and `@test/agent` isn't an agent:** refused at submit, with the type.
- **The agent is removed from `dependencies` by hand:** the package check says the frontmatter still
  names it; saving adds it back unless the frontmatter line is removed too.
- **A skill installed for Claude Code without its agent** (the agent's install failed or was
  skipped): Claude Code skips an unknown agent and runs `general-purpose`; `rmk` installs dependencies
  first, so this only happens when the agent doesn't support the tool.
- **An already-quoted value** (`agent: "@test/agent"`) is read and saved unchanged.
- **Two `agent:` keys:** invalid YAML (duplicate keys), with the real error.

## Documentation

- **Items and types → Dependencies** (`items#dependencies`): naming the agent in a skill's
  frontmatter (`agent: @scope/name`) sets the dependency; an agent's skills are preloaded in Claude
  Code.
- **Your AI tools → Claude Code** (`claude-code`, the section on skills and agents): `agent` and
  `context: fork` written for skills; `skills:` for agents.
- **Your AI tools → Codex** and **Cursor**: `agent` and `context` aren't kept for them.
- **Exporting your own items → Dependencies** (`export#dependencies`): a skill's `agent:` is found
  like an agent's `skills:`.
- **Helpers:** none new.

## Acceptance criteria

- [ ] `agent: @test/agent` parses, is saved quoted, and adds the dependency in the same save; a name
  picked from the `@` list in frontmatter is saved the same way.
- [ ] Frontmatter that isn't valid YAML shows the parser's message and line.
- [ ] A frontmatter agent that isn't an agent is refused at submit.
- [ ] Claude Code's skill gets `agent: <installed name>` and `context: fork`; its agent gets
  `skills:` without non-preloadable skills; the `.agents/skills/` copy has neither key, with a
  warning. Golden files cover each.
- [ ] `rmk export` finds a skill's `agent:` and uploads it as `@scope/name`.
- [ ] An end-to-end test writes `agent: @…` in a skill's `SKILL.md`, saves, sees the dependency, and
  submits.
- [ ] The Documentation listed above says what the feature does now.

## Decisions

1. **Unquoted `@` values are accepted and saved quoted** (owner, 2026-10-05).
2. **`context: fork` is added for Claude Code when a skill names an agent** (owner, 2026-10-05).
3. **An agent's skill dependencies are preloaded in Claude Code** (owner, 2026-10-05).
4. **Codex and Cursor's copy drops `agent` and `context`** (Claude): neither tool reads them, and
   the Agent Skills standard refuses unknown keys.

## Open questions

None.
