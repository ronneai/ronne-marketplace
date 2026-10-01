# 053 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **0. Decisions.** The owner settles the body's first line (a suggestion, confirmed by the AI
  tool or the person), and the spec is updated to match before anything is built.
  *Done when:* the spec has no open question that changes what's built.

- [ ] **1. Which items need one.** In `planExport`, using the readers' warnings and types (no
  reader changes beyond exposing what they already know), with the exceptions for proposals and
  drafts. `GET /api/v1/drafts` gains `description` (from the draft's `ronne.yaml`).
  *Done when:* `export.test.ts` covers each kind of item for each tool, a proposal, and a draft with
  and without a description; the drafts API test covers the new field.

- [ ] **2. Taking descriptions.** `ExportRequest.descriptions`, with trimming, the 300-character
  refusal and unknown keys, and `descriptions_required` with suggestions and excerpts. The
  descriptions go into `ronne.yaml`, a skill's uploaded `SKILL.md` frontmatter, and the plan's
  fingerprint.
  *Done when:* the tests cover a plan refused, then made with descriptions; the uploaded files; and
  the local files unchanged.

- [ ] **3. `rmk export`.** The terminal question with the suggestion, `--describe`,
  `--descriptions`, `--description` for any single item, the preview's description and source, and
  exit `2` without them.
  *Done when:* `cli.test.ts` covers asking, Enter for the suggestion, three empty answers, the
  flags, and no terminal.

- [ ] **4. MCP.** `plan_export`'s `descriptions` and its `needs` answer with the instructions; the
  plan text's "written by your AI tool"; the server instructions.
  *Done when:* the MCP tests cover the round trip and that `export_items` uploads the shown text.

- [ ] **5. Documentation.** The section and changes in the spec's Documentation section, and
  native-readers.md's note on which readers only ever take the first line.
  *Done when:* the docs render tests pass, and every new link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
