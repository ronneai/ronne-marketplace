# 070 — Files, code and diffs on phones

> Milestone: M10 · Depends on: 065, 067, 068, 044, 014 · Design: [044](../044-item-contents/SPEC.md), [014](../014-review-queue/SPEC.md) · Contracts: none new

## Goal

The Files viewer is shared by the item page (044) and the review page (014). On a phone the whole
file tree sits above the file, and tapping a file changes the content far below without scrolling
to it, so nothing visible happens. The source viewer is a box 70% of the screen high that scrolls
inside the page, which traps the thumb. On tablets and up the tree's `sticky top-4` slides under
the 56px header. Diffs spend about 100px of a 343px column on line numbers, and a long path in a
diff header is clipped. This feature makes reading files and diffs work on a phone.

## Scope

**In:**
- **The tree on phones** (`FilesBrowser.tsx`, below `md`): a "Files (n) · current/path.md" bar
  above the content that opens the tree as a full-screen sheet (067's `Dialog`). Picking a file
  closes the sheet and shows the file, scrolled to its header. With one file, no bar.
- **The tree from `md`:** `sticky` below the header (`top-[4.5rem]`, the same offset as the docs
  sidebar), with a max height of the viewport minus the header and its own scroll, so a long tree
  shows its end.
- **No nested scroll on phones** (`FileContent.tsx`): below `md` the source viewer grows with the
  file (the page scrolls), as the draft editor already does; from `md` the `max-h-[70vh]` box stays.
- **Compact diffs below `sm`** (`FileViews.tsx`): one line-number column (the new line's, or the
  old line's for a removed line) of 2.5rem, the `+`/`−` sign kept, so code gets about 290px. A
  "Line numbers" toggle restores both.
- **Diff and file headers** wrap and break long paths (`break-all`, `min-w-0`) instead of clipping.
- **`FileTree` rows** are 44px on a coarse pointer (from 067) and names wrap instead of truncating
  on phones (from 068).
- **Copying a file's path** (header): a copy button next to the path, as people on a phone can't
  select a path easily.

**Out** (and where it goes instead):
- Side-by-side diffs: the app's diffs are unified; no change.
- The draft editor's own file tree and CodeMirror editing: 072.
- Syntax colours: unchanged (044).

## Behaviour

- **Phone, item page Files tab:** a bar "Files (6) · SKILL.md". Tapping it lists the tree full
  screen; tapping `scripts/run.sh` closes it, shows the file, and scrolls to its header. The URL
  changes as today (`?file=`), so back returns to the previous file.
- **Phone, review page:** the changed files bar shows how many changed ("Files (6) · 2 changed");
  the tree marks changed files as today. Diffs use one number column.
- **Tablet and desktop:** side by side as today; the tree stays under the header and scrolls.

## Edge cases

- **A file too large to show** (the existing "too large" notice): same notice; the bar still lists it.
- **Binary files:** as today.
- **Deep trees** (indentation at depth 6+): indentation is capped on phones at 4 levels, deeper
  levels show the path's parent in muted text instead.
- **No JavaScript:** the tree is a plain list of links above the content, as today.

## Documentation

- **Items and types › "Reading an item before you install it"** (`content.tsx`): if it describes
  the tree "on the left", add that on a phone the files are listed behind the Files bar.
- **Submitting and review › "What reviewers look at"**: same, for the review page's diff.

## Acceptance criteria

- [ ] On a phone, choosing a file from the Files bar shows it on screen (`files.mobile.e2e.ts`
  on an item page and a review page).
- [ ] From `md` the tree stays below the header and its last file can be reached (tablet project).
- [ ] Below `md` there's no nested vertical scroll in the file view (sweep check: no element with
  `overflow-y: auto|scroll` and a scroll height larger than its client height, outside dialogs).
- [ ] Below `sm` a diff has one line-number column; the toggle restores two (unit test).
- [ ] Long paths in file and diff headers wrap (unit test; sweep).
- [ ] The Documentation lines above match the phone layout.
- [ ] The sweep's `expectedFailures` entries for 070 are gone.

## Open questions

- None.
