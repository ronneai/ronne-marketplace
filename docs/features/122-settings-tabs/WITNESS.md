# 122 — Witness

Passes by the [state witness](../../knowledge/state-witness.md), newest last.

## Task 1 — `TabLinks` in `components/ui`

Witnessed: 2026-10-15 22:36 EDT, by a fresh agent (blind). Commit: 6937575f plus the working-tree diff. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `TabLinks` exists in `components/ui`: a labelled `<nav>` of links in a `ScrollStrip`, taking `{id,label,href}[]` and the current id | no | confirmed | `TabLinks.tsx:20-37` renders `<ScrollStrip label=…>` with one `next/link` per tab; `ScrollStrip.tsx:85` renders `<nav aria-label={label}>` without a tablist role |
| 2 | The current tab alone has `aria-current="page"`, with an underline | no | confirmed | `TabLinks.tsx:30` sets it only when `tab.id === current`; class `aria-[current=page]:border-accent` is the underline; test "marks only the current tab" counts exactly 1 |
| 3 | 44px tall on a coarse pointer, and scrolls sideways | no | confirmed | `stripTab` contains `pointer-coarse:min-h-11` and `TabLinks.tsx` applies it; `ScrollStrip` supplies the scroll and fades (scrolling not checked in a browser) |
| 4 | It is a set of links, not ARIA tabs; `Tabs` is kept | no | confirmed | no `role="tab"` or `tablist` in `TabLinks.tsx`; `git diff` doesn't touch `Tabs`; `index.ts` still exports it |
| 5 | Component tests cover the links, the single current tab, an unknown current id and the coarse-pointer class | no | confirmed | `TabLinks.test.tsx` has 4 tests, one per case; `vitest run` → all pass (the coarse-pointer test checks the class string, not a rendered height) |
| 6 | Exported from `ui/index.ts` | no | confirmed | `git diff`: `export { TabLinks } from "./TabLinks";` |
| 7 | Added to the styleguide; the styleguide test passes | no | confirmed | `Styleguide.tsx` diff adds `<TabLinks label="Link tabs" …>` after `Tabs`; `vitest run src/features/styleguide` → 2 passed |
| 8 | No lint or type findings in the files this task changes | no | confirmed | `tsc --noEmit` in apps/web → clean; `biome check src/components/ui src/features/styleguide` → one warning, in `data-table/DataTable.tsx:15` (unused `isFiltered`), a file the diff doesn't touch and which was already there |

**Overall:** met.
