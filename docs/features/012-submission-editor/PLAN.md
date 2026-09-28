# 012 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Migration `0005_submissions`.** Both tables, indexes and table-level foreign keys,
  `columnTypes.longText()`, and the Kysely types.
  *Done when:* it migrates on SQLite and the 004 servers; a foreign-key test, and a test that a
  1 MB file round-trips on each database.

- [x] **2. `submissions` domain: drafts.** Model, repository (interface + Kysely), services and
  actions: create (with templates), list mine, get, save files, rename, delete; the author-only
  rule; `submissions.create` in the permission map.
  *Done when:* database tests cover each operation, privacy (other users and root get "not found"),
  the limits, and the conflict check on stale saves.

- [x] **3. Templates.** A starter `ronne.yaml` and files for each of the 11 types.
  *Done when:* each template passes 011's checks except for the placeholder description.

- [x] **4. `.zip` import.** Server-side unzip with `fflate`, merge or replace, top-folder
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
- **Task 1 (2026-09-27): migration `0005_submissions`.**
  - `columnTypes.longText()` is `longtext` on MySQL (through `sql`, since Kysely doesn't know the
    name) and `text` elsewhere. A 1 MB text file with multi-byte characters, and a 1 MB binary file
    as base64, round-trip on SQLite, PostgreSQL 15, MySQL 8.4 and MariaDB 10.11.
  - `executable` uses the boolean helper and is written with `toDbBoolean` (SQLite can't bind
    booleans). The helpers' comments now allow booleans for flags with no moment behind them.
  - `path` uses a new `columnTypes.exactString()`: on MySQL, `varchar … collate utf8mb4_bin`, since
    the default collation would make `README.md` and `readme.md` (or `e.md` and `é.md`) one key.
    Files are sorted in JavaScript, not by the database, for the same reason.
- **Task 2 (2026-09-27): the `submissions` domain.**
  - `models/submission.ts` is pure, so the editor can import it: `validateDraft` runs 011's checks
    plus `name_mismatch` and `type_mismatch` against the draft, and `byteSize`/`fileBytes` handle
    base64 with `atob`, which works in the browser.
  - Services: `createDraft`, `listMySubmissions`, `getDraft`, `saveDraftFiles`, `renameDraft` and
    `deleteDraft`. Someone else's draft, root's included, and a malformed id all give
    `SubmissionNotFoundError`. Item names are trimmed and lowercased, as scope names are.
  - A save is checked before the transaction (paths, duplicates, `ronne.yaml` not deleted, base64,
    1 MB per file) and inside it (ownership, stale files, 500 files and 20 MB). A draft already over
    a limit can still save changes that shrink it. The stale check compares each file's
    `updatedAt` with the `loadedAt` the editor sends; `overwrite` skips it.
  - Renaming rewrites `name` in `ronne.yaml` through the `yaml` document API, so comments and
    quoting stay. `yaml` 2.9.1 is now a direct dependency of `apps/web` too (checked in 011).
  - Database tests pass on SQLite, PostgreSQL 15, MySQL 8.4 and MariaDB 10.11.
- **Task 3 (2026-09-27): templates.**
  - `models/templates.ts` has a starter for each of the 11 types: `ronne.yaml` plus the files it
    names (`SKILL.md` with matching frontmatter, `prompt.md`, `rule.md`, `command.md`, `style.md`,
    and executable `hook.sh` and `statusline.sh`). The MCP server, permission policy, LSP server and
    bundle need no other file.
  - The description is `""` on purpose: it's the one error each template has (plus `SKILL.md`'s
    matching description), so the editor's first problem asks the author to write it. The
    acceptance test "change the description in the form, see a validation error disappear" relies
    on it.
  - Short YAML comments explain each field and its choices; they survive form edits (task 7), so
    they're a first piece of the inline help planned for 033.
  - Tests: every template fails only on the description, passes completely once it's written, and
    creates a draft of each type on all four databases.
- **Task 4 (2026-09-27): `.zip` import.**
  - `models/zip.ts` reads the central directory itself, because fflate's unzip API doesn't expose
    an entry's Unix mode, which is needed to refuse symlinks and keep the executable bit.
  - Everything is checked before anything is inflated: encrypted entries, ZIP64, links and
    special files, 011's path rules, the file count, and each file's and the total's declared size.
    The archive itself may be at most the total limit (20 MB).
  - Entries are inflated with fflate's `inflateSync` into a buffer of the declared size, which it
    never grows (checked), and then the CRC-32 is compared, so an entry that lies about its size is
    refused as damaged instead of expanding.
  - `__MACOSX/` and `.DS_Store` are skipped, so a zip made in macOS's Finder still unwraps its
    single top folder. Folder entries are skipped too.
  - `importZip` reads the archive, then saves through `saveDraftFiles` with `overwrite`, so it
    shares the save's checks and transaction. `replace` refuses an archive without `ronne.yaml`
    (the draft would lose it) and suggests merging. Text is stored as UTF-8, and anything else
    (invalid UTF-8, or NUL bytes) as base64, by `toDraftContent`, which uploads will share.
  - `fflate` 0.8.3 is now a direct dependency of `apps/web` too (checked in 011).
