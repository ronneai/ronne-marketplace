# 069 — Tables on phones

> Milestone: M10 · Depends on: 065, 067, 068, 060, 061, 062, 063 · Design: [060](../060-server-data-table/SPEC.md) · Contracts: none new

## Goal

The shared `DataTable` (060) is `table-fixed w-full`, and pages give most columns a fixed width.
When those widths add up to more than the screen, the one column without a width (the item name,
the email) shrinks to almost nothing: on a phone, My submissions, the review queue and Admin ›
Users show rows with no readable name, and Users and the queue's To release tab break on a 768px
tablet too. The plain `Table` pages (versions, access tokens) put their actions in a last column
that starts off-screen. This feature gives every table a layout that works on a phone: each row
becomes a stacked card below `sm`, and the main column never starves at any width.

## Scope

**In:**
- **Stacked rows below `sm`** in `DataTable`. Each row renders as a block (still one `<tr>`, cells
  as `display: block`/grid, so the table keeps its semantics for screen readers):
  - the **primary column** (new `primary: true`, exactly one per table) as the row's heading line,
    full width, wrapping, never truncated;
  - the **select checkbox**, when there is one, at the start of the heading line;
  - other columns as `Label value` lines (the label is the column header, or `srHeader`), in
    the column order, unless the column says `mobile: "hide"` (replaces `hideOnMobile`) or
    `mobile: "meta"` (joined into one muted line under the heading, e.g. type · updated);
  - the **actions column** as a row of buttons at the bottom, wrapping, 44px targets.
  Sorting stays in the filter bar (a "Sort" select next to the search below `sm`, since there are
  no headers to tap); the pager is as today.
- **No starving column from `sm` up.** The primary column gets a minimum width (`min-w-48`); when
  the fixed widths plus that minimum don't fit, the table scrolls inside its frame (the frame
  already scrolls) rather than squeezing it. Columns can also say `hideBelow: "md" | "lg"` for the
  tablet range, so Users and the To release tab fit at 768 without scrolling.
- **Every `DataTable` page** gets its `primary` and `mobile` settings: My submissions, review queue
  (all tabs), Admin › Users, Admin › Scopes, Audit log.
  - Users' three row actions stay buttons (the reason there's no dropdown is in
    `UserRowActions.tsx`); stacked, they wrap under the row.
  - The audit log: the whole row stays the link to the event dialog; the time becomes `meta`.
- **The plain `Table` pages with actions** move onto the same stacked-row rendering (a
  `StackedTable` mode of `Table`, sharing the cell renderer with `DataTable`): the versions table
  (`VersionsTab.tsx`: version as primary, tags and dates as meta, size and hash as lines, the
  Deprecate and Yank buttons at the bottom) and access tokens (`TokensPage.tsx`: name as primary,
  Revoke at the bottom). The bulk lists inside dialogs (bulk approve, bulk release) use it too.
- **Prose tables** in the Documentation (`content.tsx`'s 3-column tables, the item page's
  Dependencies tab, `ProposalChanges`'s before/after) get a minimum column width so they scroll
  inside their frame instead of wrapping word by word; the before/after table stacks below `sm`
  (field, then before, then after).

**Out** (and where it goes instead):
- Changing what a table shows or how it sorts and filters: unchanged from 060–063.
- Row swipe actions: not a web convention people expect, and hard to make accessible.

## Behaviour

- **Phone, My submissions:** each row reads `☐ @team/code-reviewer` / `skill · 2 Oct, 14:05` /
  `Status  Draft · Ready` / `[Submit] [Withdraw]`. Bulk submit selects by the checkbox at the
  start of the heading.
- **Phone, review queue, Needs review:** `☐ @team/lint-rules` / `rule · by ana · 1 Oct` /
  `[Approve] [Request changes] [Reject]`.
- **Tablet 768, Admin › Users:** Name and Created are hidden (`hideBelow: "lg"`), Email, Role,
  Status and actions fit.
- **Desktop:** unchanged, except a table whose fixed widths exceed the column scrolls rather than
  hiding the name (only at the narrow end of `lg`).

## Edge cases

- **A column with a sort but `mobile: "hide"`:** still in the Sort select below `sm`.
- **Empty values** (no approver yet): the line is left out, not shown as "Approver —".
- **The heading is a link and the row is a link** (audit log): one link, the heading's; the
  stretched-link `after:` stays inside the card.
- **Very long names without hyphens:** the heading breaks anywhere (`break-all` on mono names).
- **Selection with Shift+click** (if any page has it): unchanged on desktop; not offered on phones.

## Documentation

None: tables show the same things in another layout. The table's Sort select below `sm` is
self-explanatory and labelled.

## Acceptance criteria

- [ ] Every `DataTable` has exactly one `primary` column (a type-level check plus a unit test).
- [ ] Below `sm`, rows render stacked with heading, meta, labelled lines and actions (unit tests on
  `DataTable` and `Table`'s stacked mode).
- [ ] From `sm` up, the primary column is never narrower than its minimum; the table scrolls
  instead (unit test on classes; tablet e2e on Users and To release).
- [ ] My submissions, the queue, Users, Scopes, Audit log, Versions and Access tokens pass the
  sweep on phone and tablet, with every row's name readable and actions on screen
  (`tables.mobile.e2e.ts`: submit, approve, revoke a token and yank a version from a phone).
- [ ] The Sort select works below `sm` and keeps the URL parameters of 060.
- [ ] The sweep's `expectedFailures` entries for 069 are gone.

## Decisions

Owner, 2026-10-02:

- **Stacked cards, not a sideways scroll with a sticky first column:** the scroll would hide every
  row's actions off to the right.

## Open questions

- None.
