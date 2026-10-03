# 072 — Writing items on a phone

> Milestone: M10 · Depends on: 067, 068, 070, 071, 012, 031, 052, 057 · Design: [012](../012-submission-editor/SPEC.md), [031](../031-visual-composer/SPEC.md) · Contracts: none new

## Goal

Writing an item is mostly a desk job, but people fix a typo, answer a reviewer's "request
changes", or submit a ready draft from their phone. Today on a phone:
- **New item.** The Create draft button sits below the whole type list and a 24rem preview.
- **The draft editor's file tree** is open above the editor.
- **Save and Submit** are at the top of a page that grows with the file.
- **The manifest form's map rows** squeeze three inputs into about 110px each.
- **The dependency picker's** fixed-width version control leaves about 100px for the name.
- **The composer canvas** fills the screen and catches every swipe, and its drag-and-drop doesn't
  work with touch.
- **Unsaved edits are lost.** iOS Safari ignores `beforeunload`, so unsaved edits are lost when the
  tab is discarded.

This feature makes the whole draft flow work on a phone: create, edit, fix, submit, withdraw.
The canvas is for viewing there.

## Scope

**In:**
- **New item** (`NewDraftForm.tsx`):
  - Below `lg`, a sticky bottom bar holds the chosen type and **Create draft** (safe-area padded),
    so the action is always in reach.
  - The template preview is collapsed behind "Preview template" below `sm`.
  - Section padding is `p-4` below `sm`.
- **Draft editor layout** (`DraftEditor.tsx`):
  - **A sticky bottom action bar below `lg`:** the unsaved mark, **Save**, **Submit** and a "More"
    menu (Settings, Withdraw, Upload, Import .zip). It replaces the header's buttons below `lg`.
    From `lg` the header stays as today.
  - **The file tree** below `lg` becomes 070's Files bar and sheet, and the current file shows
    right away. Today a `<details>` is open by default.
  - **The view switcher** (Form, File, Canvas) is a `ScrollStrip` with 44px tabs. Below `md` the
    editor opens on **Form**, since the form is the easiest to edit with a thumb. The last-used
    view is remembered per device, in `localStorage`, as a convenience.
- **CodeMirror on phones** (`CodeEditor.tsx`):
  - 16px (from 067).
  - Line numbers are hidden below `sm`, with a toggle in the More menu.
  - The `@` mention list fits the screen width.
  - The editor stays editable: the text editor is the only way to change body files, and a phone
    keyboard can do it.
- **The manifest form** (`ManifestForm.tsx`):
  - Map rows (key, value, remove) stack below `sm`: key and value full width, remove on the key
    line.
  - Nested groups lose a level of padding below `sm`.
- **The dependency picker** (`DependencyField.tsx`):
  - Below `sm` each row stacks: the name and status on the first line, the version range control
    full width on the second.
  - The remove button gets a 44px target.
  - The search results list fits the screen.
- **The composer below `md`** (`ComposerView.tsx`, `DraftEditor.tsx`):
  - The Canvas view shows the dependency list (`DependencyPanel`) and the catalogue picker with
    its **Add** buttons. Everything the canvas does except positioning can be done there already.
  - A "View as graph" button opens the canvas read-only in a full-screen sheet, like 071.
  - Positions are not edited on phones. A note in the view says so: "Arrange the graph on a larger
    screen".
  - From `md`, the canvas is editable as today. With touch it uses 071's rules, so one finger moves
    a node and two fingers pan. The picker's drag-and-drop works with touch through pointer
    events, or the Add button is the way.
- **Validation** (`components/validation`): the summary chip and the file issue icons have 44px
  targets. The issues popover is full screen below `sm` (067).
- **Submit, withdraw, archive, delete and settings dialogs:** full screen below `sm` (067), with
  their buttons in the footer.
- **My submissions on a phone:** the stacked rows and bulk submit come from 069. Bulk release
  comes in 073.
