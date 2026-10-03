# 071 — Catalogue, item page and Documentation on phones

> Milestone: M10 · Depends on: 066, 067, 068, 069, 070, 018, 044, 045, 047 · Design: [018](../018-catalogue/SPEC.md), [045](../045-item-overview-dashboard/SPEC.md) · Contracts: none new

## Goal

Finding and reading items is what most people will do from a phone: someone sends a link to an
item, or wants to check what a skill does before installing it at their desk. The reading pages
mostly hold up, but a few things break them:
- **The dependency canvas.** On the Overview it is 416px tall and catches every swipe, so the page
  stops scrolling. With three or more dependencies, fitting it to a 343px box shrinks the names to
  about 5px.
- **The catalogue's Scope select.** It is as wide as its longest option, so a long scope pushes the
  page sideways.
- **The type chips.** All 11 types and "All" are always shown, about 170px of chips before the
  first result.
- **The install command.** It is clipped behind a hidden scrollbar.
- **Risk flags.** A long URL in a risk flag can widen the card.

This feature fixes the home page, catalogue, item page and Documentation for phones.

## Scope

**In:**
- **Home** (`HomeView.tsx`): checked by the sweep; fix whatever it finds.
- **Catalogue** (`CatalogueView.tsx`, `ItemCard.tsx`):
  - The Scope select is full width below `sm` and never wider than its container
    (`max-w-full min-w-0`).
  - The type chips and sorts are already a Filters panel and a Sort menu (018, done in 067's
    pull request, owner 2026-10-02); check the panel on a phone (it takes the content's width and
    lists the types in one column).
  - The card's meta line wraps (`break-words`).
  - The install command wraps (067's `CopyableCommand` default).
- **Item page shell** (`ItemPageView.tsx`): the breadcrumb breaks long names. The tabs use 066's
  `ScrollStrip`. The README panel uses `p-4` below `sm`.
- **Overview** (`OverviewTab.tsx`):
  - The Install card's commands wrap below `sm`, and the quick-flag chips are 44px on a coarse
    pointer.
  - Risk-flag `<code>` values break (`break-all`) in `IssueList` and `RiskSummary`, and the grid
    tracks are `minmax(0,1fr)`.
  - Order on phones: install and stats first, then what it can do, then the canvas or list, then
    the sidebar cards. This is already mostly the stacking order; check it against the mockup's
    priorities.
- **The read-only dependency canvas** (`components/dependency-canvas`, used by the Overview):
  - **Below `md`** the Overview shows the dependency list (it already exists under the canvas) and a
    "View as graph" button. The button opens the canvas in a full-screen sheet, where pan and pinch
    zoom are expected and nothing else scrolls. The MiniMap is off in the sheet. The zoom controls
    are 44px.
  - **From `md` with touch:** the page scroll is never trapped. One finger scrolls the page
    (`panOnDrag` is off on a coarse pointer), and two fingers pan and zoom (`zoomOnPinch`, and
    `panOnScroll` is off). Wheel zoom needs Ctrl or ⌘ (`zoomActivationKeyCode`). Today the wheel
    zooms, which also traps desktop trackpads. A "Use two fingers to move the graph" line shows
    the first time a single-finger drag happens on it.
  - The fitted zoom never goes below 0.6. If the graph doesn't fit at 0.6, it starts at 0.6 centred
    on the item node, with "Fit" in the controls.
- **Usage charts** (`UsageCard.tsx`): the breakdowns are one column below `sm` and two from `sm`.
  The third breakdown spans the width on tablets instead of sitting alone. Tapping a bar shows its
  value (068).
- **Works in** (`ToolsPanel.tsx`): already responsive; the sweep only checks it.
- **Versions page**: the table moves to 069's stacked rows (done there). The tag controls'
  dialogs are full screen (067).
- **Documentation** (`docs/layout.tsx`, `DocsNav`, `content.tsx`, `TypesExplorer.tsx`):
  - The topic strip has group labels and scrolls the active topic into view (066).
  - The 3-column tables scroll inside their frame (069).
  - `TypesExplorer`'s tool cards stack below `md` and show full paths (068).
  - `Example` blocks wrap long commands below `sm`, keeping the `pre` scroll for JSON.
  - An "On this page" select at the top of long topics below `md`, built from the topic's
    sections in `topics.ts`.
- **Styleguide**: swatches use 2 columns below `sm` and 4 from `sm`, and labels never overflow.

**Out** (and where it goes instead):
- Editing the canvas: 072 (the composer).
- New catalogue features (saved filters, infinite scroll): out of M10. The pager stays.

## Behaviour

- **Phone, catalogue:** search (full width), then Filters and Sort, the active filters under them,
  then results. The first result shows without scrolling on a 667px-tall phone.
- **Phone, item Overview with 5 dependencies:** the list of the 5, each a link with its range, and
  "View as graph". The sheet shows the graph at a readable zoom, and pinch zooms it.
- **Tablet, Overview:** the canvas is inline. Swiping over it scrolls the page, and two fingers
  move the graph.
- **Desktop, trackpad:** scrolling over the canvas scrolls the page. Ctrl/⌘ and the wheel, or a
  pinch, zoom it.

## Edge cases

- **An item with no dependencies:** no canvas and no button, as today.
- **An item with 30+ dependencies** (a bundle): the list is the main view on phones. In the sheet
  the graph starts at 0.6 on the item node.
- **Docs topic with one section:** no "On this page" select.

## Documentation

- **Items and types › "Composing on a canvas"** and **"Reading an item before you install it"**:
  on a phone the dependencies show as a list, with "View as graph" for the canvas. On a touch
  screen, two fingers move the graph. With a mouse, Ctrl/⌘ and the wheel zoom it.
- **Helpers:** none change.

## Acceptance criteria

- [ ] The catalogue with a 64-character scope doesn't scroll sideways on a phone (sweep, with a
  seeded long scope).
- [ ] On a phone the Filters panel and Sort menu fit the screen and keep 018's URL parameters
  (`catalogue.mobile.e2e.ts`).
- [ ] On a phone, swiping over the Overview never pans a graph. The list and "View as graph" are
  there, and the sheet pans and zooms (`item.mobile.e2e.ts`).
- [ ] On the tablet project a one-finger drag over the canvas scrolls the page. On desktop a plain
  wheel scrolls the page (e2e on both).
- [ ] The canvas's starting zoom is never below 0.6 (unit test on the layout helper).
- [ ] Risk flags with a 200-character URL don't widen the page (sweep, with a seeded item).
- [ ] Long docs topics have "On this page" below `md` (docs render tests).
- [ ] The Documentation lines above describe the phone, touch and mouse behaviour.
- [ ] The sweep's `EXPECTED_FAILURES` entries for 071 are gone.

## Decisions

Owner, 2026-10-02:

- **Ctrl/⌘ plus the wheel zooms the canvas on desktop**, as embedded maps do, so a trackpad scroll
  over it scrolls the page. The controls' +/− still zoom without a key.

## Open questions

- None.
