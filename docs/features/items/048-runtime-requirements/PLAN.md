# 048 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. The field.** `requires` in `ronne.schema.json` (`rmk` and `node` as ranges, `commands`
  with the name pattern, at most 20 and unique, `os` from the enum, unique), `docs/spec/manifest.md`
  §1 and a new short section, and `requires` on one sample in `examples/items/` (a hook, which is
  where `commands` matters). A `requirementsOf(manifest)` helper in `packages/core` returns the block
  normalised (missing keys absent).
  *Done when:* `manifest.test.ts` covers each valid and invalid case in the first acceptance
  criterion, and `examples.test.ts` passes.

- [ ] **2. The checks.** In `packages/cli`: `checkRequirements(io, items)` with the `rmk` version,
  `node --version` (no shell, 5-second timeout, unparseable output as not found) and a `PATH` lookup
  (`PATHEXT` on Windows) behind `Io`, so tests fake them. `prepareInstall` runs it after rendering:
  `rmk_too_old` throws before anything is written, the rest join `Prepared` as `requirements`;
  `report` prints them and sets `requirements` in `--json`. The lenient read: `renderItem` warns
  about an unknown top-level field.
  *Done when:* `install.test.ts` covers a blocked install (nothing on disk), each warning with the
  install still written, several items failing the same check, the unknown-field warning, and the
  install with no arguments.

- [ ] **3. MCP and `rmk info`.** `plan_install` and `plan_update` add the warnings and fail on
  `rmk_too_old` before a `planId`; `get_item` and `rmk info` show `requires`.
  *Done when:* the MCP server's tests and `registry-commands.test.ts` cover both.

- [ ] **4. API and Overview.** The version JSON's `requires`; the Runtime requirements card in the
  side column (rows, words for a plain `>=`, "declares none"); the editor's form shows the group.
  *Done when:* `registry-api.db.test.ts` covers the field, `item-page.test.tsx` covers the card with
  and without requirements and with an unreadable artifact, and `manifest-form.test.tsx` saves a
  `requires` block.

- [ ] **5. Documentation.** The sections and helper in the spec's Documentation section; the
  decision log in MVP §15 gets a "Runtime requirements" row (only `rmk` blocks; presence only for
  commands).
  *Done when:* the docs render tests pass, and the `requires` helper's link lands on `items#manifest`.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
