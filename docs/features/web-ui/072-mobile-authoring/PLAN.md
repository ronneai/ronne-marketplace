# 072 — Plan

> Spec: [SPEC.md](./SPEC.md)

> **Since [088](../088-docs-on-website/SPEC.md) (2026-10-05)** the Documentation is on the website, from
> `../ronne-web` (`www/src/content/docs/`): what this plan says about `content.tsx`, the `/docs`
> pages or their components (`DocsNav`, `TypesExplorer`, the docs render tests) is done there now.

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. New item.** Bottom bar with Create draft, collapsed preview, padding.
  *Done when:* `NewDraftForm` tests pass; e2e creates a draft on a phone.

- [ ] **2. Editor shell.** 067's `BottomBar` (Save, Submit, More), Files bar and sheet from 070, view
  strip, Form by default below `md`, the remembered view.
  *Done when:* `DraftEditor` tests pass; e2e saves and submits on a phone.

- [ ] **3. Form, picker and CodeMirror.** Map rows and dependency rows stacking; line numbers
  toggle; mention list width.
  *Done when:* unit tests pass; e2e edits `SKILL.md` and a map field on a phone.

- [ ] **4. Composer below `md`.** List and picker with Add, "View as graph" sheet, the note; touch
  rules from `md` (071), the picker's drag-and-drop through pointer events.
  *Done when:* e2e adds a dependency on a phone, and drags one in on the tablet project.

- [ ] **5. Recovery copy.** Writing (debounced, `pagehide`), the Restore / Discard notice, deleting
  on save, discard and sign-out, the size limit.
  *Done when:* unit tests cover each path; e2e reloads with unsaved changes and restores them.

- [ ] **6. Validation and dialogs.** 44px targets; dialogs' buttons in the footer.
  *Done when:* the tap-target report has no entries on the editor.

- [ ] **7. Documentation.** "Composing on a canvas", the recovery sentence, the helper.
  *Done when:* the docs render tests pass; the sweep's 072 entries are removed and it passes.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
