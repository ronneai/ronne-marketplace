# 012 — Submission editor

> Milestone: M2 · Depends on: 010, 011 · Design: [MVP §4.1](../../MVP/MVP.md#41-submission-lifecycle-new-item-or-change-proposal), [§8](../../MVP/MVP.md#8-web-application), [§10](../../MVP/MVP.md#10-data-model-mvp), [§12](../../MVP/MVP.md#12-security-considerations) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md)

## Goal

Anyone signed in can draft a new item of any type in the browser: pick a scope, a name and a type,
then fill in a form and edit the item's files, seeing validation problems as they type. This is
M2's core: after it, Ronne holds real items, even before anything is reviewed or released.

## Scope

**In:**
- Migration `0005_submissions`: `submissions` and `submission_files`, and their Kysely types.
- A `submissions` domain (MVP §9.2): model, repository, services and actions for drafts.
- **New draft:** scope, name and type, starting from a template for the type.
- **The editor:** a form for the manifest, a file tree, a code editor (CodeMirror 6), and live
  validation with 011.
- **Files:** create, rename, delete, upload single files, and import a `.zip` of a whole item.
- **My submissions:** a list of your own drafts and submissions, with their status.
- Deleting a draft that was never submitted.
- A permission `submissions.create` (every role) in the permission map.

**Out:**
- Submitting and withdrawing, and the registry checks → 013.
- Change proposals to an existing item (a base version, a diff, stale and rebase) → 017. M2 drafts
  are always new items.
- The visual composer → M6 (027+). The dependency list is edited in the form here.
- Showing risk flags → 014 (reviewers see them). The editor only shows validation issues.
- Uploading from the CLI or the API: authoring is web-only in the MVP (MVP §11).
  *2026-09-30:* M7 adds it after the MVP: `POST /api/v1/drafts` ([037](../037-draft-upload-api/SPEC.md)) creates a draft from `rmk export` or the MCP server; editing and submitting it stay here.

## Behaviour

**Tables** (migration `0005_submissions`, the 002 portability rules):

`submissions`:

| Column | Type | Notes |
|---|---|---|
| `id` | ULID | |
| `author_id` | ULID | FK → `user` (**RESTRICT**: users are disabled, never deleted) |
| `scope_id` | ULID | FK → `scopes` (**RESTRICT**) |
| `name` | `varchar(64)` | The item's name without the scope |
| `type` | `varchar(32)` | Fixed when the draft is created |
| `item_id` | ULID, nullable | Always null in M2: new items only. 017 fills it for change proposals |
| `base_version_id` | ULID, nullable | Always null in M2 (017) |
| `status` | `varchar(24)` | `draft` in this feature; 013 adds the rest (MVP §4.1) |
| `created_at`, `updated_at`, `submitted_at` | timestamps | `submitted_at` is set by 013 |

Indexes on (`author_id`, `status`) and (`scope_id`, `name`). The manifest isn't a column: it's the
`ronne.yaml` file, so there's exactly one copy of it.

`submission_files`:

| Column | Type | Notes |
|---|---|---|
| `submission_id` | ULID | FK → `submissions`, **ON DELETE CASCADE** |
| `path` | `varchar(255)` | Relative, validated by 011's path rules. PK (`submission_id`, `path`). Compared exactly: a new `columnTypes.exactString()` gives MySQL a binary collation, whose default ignores case and accents |
| `encoding` | `varchar(8)` | `utf8` for text, `base64` for binary files |
| `content` | long text | Up to 1 MB of file; a new `columnTypes.longText()` helper gives `longtext` on MySQL (whose `text` stops at 64 KB) and `text` elsewhere |
| `size` | integer | Bytes of the file, for the limits |
| `executable` | boolean helper | Only for scripts |
| `updated_at` | timestamp | |

Draft files live in the database (owner decision, 2026-09-27): a save is one transaction, with the
manifest and every file together, and one database backup covers everything. Published packages
still go to the `StorageAdapter` (015). MVP §10's `files_path` is replaced by this table.

**Privacy.** A draft is visible only to its author. Other users, root included, get a 404, so a
draft's existence isn't revealed. (From 013, submitted ones are visible to moderators and root for review.)

**`/submissions`** (My submissions): your drafts and submissions, newest first, with the item name
(`@scope/name`), type badge, status, last change, and a "New item" button.

**`/submissions/new`:**
- **Scope:** a picker listing every scope (010), with a search box and a link to `/scopes`. If no
  scope exists, it says root has to create one first.
- **Name:** 011's name rules, shown as `@scope/name` while typing. It warns (without blocking) if
  you already have a draft with the same name.
- **Type:** the 11 types, each with a one-line description (MVP §3.1), and a note on the high-risk
  ones (hook, mcp-server, permission-policy, statusline, lsp-server: reviewers see a risk flag).
- **Layout** (after the owner's Stitch mock, 2026-09-28, in 032's design system): two numbered
  sections, "Where it lives" (scope chips and the name, with `@scope/` inside the field) and "What
  it is" (type cards with a filter box and Guidance / Runtime & tools / Bundles chips), and a side
  panel that previews the real starter `ronne.yaml`, says whether reviewers will see a risk flag,
  and holds Create. The mock's daemon, tool-compatibility, scaffolding-path and schema-version
  details aren't Ronne's, so they're left out.
- **Create** writes the draft with a **starter template** for the type: a `ronne.yaml` with `name`,
  `type`, a placeholder description and the type block, plus the files it refers to (for example
  `prompt.md` for an agent, or a `SKILL.md` with matching frontmatter for a skill). Templates live
  in `apps/web` and each one passes 011's checks except for the placeholder description.

**`/submissions/[id]`** (the editor):
- **Layout:** a header with the name, type, status and Save; below it, a **file tree** on the left
  and the **editor** on the right. On phones they stack, with the tree collapsible. It's usable on a
  phone, but meant for desktops.
- **The manifest, two ways.** `ronne.yaml` opens as a **form** (a "Form / YAML" switch above it):
  - **Common fields:** description (with a 300-character counter), license (common SPDX ids plus
    other), keywords (up to 10), readme.
  - **The type block's fields, generated from the schema:** paths as a picker of the draft's files,
    enums as selects, lists as rows.
  - **Dependencies:** rows of item name and range, for the types that allow them.

  The form and the YAML are one document: editing either updates the other. The form writes YAML
  with the `yaml` library's document API, so comments and key order in `ronne.yaml` survive. `name`
  and `type` are read-only in the form, and changing them in YAML is a validation error that points
  to the draft's settings.
- **Files:** the tree lists every file with its size. Actions: new file, new folder (a path prefix),
  rename, delete (`ronne.yaml` can't be deleted), mark a script executable, upload files, and
  import a `.zip`. *2026-10-01 (owner):* the **starting files** New item creates for the type
  (`ronne.yaml` and the file it names, such as `SKILL.md`, `prompt.md`, `rule.md`, `command.md`,
  `hook.sh` or `style.md`) are edited but never renamed or deleted: the editor shows "Starting file"
  instead of Rename and Delete, a save that deletes one is refused (`StartingFileError`), and a
  `.zip` that replaces the files keeps the ones it doesn't have. An export (051) still replaces an
  item's files with what the tool has. Text files open in **CodeMirror 6** with YAML, Markdown, shell, JSON, JavaScript
  and TypeScript highlighting, themed with 032's tokens. Binary files show their size and type, and
  can be replaced or deleted, not edited.
- **`.zip` import:** replaces or merges (you choose) the draft's files with the archive's. A single
  top-level folder is unwrapped, and archivers' own files (`__MACOSX/`, `.DS_Store`) are skipped.
  It uses `fflate` on the server, and refuses symlinks, `..`, absolute paths, encrypted entries,
  and anything over the limits, before changing the draft. Replacing with an archive that has no
  `ronne.yaml` is refused.
- **Validation:** a panel under the editor lists 011's issues (errors, then warnings) as you type,
  debounced; clicking one opens the file and line (ronne.yaml's in the YAML view). The same checks run on the server when you save,
  and a draft can be saved while it has errors (a draft is work in progress). 013 refuses to submit
  one.
- **Saving:** the Save button and Ctrl/Cmd+S send the changed files in one server action. The page
  warns before leaving with unsaved changes (any changed, new, renamed or deleted file, or
  executable flag): a link opens the shared `UnsavedChangesGuard` dialog ("Stay on this page" or
  "Leave without saving"), and closing or reloading the tab gets the browser's own prompt. Saving writes the files, bumps `updated_at`, and
  returns the server's issues. There's no autosave in M2. Server actions accept up to 28 MB (a
  full 20 MB draft as base64); `src/proxy.ts` refuses anything over 1 MB outside `/submissions/`
  and without a session cookie, so the larger limit isn't open to anyone else.
- **Limits** (MVP §12, 011's defaults): the header shows the file count and total size against 500
  files and 20 MB, and uploads over 1 MB are refused on the client and again on the server.
- **Draft settings:** rename the item (scope and name; the type stays; `name` in `ronne.yaml` follows, keeping its comments and quoting), or delete the draft. Delete
  asks for confirmation and removes the draft and its files for good (it was never submitted, so
  there's nothing to keep for history).

**Services** (`domains/submissions/services/drafts.ts`): `createDraft`, `listMySubmissions`,
`getDraft` (author only), `saveDraftFiles` (a set of writes and deletes), `importZip`, `renameDraft`
and `deleteDraft`. Each checks `submissions.create` and that the actor is the author, and runs in
one transaction.

**Audit:** drafts are private work in progress, so creating and editing them isn't audited.
013 records submitting and withdrawing. (*2026-09-30:* a draft created with a token will be
audited, with the token's name: [037](../037-draft-upload-api/SPEC.md). Drafts made here stay
unaudited.)

**New dependencies** (each through the checklist): the CodeMirror 6 packages we use
(`@codemirror/state`, `view`, `commands`, `language`, `lang-yaml`, `lang-markdown`, `lang-json`,
`lang-javascript` and `legacy-modes` for shell; MIT), used directly, without a React wrapper.
`fflate` comes from 011.

## Edge cases

- **Two tabs editing one draft:** the last save wins, per file. The save includes each file's
  `updated_at`; if a file changed since it was loaded, the save warns and asks to reload or overwrite.
- **A draft whose scope has no other drafts:** nothing special; scopes can't be deleted (010).
- **Renaming to a name you already use in another draft:** allowed (drafts don't reserve names;
  013 checks open submissions).
- **A huge paste into the editor:** the 1 MB per-file limit applies on save, with a clear message.
- **A `.zip` with its own `ronne.yaml` of another type or name:** imported as is, and the validation
  panel flags the mismatch.
- **Disabled author:** their drafts stay, untouched and invisible to others.

## Acceptance criteria

- [x] `0005_submissions` creates both tables, indexes and table-level foreign keys on all four databases, and `longText()` stores a 1 MB file on MySQL.
- [x] Anyone signed in can create a draft of each of the 11 types from its template, and each template passes 011 apart from its placeholder description.
- [x] Drafts are private: another user, root included, gets a 404 for someone else's draft (page and actions).
- [x] The form and the YAML stay in step both ways, and comments in `ronne.yaml` survive form edits.
- [x] Files can be created, renamed, deleted, uploaded and marked executable; binary files are stored and kept byte-for-byte.
- [x] `.zip` import merges or replaces, unwraps a single top folder, and refuses traversal, symlinks and oversized archives without changing the draft.
- [x] Validation issues from 011 show as you type and after saving, and link to the file and line.
- [x] The limits hold on the client and the server.
- [x] A save that would overwrite a newer version of a file warns first.
- [x] Deleting a draft removes it and its files.
- [x] Playwright: create an agent draft, edit its prompt in CodeMirror, change the description in the form, see a validation error disappear, save, reload, and see the changes.

## Open questions

- None.
