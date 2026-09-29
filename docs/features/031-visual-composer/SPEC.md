# 031 — Visual composer

> Milestone: M6 · Depends on: 012, 013, 018 · Design: [MVP §8](../../MVP/MVP.md#8-web-application) ("Visual composer"), [§3.1](../../MVP/MVP.md#31-item-types), [§15](../../MVP/MVP.md#15-decision-log) (Composition) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md)

## Goal

Authors build an agent or a bundle by connecting it to the items it uses, on a canvas, instead of
typing names and ranges: they pick skills, MCP servers, hooks, rules and commands from the
catalogue, set each one's version range, and see the set at a glance. The canvas is only a view
over `dependencies` in `ronne.yaml`, so the manifest stays the single source of truth and reviewers
keep seeing a plain text diff (MVP §15).

## Scope

**In:**
- A **Canvas** view of `ronne.yaml` in the draft editor, next to Form and YAML, for `agent` and
  `bundle` drafts (the types whose dependencies are several kinds of item, MVP §3.1).
- A picker over the catalogue, limited to the types the draft's type may depend on (013's
  `DEPENDENCY_TYPES`), with a version-range selector.
- Round-tripping: every canvas change writes `dependencies`; every change to `dependencies` in the
  form or the YAML shows on the canvas.
- Node positions in `.ronne/layout.json` inside the draft.

**Out** (and where it goes instead):
- Editing the dependencies of the items on the canvas (their own graphs): read-only, and later.
- A canvas for `skill` and `command`, which may only depend on MCP servers: the form is enough.
- Showing the canvas in review: reviews stay a text diff of `ronne.yaml` (MVP §15).
- Composing across instances (§14's upstreams): post-MVP.

## Behaviour

**Where it is.** With `ronne.yaml` open in an `agent` or `bundle` draft, the view switch reads
**Form · YAML · Canvas**. The canvas loads only when chosen (a separate client chunk), so the
editor stays as fast as it is. Submitted drafts show it read-only, as they show the form.

**The canvas** (React Flow):
- The draft itself is the centre node: its name and type.
- Each dependency is a node joined to it by an edge: the item's name, its type badge, the range
  (`^1.2.0`), and, from the catalogue, its latest version, its description, and the tools it works
  in (026). A dependency that isn't published, or whose type isn't allowed, shows the same problem
  the form shows (013's checks), in the node.
- **Add**: a side panel searches the catalogue (018's search, filtered to the allowed types, and
  to items with an installable version); choosing one adds a node with the range `^<latest>`,
  or `latest`'s version exactly for a pre-release-only item. Dragging from the panel onto the
  canvas does the same, where it's dropped.
- **Change the range**: a field in the node, checked as the form checks it (a semver range or a
  dist-tag).
- **Remove**: a button on the node, or Delete with the node selected.
- Pan, zoom, fit to view, and a mini-map for larger sets. Everything also works from the keyboard:
  nodes are focusable in list order, and the side panel lists every dependency, so nothing needs
  a mouse (the form stays the accessible equivalent too).

**Round-trip.** The canvas holds no state of its own beyond positions: it reads `dependencies`
from the draft's parsed manifest and writes it back through the same change path the form uses,
so unsaved-changes, the save shortcut and validation work as they do. Keys are written in name
order, the way the form writes them, so moving nodes never changes `ronne.yaml`.

**Layout.** Positions live in `.ronne/layout.json` (`{ "version": 1, "nodes": { "@scope/name":
{ "x": 0, "y": 0 } } }`), a draft file like any other, saved with the draft. A dependency without
a position is placed automatically (a ring around the centre). The packer already leaves `.ronne/`
out of released packages (011), so a change proposal (017), which starts from the released files,
starts with an automatic layout. The file editor shows `.ronne/layout.json` like any file.

**In review**, the diff leaves `.ronne/` out, with a line saying the canvas layout changed, since it
isn't part of what's released (see Open questions).

**Where it lives.** `apps/web/src/features/draft-editor/composer-canvas/` (MVP §9, feature-first),
with its hooks, types and tests; the catalogue search for the picker is a server action over 018's
`searchCatalogue`, as the catalogue page uses it.

**Dependency.** `@xyflow/react` (React Flow), MIT, through the dependency checklist in the PR.

## Edge cases

- **A dependency the catalogue doesn't have** (typed in the YAML, or since removed): a node marked
  "not published", with the same message the form gives; it can be removed or kept for a
  submission to refuse.
- **A dist-tag as the range** (`next`): shown as is; the field accepts it.
- **The YAML doesn't parse**: the canvas shows the YAML view's error and a link to it, and edits
  nothing until it parses.
- **Many dependencies**: fit to view on open; the mini-map helps; no limit beyond the manifest's.
- **A layout file that doesn't parse, or names items no longer there**: ignored, and rewritten on
  the next move.

## Documentation

- **Submitting and review** (or Items and types → Dependencies): a short "Composing on a canvas"
  part: the Canvas view, adding from the catalogue, ranges, that the canvas only edits
  `dependencies` and reviewers see the text diff, and that the layout isn't released.
- **Inline helper** in the canvas's side panel: "What does the canvas change?" → "Only
  `dependencies` in ronne.yaml. Positions are kept with your draft and aren't released."

## Acceptance criteria

- [ ] An agent or bundle draft has a Canvas view; skills and other types don't.
- [ ] Adding, re-ranging and removing on the canvas changes `dependencies` in `ronne.yaml`, and changes in the form or YAML show on the canvas, with render and unit tests.
- [ ] The picker offers only published items of allowed types, with a starting range from the latest version.
- [ ] Positions are saved in `.ronne/layout.json`, missing ones placed automatically, and moving nodes never changes `ronne.yaml`.
- [ ] Released packages don't contain `.ronne/`; the review diff leaves it out.
- [ ] Everything on the canvas can be done from the keyboard.
- [ ] An end-to-end test composes an agent from two catalogue items on the canvas, saves, reloads, and sees them in the YAML.
- [ ] The Documentation part and the helper say what the canvas does.

## Open questions

1. **The review diff leaves `.ronne/layout.json` out** (recommended: it isn't released, and a
   moved node isn't something to approve), or shows it like any other file.
2. **A canvas for agents and bundles only** (recommended: they're the types that combine several
   kinds of item), or for every type that may have dependencies, including skills and commands.
3. **The starting range is `^<latest>`** (recommended: npm's default, and the resolver keeps it
   current within the major), or the exact latest version.
