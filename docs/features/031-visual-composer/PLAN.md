# 031 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. The model.** Pure functions from a manifest and a layout to nodes and edges, and back
  from a canvas change to `dependencies`; `.ronne/layout.json` read and written; automatic
  placement.
  *Done when:* unit tests cover adding, removing, re-ranging, round-trips with the form's output,
  and layouts that are missing or broken.

- [ ] **2. The canvas.** `@xyflow/react` through the dependency checklist; the Canvas view in the
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