- **Unsaved work on iOS:** a local recovery copy.
  - While a draft has unsaved changes, the editor keeps them in `localStorage` (keyed by user and
    draft, debounced, text only).
  - On opening the draft again, if a recovery copy is newer than the saved draft, a notice offers
    **Restore** or **Discard**.
  - The copy is deleted on save, on discard, and on sign-out.
  - The guard also listens to `pagehide`, to write the copy before the tab is suspended.

**Out** (and where it goes instead):
- Uploading files from the phone's camera or photos: the file picker already accepts files, and an
  item's files are text.
- Editing canvas positions on phones: not offered (see above).
- Offline editing: out of M10.

## Behaviour

- **Phone, reviewer requested changes:** the person opens the link, the reviewer's message is at
  the top (058), and the editor is on Form. They change the description and tap **Save**, then
  **Submit** in the bottom bar.
- **Phone, fixing a typo in `SKILL.md`:** they tap the Files bar, then `SKILL.md`. The text editor
  opens at 16px. They edit and tap **Save**.
- **Phone, the Canvas view:** the list of dependencies with their ranges, the catalogue search with
  **Add**, and "View as graph".
- **The tab is killed while editing** (iOS): reopening the draft shows "Unsaved changes from 14:05
  on this device. Restore / Discard".

## Edge cases

- **The keyboard is open:** the bottom bar sits above it, not over the field. It's in the page
  flow at the bottom of the viewport (`position: sticky` in a `100dvh` layout), and on iOS
  `visualViewport` resize events adjust its offset.
- **A recovery copy for a draft that was since submitted or archived:** the copy is discarded
  without asking, because the draft can't be edited.
- **A recovery copy on a shared computer:** it's in the browser of the person who signed in,
  keyed by their user id, and sign-out deletes it. The notice says "on this device".
- **The recovery copy is larger than `localStorage` allows:** it's skipped, and a muted line says
  unsaved changes aren't kept on this device.
- **Rotating to landscape on a phone (up to 915px, below `lg`):** the bottom bar stays. The
  canvas, from `md`, becomes editable. That's intended: a landscape tablet-sized screen can
  arrange nodes.

## Documentation

- **Items and types › "Composing on a canvas"** (`content.tsx`, "dragging it onto the canvas
  puts it where you…"): add that on a phone the Canvas view lists the dependencies with **Add**,
  and arranging the graph needs a larger screen.
- **A new section in Submitting and review › "Statuses"**, or the editor's help: "Unsaved changes
  are kept on this device until you save" (one sentence where the editor's saving is explained;
  find the right section).
- **Helpers:** the `canvas` helper (if any) gets the same sentence about phones.

## Acceptance criteria

- [ ] On a phone, a member creates a skill, edits its description on Form, edits `SKILL.md` in the
  text editor, saves and submits, without scrolling to find a button (`authoring.mobile.e2e.ts`,
  on Chromium and WebKit).
- [ ] Below `md` the Canvas view adds a dependency with **Add** and shows the graph read-only in
  the sheet (e2e).
- [ ] Map rows and dependency rows stack below `sm` (unit tests).
- [ ] A recovery copy is written on change and on `pagehide`, offered when newer, and deleted on
  save, discard and sign-out (unit tests; an e2e reloads with unsaved changes and restores).
- [ ] Every dialog in the flow keeps its buttons on screen with the keyboard open (WebKit e2e).
- [ ] The Documentation lines above describe the Canvas view on phones and the recovery copy.
- [ ] The sweep's `expectedFailures` entries for 072 are gone.

## Decisions

Owner, 2026-10-02:

- **A local recovery copy in `localStorage`:** draft text stays in the person's browser until save,
  discard or sign-out, rather than accepting that iOS loses unsaved edits.
- **The canvas isn't editable on phones** (below `md`): the list with **Add** does everything but
  positioning, and the graph opens read-only.

## Open questions

- None.
