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

- [x] **5. My submissions and New item.** `/submissions` and `/submissions/new` (scope picker,
  name, type with descriptions and risk notes).
  *Done when:* render and action tests pass.

- [x] **6. The editor: files and code.** `/submissions/[id]` with the file tree, CodeMirror 6
  (dependency checklist in Notes, themed with 032's tokens), uploads, save with Ctrl/Cmd+S, the
  unsaved-changes warning, the limits in the header, and binary files.
  *Done when:* render tests pass, and Playwright edits a file, saves and reloads.

- [x] **7. The editor: form and validation.** The form generated from the schema, kept in step
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
- **Task 5 (2026-09-27): My submissions and New item.**
  - `features/submissions/`: `SubmissionsTable` (item, type, status, last change in UTC; an empty
    state that explains drafts), `NewDraftForm` and `createDraftFromForm`, which opens the editor.
  - The scope picker is a radio list with a search box once there are more than 6 scopes. The page
    collects every page of `listScopes` (capped at 20 pages of 50): root creates each scope, so
    there are few. With no scope, the page says root has to create one first.
  - The name shows `@scope/name` as you type, and a note (not an error) when you already have a
    draft with that name. The 11 types show MVP §3.1's one-liners, and hook, mcp-server,
    permission-policy, statusline and lsp-server carry a `RISK:` note.
  - "Submissions" joins the main nav for everyone signed in (`submissions.create`). With it, the
    header overflowed at 375px and hid the account menu, so the nav now scrolls sideways on
    phones while the theme switch and account menu stay in place (checked at 375 and 320px).
- **Task 6 (2026-09-27): the editor, files and code.**
  - **The dependency checklist** (policy §3), all from the CodeMirror project, MIT, with no install
    scripts:

    | Package | Version | Released |
    |---|---|---|
    | `@codemirror/state` | 6.7.6 | 2026-09-22 |
    | `@codemirror/view` | 6.43.13 | 2026-09-22 |
    | `@codemirror/commands` | 6.11.1 | 2026-09-15 |
    | `@codemirror/language` | 6.12.4 | 2026-06-25 |
    | `@codemirror/lang-yaml` | 6.1.3 | 2026-03-24 |
    | `@codemirror/lang-markdown` | 6.5.2 | 2026-08-04 |
    | `@codemirror/lang-json` | 6.0.2 | 2025-06-19 |
    | `@codemirror/lang-javascript` | 6.2.5 | 2026-03-02 |
    | `@codemirror/legacy-modes` | 6.5.4 | 2026-09-02 |
    | `@lezer/highlight` | 1.2.4 | 2026-09-24 |

    `@lezer/highlight` is direct because the theme needs its `tags`. They bring 16 more packages,
    all MIT and from the same project (`@lezer/*`, `@codemirror/autocomplete`, `lint`,
    `lang-html`, `lang-css`, `crelt`, `style-mod`, `w3c-keyname`, `@marijn/find-cluster-break`).
    `pnpm licenses:check` and `pnpm audit` pass, and the lockfile passes pnpm's supply-chain checks.
  - `features/draft-editor/`: `files.ts` is the file state as a pure reducer (edit, put, rename,
    remove, executable, saved). Saved files that are deleted or renamed away are kept with their
    `loadedAt` for the stale check, and a file created again at their path takes it back. A save
    marks a file clean only if it didn't change while the save was on its way.
  - `CodeEditor` uses CodeMirror directly, with one `EditorState` per file (so undo survives
    switching files), a theme on 032's CSS variables (light and dark), and languages by extension
    or shebang. Outside changes to a file (the form in task 7, imports) replace its document as one
    undoable change.
  - Uploads and binary files: `toDraftContent` decides text or base64 in the browser, and files
    over 1 MB are refused there before the server refuses them again. Binary files show their size
    and can be replaced or deleted. `.zip` import, and renaming or deleting the draft (Settings),
    need the editor to be saved first, and then reload it: the page keys the editor on the draft's
    `updatedAt`.
  - The save action revalidates nothing: in a server action, `revalidatePath` also refreshes the
    current page, which remounted the editor and lost the cursor and undo history (the e2e test
    caught it).
  - **Body size:** Next.js limits server actions to 1 MB. `next.config.ts` raises it to 28 MB (a
    full 20 MB draft as base64), and `src/proxy.ts` answers 413 to any body over 1 MB unless it's
    for `/submissions/…` with a session cookie (`bodyTooLarge` in `route-guard.ts`, tested).
  - Unsaved changes: the browser's prompt on close or reload, and a confirm for links in the app.
  - Playwright (`e2e/drafts.e2e.ts`): root creates a scope; a user creates an agent draft, edits
    `prompt.md` in CodeMirror, saves with Ctrl/Cmd+S, reloads and sees it; root gets a 404.
- **Task 7 (2026-09-27): the form and validation.**
  - `manifest-yaml.ts`: `writeField` changes one field through the `yaml` document API. A scalar
    changes in place (keeping its quotes and comment); a list or mapping is replaced, keeping its
    flow style and comments; an emptied optional field is removed. It prints with `lineWidth: 0`
    and no flow padding, so untouched lines stay as written: a test rewrites the description of
    every example and template and checks that only that line changed.
  - `manifest-fields.ts` generates the type block's fields from the schema: `relPath` becomes a
    file picker (a missing file is marked), enums become selects, `toolName` a text box with
    suggestions, arrays become rows, objects groups, and `headers` key/value rows. The common
    fields (description with its 300 counter, license with common SPDX ids plus other, keywords up
    to 10, readme) and dependencies (for bundle, agent, skill and command) are fixed.
  - `ManifestForm` reads ronne.yaml on every change, so the form and the YAML are one document.
    With a YAML error, the form points to the YAML view. `name` and `type` are read-only.
  - The Problems panel runs `validateDraft` in the browser, 300 ms after typing stops. Clicking a
    problem opens its file, switching ronne.yaml to the YAML view, and moves to its line. After a
    save, the status line says whether errors are left to fix before submitting.
  - `IssueList` moved to `components/validation/`, since the styleguide demo and the editor both
    use it.
  - Playwright covers the acceptance scenario: the template's one problem, the prompt in
    CodeMirror, the description in the form, the problem gone, the YAML with its comments, save,
    reload, and root's 404.
- **New item redesign (2026-09-28, owner's mock `submissions-new-item.ai`).** The same form,
  reorganised with the design system: numbered section panels; scope chips (a search box from 9
  scopes) with the chosen scope's description; the name field with the `@scope/` prefix and a
  check when valid; type cards with a tag, a `risk` badge on the five high-risk types, a filter
  box and group chips; and a sticky side panel with the starter `ronne.yaml` from `draftTemplate`
  (the real template, not a mock), the other starter files, the review note, and Create. New
  tokens `--code-bg`, `--code-fg` and `--code-muted` (Ink block, Paper text, both themes) are in
  `tokens.css`, with their contrast checked in `tokens.test.ts`. Sections are titled "Where it
  lives" and "What it is", so the Name field's label stays unique. Left out: the mock's daemon
  status, tool compatibility, scaffolding path, `version`/`permissions` fields and schema version,
  which Ronne doesn't have.
- **Leaving with unsaved changes (2026-09-28, owner's request).** The editor used `window.confirm`
  for links, which looked like the browser's, not the app's. `components/ui/UnsavedChangesGuard`
  is a shared component: give it `dirty` and, while it's true, a plain click on a link (not a new
  tab, a download, or this page) opens a design-system `Dialog` instead, and "Leave without saving"
  continues there (`router.push` inside the app, a full load outside it). Closing or reloading the
  tab still gets the browser's prompt, since browsers don't allow a custom one. The editor passes
  `isDirty` of its whole file state. The stale-save notice's "Reload" now uses `router.refresh()`,
  which remounts the editor with the saved draft without a browser prompt. Tested in `leavingHref`
  unit tests and in Playwright (stay, then leave). Not covered: the browser's Back button, which
  Next.js handles itself and can't be cancelled.
