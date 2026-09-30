# 042 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. The API takes a base.** `POST /api/v1/drafts` with `base`: the checks (item, type,
  version), a proposal draft with the uploaded files through the submissions service (sharing
  017's insert with `proposeChange`), the new error codes, `proposal` in the response, and the
  audit metadata.
  *Done when:* `drafts-api.db.test.ts` covers a proposal created, each new error, the draft limit
  counting it, and a stale base; on all four database servers.

- [x] **2. The merge.** `mergeChange` in `packages/core/src/read/`: by file for skills, by field
  and content file for the other types, from B, R and L as the spec defines them.
  *Done when:* unit tests cover each merge row for each type, and that keywords, `license`,
  `targets`, the base's dependencies and an unmapped tool survive.

- [x] **3. Reading an install.** In `packages/cli/src/export.ts`: the base from the state entry
  (or the registry copy's `version`, or `latest`), the artifact downloaded and checked, rendered
  for the tool the entry names, read as R; the local files read as L, markers removed; which tool's
  files changed when there are several.
  *Done when:* tests with a fake registry cover each type installed and edited, a yanked base, an
  item no longer in the registry, and edits for two tools.

- [x] **4. `planExport` plans proposals.** The table in the spec's Behaviour: edited installs,
  registry copies and published own names become proposals; `--new`; "nothing changed"; the
  change against the base in the plan.
  *Done when:* tests cover each row of the table, `--new`, and nothing changed.

- [x] **5. The CLI, the tools and the upload.** The preview of a proposal (files added, removed and
  changed, manifest fields, stale), `--target` for several tools, `base` sent by `uploadExport`,
  and the result; `plan_export` and `export_items` the same.
  *Done when:* `cli.test.ts` and the MCP tests cover a proposal planned, uploaded and reported,
  and a stale one.

- [x] **6. End to end.** Install a published skill with the built `rmk`, edit it, export it as a
  proposal; a moderator opens it and sees the diff to the base.
  *Done when:* `pnpm test:e2e` passes.

- [x] **7. Documentation.** The sections in the spec's Documentation section, and the contract
  (`docs/spec/native-readers.md` §2) for installed and edited items.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
