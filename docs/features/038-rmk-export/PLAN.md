# 038 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it. Tasks 1 and 2 touch only `packages/core` and can merge first.

## Tasks

- [x] **1. One frontmatter parser.** Move the private `frontmatter()` out of
  `packages/core/src/package-checks.ts` into its own module, returning the data and the body.
  *Done when:* `package-checks.test.ts` passes unchanged and the parser has its own tests.

- [x] **2. The skill reader.** `packages/core/src/read/` with `readSkill`, the manifest writer
  (YAML out, with the `yaml` package core already has), the types, and the `./read` entry in the
  package's `exports`. `docs/spec/native-readers.md` §1–4 updated wherever building changed them.
  *Done when:* a golden test shows the example skill's rendered folder reads back into an item
  that passes `parseManifest` and `checkPackage`, and rendering it gives the same folder; tests
  cover the long description, the missing name, and a hand-written `ronne.yaml`.

- [x] **3. Finding and walking.** In `packages/cli/src/export.ts`: the skills under
  `.claude/skills/` and `.agents/skills/` for a scope, and the folder walker with the skip lists,
  links, executable bits, and an early stop past the limits.
  *Done when:* tests on a temporary folder cover every skip reason, a linked skill folder, and a
  folder over the limits.

- [x] **4. Whose it is.** The ownership check: the state entry (with `readState` and `diskHash`),
  the `version`, the marker.
  *Done when:* tests cover written here, installed, installed and edited, a registry copy, a
  rendered rule, and the home folder as the project.

- [x] **5. `planExport`.** Items, scope, manifest, local checks, the name pre-check, the secret
  scan, and the fingerprint. Writes nothing and sends no `POST`.
  *Done when:* the same folder gives the same fingerprint, any changed byte gives another, and a
  test proves no skipped file's bytes are in the plan.

- [x] **6. `uploadExport`.** One `POST /drafts` per item; the fake registry in `testing.ts` gains
  `GET /scopes` and `POST /drafts`.
  *Done when:* tests show one request per item, the bodies' files, and a failure on the second item
  reported with the first draft's address.

- [x] **7. The command.** `export` in `COMMANDS`, `to`, `name`, `yes` and `dry-run` in `OPTIONS`,
  the usage text, the preview inside the prompt (`rmk` prints only when a command ends), `--json`
  and the exit codes.
  *Done when:* `cli.test.ts` covers a terminal run with each prompt, a run without a terminal,
  `--dry-run`, and every exit code.

- [x] **8. The library.** `discoverLocalItems`, `planExport`, `uploadExport` and their types in
  `packages/cli/src/lib.ts`.
  *Done when:* `pnpm packages:check` and `pnpm release:smoke` pass.

- [ ] **9. End to end.** In `apps/web/e2e/rmk.e2e.ts`: write a skill folder, export it with the
  built `rmk`, open the draft signed in.
  *Done when:* `pnpm test:e2e` passes.

- [ ] **10. Documentation.** The new topic, the sentences in `rmk#what` and `overview#path`, the
  My submissions helper, and the README.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
