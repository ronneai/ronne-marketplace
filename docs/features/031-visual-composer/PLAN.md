# 031 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. The model.** Pure functions from a manifest and a layout to nodes and edges, and back
  from a canvas change to `dependencies`; `.ronne/layout.json` read and written; automatic
  placement.
  *Done when:* unit tests cover adding, removing, re-ranging, round-trips with the form's output,
  and layouts that are missing or broken.

- [x] **2. The canvas.** `@xyflow/react` through the dependency checklist; the Canvas view in the
  draft editor for agents and bundles, loaded on demand, read-only when submitted; nodes with
  ranges, problems and removal; keyboard use.
  *Done when:* render tests cover the view switch, the nodes, and edits reaching the manifest.

- [ ] **3. The picker.** The catalogue search as a server action, filtered by allowed types, and
  adding by click or drop with the starting range.
  *Done when:* action tests on the database and render tests cover it.

- [ ] **4. Review, end to end and documentation.** The review diff leaving `.ronne/` out, the
  Playwright test, and the Documentation part and helper.
  *Done when:* it passes in CI, and the docs render tests cover the new part.

## Notes

- **Task 1.** The model is `composer-canvas/model.ts` (dependencies in the YAML, and the graph)
  and `layout.ts` (the layout file and placement). The spec said keys are written in name order
  "the way the form writes them", but the form writes them in the order of its rows; the canvas
  instead changes one line at a time and inserts new ones in name order. The spec also let a
  dist-tag be a range, which the manifest contract (§3) and 011's checks refuse; it now says so.
- **Task 2.** `@xyflow/react` 12.12.0, by the dependency policy's checklist (§3), for the pull
  request's description:
  1. *Need.* A pan-and-zoom node canvas with dragging, keyboard use and a mini-map; nothing in
     the platform or in what we have does it, and MVP §15 names React Flow.
  2. *License.* MIT; its install tree is MIT, ISC (d3) and BSD-3-Clause (`d3-ease`), all allowed.
     `pnpm licenses:check` passes.
  3. *Health.* 12.12.0 was released on 2026-09-24; maintained by the xyflow team, two publishers
     on npm; widely used.
  4. *Advisories.* None: `pnpm audit --audit-level high` is clean.
  5. *Install scripts.* None, so `allowBuilds` doesn't change.
  6. *Weight.* 20 packages: `@xyflow/react`, `@xyflow/system`, `zustand`, `classcat`,
     `use-sync-external-store`, nine `d3-*` packages and six `@types/d3-*`. React Flow is in a
     chunk of its own (about 190 kB before compression), loaded when Canvas is first chosen.
- **Task 2.** The panel is under the canvas, not beside it: the editor's column is too narrow to
  share, and a list in columns uses the width better. The draft's node doesn't move, so a
  dependency with the draft's own name can't collide with it in the layout file. Edges run from
  centre to centre under the nodes, so they meet each node's border wherever it is. A node's
  range field keeps what was typed in its own state, because React Flow hands a node its data an
  effect later, which would lose the caret. React Flow's attribution stays visible.
