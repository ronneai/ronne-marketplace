# Template for a feature

Copy `SPEC.md`, `PLAN.md` and `WITNESS.md` into a new folder, `docs/features/<domain>/NNN-slug/`:

- **`NNN`** is the next free ID, three digits; the slug is short and lowercase.
- **`<domain>`** is the feature's main domain, one of those in
  [`domains.json`](../domains.json). Add the ID there with its domain. A new domain goes in that
  file and in the index's list of domains.
- **Two rows**, in the same change: one in the [index](../README.md) (ID linked to the spec,
  title, domain, milestone, status) and one in the milestone's file in
  [`milestones/`](../milestones/README.md) (ID linked, what it does, what it depends on, status).
  The milestone file's status may add a note in brackets; the index gives it without.

The links in the three files are written for where the copy goes, three folders down from
`docs/`. `pnpm docs:check` checks the folder, its domain, both rows and every link; `pnpm
witness:check` checks `WITNESS.md` against the ticked tasks.
