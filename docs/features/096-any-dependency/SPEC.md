# 096 — Any item may depend on any other

> Milestone: Across the app · Depends on: 011, 013, 031, 041, 056, 089 · Design: [MVP §3.1](../../MVP/MVP.md#31-item-types), [§15](../../MVP/MVP.md#15-decision-log) · Contracts: [manifest spec §3](../../spec/manifest.md)

## Goal

People compose what works for them (owner, 2026-10-05): **any item may depend on any other item,
of any type**. A skill can bring the agent it works with, a rule the MCP server it talks about, an
agent another agent. Until now the type decided: a bundle on anything, an agent on skills, MCP
servers, hooks, rules and commands, a skill or command on MCP servers only, and the seven other
types on nothing at all.

## Scope

**In:**
- **The manifest** (`packages/core`): `DEPENDENCY_TYPES` gives every type every type; the schema no
  longer refuses `dependencies` on rules, hooks, MCP servers, permission policies, output styles,
  status lines and LSP servers; the package check `dependencies_not_allowed` goes. A bundle still
  has to list at least one dependency (it's nothing else).
- **The checks at submit and release** (013, 056, 089): no type check on a dependency. Everything
  else stays: it exists, its range, your own or published (089), no cycles, not itself.
- **Authoring** (012, 031, 056, 089): the form's Dependencies field, `@` in markdown files and the
  **Canvas** view are on every type, and the pickers offer items of every type.
- **Export** (041, `rmk export` and the MCP export tools): a detected reference is never refused
  for its type; it's exported with the item or found published, like any other.
- **The decision** (MVP §3.1, §15 "Resolver"; manifest spec §3) and the Documentation.

**Out** (and where it goes instead):
- **Cycles.** Still refused (MVP §4.3): A on B on A can't be installed in one order.
- **An item on itself.** Still refused.
- **What an install writes.** Unchanged: each item is rendered by its own type's renderer (021), so a
  skill that depends on an agent installs both, side by side. Nothing nests one inside the other.
- **Plugin feeds** (076–079): a plugin is an item with its dependencies already, whatever their
  types; nothing changes there.

## Behaviour

**Any type, any type.** A draft of any type may list any published item, or one of its author's own
(089), under `dependencies`, with a range. `mayDependOn` is always true and `mayHaveDependencies`
always true; they stay as functions so the callers keep one place to ask.

**The manifest schema.** The `if type in […] then not required dependencies` rule goes. The bundle
rule (`required: [dependencies]`) stays. Manifests already released are untouched: none of them has
a field the old rule forbade.

**Older `rmk` versions.** `rmk` 0.3.x parses a downloaded `ronne.yaml` and uses it even when the
schema it carries reports a problem (`parseManifest` returns the manifest with its issues;
`rmk install` reads only the manifest), and its resolver never looked at types. So a rule with
dependencies installs on an older `rmk` too. `rmk export` 0.3.x still won't propose such a
dependency (its own type rule); that only means fewer suggestions until it's updated.

**Authoring.**
- **The form:** the Dependencies field shows for every type (a bundle's says "The items this bundle
  installs.", the others "Items installed with this one.").
- **`@` in markdown:** on for every type (it was off where a type couldn't have dependencies).
- **The Canvas view:** Form, YAML and Canvas for every type (owner, 2026-10-05).
- **The pickers** (the form's search, `@`, the canvas's catalogue with its Type filter): every type,
  still never the item itself or one already listed.

**Export** (041). `rmk export` and `plan_export` detect what an item uses (an agent's skills, a
command's MCP servers…) as before; the `not_allowed` outcome ("A skill can't depend on a skill.")
goes. What's detected is declared like any other dependency.

**Errors that go.** `dependencies_not_allowed` (011's package check), `dependency_type`
(`DependencyTypeNotAllowedError`, 013's registry check) and export's `not_allowed`.

## Edge cases

- **A skill depends on an agent that depends on the skill:** a cycle, refused at submit (056's walk)
  and by the resolver.
- **A dependency of a type the target tool doesn't support** (a Codex install of something that
  depends on a Claude Code statusline): unchanged; the renderer warns and skips it (MVP §3.3).
- **An older web app's draft open in a browser during the upgrade:** its next save goes to the new
  server, which accepts more, so nothing is lost.

## Documentation

- **Items and types → Dependencies** (`items#dependencies`): any item may depend on any other; the
  dependency cards (bundle, agent, skill and command, "stands alone") are replaced by one rule:
  any type → any type, no cycles, never itself, and a bundle lists at least one.
- **Items and types → Composing on a canvas** (`items#canvas`): every type has the Canvas view, not
  only agents and bundles.
- **Exporting your own items → Dependencies** (`export#dependencies`): nothing detected is refused
  for its type, if the topic says so.
- **Helpers:** the canvas helper ("What does the canvas change?") is unchanged; no helper names the
  type rule.

## Acceptance criteria

- [ ] The schema and package checks accept `dependencies` on every type; a bundle still needs one.
- [ ] Submitting and releasing accept a dependency of any type; cycles and self-dependencies are
  still refused.
- [ ] The form, `@` and the Canvas view are on every type, and the pickers offer every type.
- [ ] `rmk export` declares a detected dependency of any type, with no `not_allowed`.
- [ ] An end-to-end test: a skill depends on an agent and a rule on a skill, each submitted.
- [ ] The service tests pass on SQLite, PostgreSQL, MySQL and MariaDB.
- [ ] MVP §3.1 and §15, and the manifest spec §3, say any type may depend on any type.
- [ ] The Documentation listed above says what the feature does now.

## Decisions

1. **Any item may depend on any other** (owner, 2026-10-05). Replaces MVP §3.1's table and §15
   "Resolver: dependency types restricted".
2. **The Canvas view on every type** (owner, 2026-10-05).
3. **A bundle still lists at least one dependency** (Claude): a bundle with none installs nothing.

## Open questions

None.
