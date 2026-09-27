# 012 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Migration `0005_submissions`.** Both tables, indexes and table-level foreign keys,
  `columnTypes.longText()`, and the Kysely types.
  *Done when:* it migrates on SQLite and the 004 servers; a foreign-key test, and a test that a
  1 MB file round-trips on each database.

- [ ] **2. `submissions` domain: drafts.** Model, repository (interface + Kysely), services and
  actions: create (with templates), list mine, get, save files, rename, delete; the author-only
  rule; `submissions.create` in the permission map.
  *Done when:* database tests cover each operation, privacy (other users and root get "not found"),
  the limits, and the conflict check on stale saves.

- [ ] **3. Templates.** A starter `ronne.yaml` and files for each of the 11 types.
  *Done when:* each template passes 011's checks except for the placeholder description.

- [ ] **4. `.zip` import.** Server-side unzip with `fflate`, merge or replace, top-folder
  unwrapping, and the traversal, symlink and size checks.
  *Done when:* tests with crafted archives (traversal, symlink, too many files, too big, one top
  folder) pass, and a refused import leaves the draft unchanged.

- [ ] **5. My submissions and New item.** `/submissions` and `/submissions/new` (scope picker,
  name, type with descriptions and risk notes).
  *Done when:* render and action tests pass.

- [ ] **6. The editor: files and code.** `/submissions/[id]` with the file tree, CodeMirror 6
  (dependency checklist in Notes, themed with 032's tokens), uploads, save with Ctrl/Cmd+S, the
  unsaved-changes warning, the limits in the header, and binary files.
  *Done when:* render tests pass, and Playwright edits a file, saves and reloads.

- [ ] **7. The editor: form and validation.** The form generated from the schema, kept in step
  with the YAML (comments survive), and the validation panel with links to file and line.
  *Done when:* tests cover both directions of the sync and comment preservation, and the Playwright
  test in the acceptance criteria passes.

## Notes
