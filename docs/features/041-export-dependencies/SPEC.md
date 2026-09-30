# 041 — Dependencies on export

> Milestone: M7 · Depends on: 040 · Design: [MVP §3.1](../../MVP/MVP.md#31-item-types), [§4.1](../../MVP/MVP.md#41-submission-lifecycle-new-item-or-change-proposal), [§4.3](../../MVP/MVP.md#43-install--update) · Contracts: [`docs/spec/native-readers.md`](../../spec/native-readers.md), [`docs/spec/manifest.md`](../../spec/manifest.md) §3

## Goal

An exported item that uses other local items says so, and the person decides what happens to
them. When an agent loads a skill, or a skill calls an MCP server, `rmk export` and the assistant
show what the item depends on, **ask**, and recommend exporting those too, so the item works for
whoever installs it and not only on the machine it was written on.

## Scope

**In:**
- Turning the references the readers collect (038, 040) into findings, each with where it lives
  and what can be done about it.
- The question, in the terminal and through the MCP tools, with the recommendation.
- Writing `dependencies` in the exported manifests, and uploading in dependency order.
- Telling the person the order in which the drafts have to be submitted and released.

**Out** (and where it goes instead):
- Changing 013's rule that a dependency must be released before its dependent can be submitted:
  kept (see Open questions). Export explains the order; it doesn't shortcut the review.
- Submitting the drafts in order for the person: web only.
- Dependencies between types the manifest doesn't allow (manifest spec §3): reported, not declared.
- Guessing that a local item is "the same" as a differently named registry item.
- Bundles: a bundle of the exported items is made in the web app's canvas (031).

## Behaviour

**What counts as a reference** (contract §4–8): the skills an agent's frontmatter loads; the MCP
servers behind `mcp__<server>__…` tool names in an agent's tools or a skill's or command's allowed
tools. References are followed through: an agent that loads a skill that uses an MCP server
depends on both.

**Each reference is one of:**

| Finding | Means | What export does with it |
|---|---|---|
| **Yours** | a local item of the person's, found by 038/040 | offered for export with the item; the manifest depends on `@<scope>/<name>` at `^1.0.0` |
| **Installed** | `rmk` installed it (the state file names the item and version) | the manifest depends on that registry item at `^<installed version>`; nothing is uploaded |
| **Already selected** | the person is exporting it in the same run | as "yours", with nothing to ask |
| **Not found** | built into the tool, from a plugin, or defined somewhere export doesn't read | can't be declared; a warning names it |
| **Not allowed** | a pair the manifest forbids (a skill that uses a skill) | not declared; a warning names it |

`^1.0.0` is the range for an item that has no version yet: a first release is always `1.0.0`
(MVP §3.4). The dependency goes to the same marketplace scope as the item.

**The question.** When at least one finding is **yours**, the preview lists the findings and asks:

1. **Export them too** (recommended): each becomes its own draft, and the item declares them.
2. **Export without them:** the item is uploaded without those dependencies; the preview says it
   may not work where they're missing.
3. **Cancel.**

Installed dependencies are declared in both of the first two cases; there's nothing to decide
about them. With no finding of the person's own, nothing is asked.

- **In the terminal:** the question, or `--with-deps` / `--no-deps`. Without a terminal, or with
  `--json`, one of the two flags is required when there's something to decide (exit 2, with the
  findings in the error's details).
- **Through MCP:** `plan_export` gains `dependencies: "include" | "omit"`. Without it, when
  there's something to decide, it returns the findings, `needs: ["dependencies"]` and **no
  `planId`**, as it does for the scope (039). The server's instructions tell the assistant to show
  the findings, ask the person, and recommend exporting them too.

**The preview and the plan** then cover every item that will be uploaded, dependencies included,
each with its files and warnings as in 038: a dependency gets the same scrutiny as the item the
person named.

**The upload** goes dependencies first. If one fails, the items that depend on it aren't
uploaded, and the output says which drafts exist.

**Afterwards** the person has several drafts, and 013 only lets an item be submitted once its
dependencies are released. The result says so in order, from the server's own checks (037's
`submitIssues`): *"Submit and release `@team/github` first; then `@team/reviewer` can be
submitted."* Until then the dependent draft shows the same message in the web editor's checks.

## Edge cases

- **A dependency's name is already published** in that scope, with the same type: it's treated as
  already in the registry (depend on it at `^<its latest version>`, upload nothing), and the
  preview says so, because uploading it would make a draft Submit refuses. With another type, it's
  a warning, and the person renames one of them.
- **A dependency that is stopped** (a secret, the limits, an unsupported transport): "export them
  too" can't include it. The plan says which, and the person chooses again: without it, or cancel.
- **An MCP server that needs a description** (040): asked for as part of the same run, or the
  dependency's draft arrives with the issue.
- **The first release of a dependency is a pre-release:** `^1.0.0` doesn't match it, and Submit
  keeps refusing the dependent until a stable release, or until the person edits the range.
- **Two items that depend on the same local item:** it's exported once.
- **An item that refers to itself:** ignored.
- **Cycles** can't come from this: the types the readers cover only depend "downwards" (agents on
  skills, commands and MCP servers; skills and commands on MCP servers, manifest spec §3).
- **User-scope and project-scope items with the same name:** the one in the scope being exported
  wins; the other is a "not found" with a note.
- **`--no-deps` and an installed dependency:** still declared; the flag is about uploading the
  person's own items.

## Documentation

- **Exporting your own items** (038's topic): a section "Dependencies": what is detected, the
  three choices and why exporting them too is recommended, what happens with items `rmk`
  installed, and the order to submit and release in.
- **Submitting and review → The checks at submit** (`review#checks`): one sentence on exported
  items: release the dependencies first; the draft's checks say which.
- **Items and types → Dependencies** (`items#dependencies`): that export fills them in from what
  an item uses.
- **Registry MCP server → The tools** (`mcp#tools`): `plan_export`'s `dependencies` input.

## Acceptance criteria

- [ ] An agent that loads a local skill and uses a local MCP server produces those two findings, and through the skill, the skill's own MCP server.
- [ ] "Export them too" creates one draft per item, dependencies first, and the dependents' manifests declare them at `^1.0.0` in the chosen scope.
- [ ] An installed dependency is declared at `^<installed version>` and nothing is uploaded for it.
- [ ] "Export without them" uploads only the named items, without the person's own dependencies declared, and the preview warns.
- [ ] A not-found reference and a forbidden pair each produce a warning and no dependency; the manifests pass `checkPackage`.
- [ ] Without a terminal and without `--with-deps` or `--no-deps`, the command exits 2 and sends nothing; `plan_export` without `dependencies` returns the findings and no `planId`.
- [ ] After the upload, the output names the drafts to release first, and the dependent draft's Submit is refused in the web app until then, with 013's message.
- [ ] An end-to-end test exports an agent with its skill, then submits and releases the skill and submits the agent in the web app.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Open questions

1. **Keep "released first"** (recommended: it's the review's guarantee that an approved item can
   be installed, and 015 re-checks it at release), or let a draft be submitted while its
   dependencies are in review and hold its release instead. The second makes export feel like one
   step, and touches 013, 014 and 015.
2. **The range for a not-yet-released dependency:** `^1.0.0` (recommended), or `*`, which also
   accepts a later breaking `2.0.0`.
3. **A published item with the dependency's name:** treat it as the dependency (recommended, as
   above), or ask each time.
4. **Offering a bundle.** After exporting an agent and what it needs, the next thing a person
   wants may be one item that installs all of it. Recommended: leave it to the canvas (031), and
   say so in the result.
