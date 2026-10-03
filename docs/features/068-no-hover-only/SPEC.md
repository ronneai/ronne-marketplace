# 068 — Nothing behind hover

> Milestone: M10 · Depends on: 065, 067, 049, 050 · Design: [032](../032-design-system/SPEC.md) · Contracts: none new

## Goal

Some answers are only in a `title` tooltip, which a phone never shows: why a button is disabled
(Submit, Publish, a decision on your own submission), the UTC time behind every local timestamp
(049), the full text of a truncated cell, the full sha256 of an older version, the tool paths in
the Documentation's types list, the stale badge's explanation. A person on a phone sees a greyed
button and no reason. This feature makes each of them reachable by a tap and by the keyboard, and
adds a check so new ones don't appear.

## Scope

**In:**
- **Disabled reasons** (`Button`'s `disabledReason`, and the hand-made ones in `BulkSubmit`,
  `BulkApprove`, `PublishDialog`, `DraftEditor`, `DecisionBar`): a disabled button with a reason
  gets a small info button right after it (the `HelpTip` trigger, 44px tap area on a coarse
  pointer) that opens the reason in a popover. On a fine pointer the hover `title` stays too. The
  `sr-only` copy stays. Where a row of disabled checkboxes each has a reason (bulk submit, bulk
  approve), the reason shows as a line of muted text in the row instead, since many info buttons
  in a list would be noise.
- **Local times** (`LocalTime`, 049): tapping or focusing a time opens a popover with the UTC time
  and the ISO string (copyable). On a fine pointer the hover `title` stays.
- **Truncated text** (`DataTable` `truncate` columns, `FileTree` names, `TypesExplorer` paths, the
  submissions feedback line cut at 120 characters): on phones they wrap instead of truncating
  where the layout allows (069's stacked rows, the file tree, the types list); where a truncation
  stays, tapping it expands it in place (a `Truncated` primitive: `line-clamp` plus a "more"
  button), never a `title`.
- **Hashes** (versions table, `VersionsTab.tsx`): the short sha256 is a button that opens a
  popover with the full hash and a copy button.
- **Explanations in `title`** (`ProposalBadges` stale badge, `DependencyMarks`, `DirtyMark`): the
  badge becomes a `Popover` trigger with the same text; `DirtyMark`'s "Save with Ctrl+S or ⌘S"
  shows only on a fine pointer (there's no keyboard shortcut to tell a phone about).
- **Charts** (`UsageCard`): the bars keep their hover values; tapping a bar shows its day and count
  in the chart's caption line. The `<details>` table stays.
- **A scan test** that fails on a `title=` attribute in `apps/web/src` outside an allowlist
  (`aria`-equivalent uses such as `<svg><title>` and `iframe` titles, and `title` kept *next to* a
  tap path, marked with a `// hover-also:` comment naming it). The ~59 uses today are fixed or
  listed.

**Out** (and where it goes instead):
- The canvas's hover affordances: React Flow handles touch; 071 and 072 cover the canvases.
- Keyboard shortcuts in general: the shortcuts that exist all have a button equivalent already.

## Behaviour

- **Phone, own submission in review:** the Approve button is disabled with an `ⓘ` next to it;
  tapping it says "You can't approve your own submission." Tapping elsewhere closes it.
- **Phone, audit log:** tapping "2 Oct, 14:05" shows "2026-10-02 17:05:00 UTC".
- **Desktop:** the same as today, plus the info button next to disabled buttons (it also helps
  keyboard users, who never got the `title`).

## Edge cases

- **A disabled button inside a dialog footer** (bulk release): the popover opens above the footer
  and stays inside the dialog (Floating UI with the dialog as boundary).
- **A time inside a link** (a table row link): the time isn't a separate button there; the UTC is
  in the row's details (the audit event dialog already shows it). Listed in the allowlist.
- **No JavaScript:** popovers don't open; the reason and the UTC time stay in the `sr-only` copy
  and `title`, as today.

## Documentation

- **Overview's time paragraph** (`content.tsx`, "hover one to see it in UTC"): "tap or hover one
  to see it in UTC".
- **Audit log section** ("the time in your time zone (UTC on hover)"): "(tap or hover for UTC)".
- **Helpers:** no change; the info buttons reuse the existing reasons' wording.

## Acceptance criteria

- [ ] Every disabled button with a reason shows an info trigger that opens the reason on tap
  (`Button` unit tests; `hover.mobile.e2e.ts` on a submission's own review page).
- [ ] Tapping a time shows its UTC value (`LocalTime` tests; e2e on the audit log).
- [ ] The full sha256 of any version can be read and copied on a phone (e2e).
- [ ] The types list, file tree names and the submissions feedback are readable in full on a phone.
- [ ] The `title=` scan passes with a reviewed allowlist.
- [ ] The Documentation lines above say "tap or hover".
- [ ] The sweep's `expectedFailures` entries for 068 are gone.

## Open questions

- None.
