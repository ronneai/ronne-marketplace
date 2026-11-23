# 070 — Plan

> Spec: [SPEC.md](./SPEC.md)

> **Since [088](../088-docs-on-website/SPEC.md) (2026-10-05)** the Documentation is on the website, from
> `../ronne-web` (`www/src/content/docs/`): what this plan says about `content.tsx`, the `/docs`
> pages or their components (`DocsNav`, `TypesExplorer`, the docs render tests) is done there now.

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Headers and tree position.** `break-all`/`min-w-0` in `FileViews.tsx`'s header and
  `FileContent`; tree `sticky` offset and max height from `md`; copy-path button.
  *Done when:* unit tests pass; the tablet project reaches the last file of a 40-file item.

- [ ] **2. The Files bar and sheet.** Below `md` in `FilesBrowser.tsx`; scroll to the file's
  header on pick; changed-file count on the review page.
  *Done when:* `files.mobile.e2e.ts` opens a file from the sheet on an item page and a review page.

- [ ] **3. No nested scroll.** `FileContent`'s source box only from `md`; add the nested-scroll
  check to the sweep.
  *Done when:* the sweep's nested-scroll check passes on the item and review pages.

- [ ] **4. Compact diffs.** One number column below `sm`, the toggle.
  *Done when:* unit tests cover both modes.

- [ ] **5. Documentation.** The two sections in `content.tsx`, if they describe the layout.
  *Done when:* the docs render tests pass; the sweep's 070 entries are removed and it passes.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
