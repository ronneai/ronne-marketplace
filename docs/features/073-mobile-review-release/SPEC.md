# 073 — Reviewing and releasing on a phone

> Milestone: M10 · Depends on: 067, 068, 069, 070, 014, 015, 054, 055, 058 · Design: [014](../014-review-queue/SPEC.md), [015](../015-release/SPEC.md) · Contracts: none new

## Goal

Approving a change is one of the most useful things to do from a phone: a moderator gets a link,
reads the diff, and approves or asks for changes without going back to a desk. Today on a phone:
- The queue's rows have no readable name.
- The decision buttons are at the top of a long page.
- A long item name overflows the title.
- The bulk approve and bulk release dialogs leave almost no room for their list, and none at all
  once the keyboard is open.

This feature makes the review and release flow work on a phone.

## Scope

**In:**
- **The queue** (`QueueTable.tsx`): 069's stacked rows on every tab. The tabs use 066's
  `ScrollStrip`. The row decisions (Approve, Request changes, Reject) are 44px buttons on the
  card. Bulk approve and bulk release start from the selected cards.
- **The review page** (`reviews/[id]/page.tsx`):
  - The title breaks long names (`break-all`), as the draft editor's does.
  - **A sticky bottom decision bar below `lg`:** Approve, Request changes, Reject (or Publish, on
    an approved submission). On someone's own submission, the disabled buttons show their reason
    (068). The header keeps them from `lg`.
  - Order on phones: the summary (who, what changed, risk flags), the diff (070), the checks, the
    conversation.
  - Risk-flag file:line links get 44px targets.
- **Proposal changes** (`ProposalChanges.tsx`): the field, before and after values stack below `sm`
  (069).
- **Comments** (`Conversation.tsx`, `CommentForm.tsx`): the comment box grows with its text. Send
  stays visible with the keyboard open, because the form scrolls into view on focus.
- **Decision dialog** (`DecisionBar.tsx`): full screen below `sm` (067). The dependents fieldset
  scrolls in the body, and the buttons are in the footer.
- **Bulk approve** (`BulkApprove.tsx`) and **bulk release** (`BulkRelease.tsx`) on phones:
  - Full screen (067).
  - The settings (bulk release's stable or pre-release, bump, tag and notes; bulk approve's
    filter) collapse into a one-line summary at the top, "Stable · suggested bump · latest ·
    Change", that opens them in place. The list gets the rest of the screen.
  - The optional message or notes field is a step: "Add a message" opens it, so the keyboard only
    shows when someone wants to write.
  - The footer keeps the count and the main button ("Approve 4", "Release 3").
- **Publish dialog** (`PublishDialog.tsx`): full screen below `sm`, with the title and buttons
  fixed. Its indented inputs lose their indent below `sm`.
- **Versions management** (tags, deprecate, yank): 069's stacked rows and 067's dialogs. The
  sweep checks it.

**Out** (and where it goes instead):
- Changing review rules or decisions: unchanged.
- Push notifications for new submissions: notifications are out of the MVP.

## Behaviour

- **Phone, a moderator opens a review link:** title, author and risk flags, then the diff. The
  bottom bar shows **Approve · Request changes · Reject**. Tapping **Request changes** opens the
  full-screen dialog with the reason box focused and **Send** above the keyboard.
- **Phone, bulk approve 4:** select 4 cards, tap **Approve 4**. The full-screen list shows the 4
  with any risk flags first. **Approve 4** is at the bottom, and "Add a message" is above it.
- **Phone, bulk release 3:** the summary line shows "Stable · suggested bump · latest". The list of
  the 3 with their next versions fills the screen. **Release 3** is at the bottom.

## Edge cases

- **Risk-flagged items in bulk approve:** listed first and approved one at a time (054). On a phone
  each one's **Approve** is on its card in the list.
- **A dependency rejected from a phone** (056): the dependents' prompt is a second full-screen
  dialog (067).
- **A long conversation:** the bottom decision bar stays. The comment form is at the end of the
  page, above the bar.
- **The keyboard is open in the comment box:** the decision bar hides while a field in the page
  has focus, so the box and Send have the room.

## Documentation

None: the decisions, their rules and the bulk dialogs do the same things. Only where the buttons
sit changes, and the Documentation doesn't describe button positions. Check "Decisions" and
"Approving many at once" for "at the top of the page" or similar, and fix them if found.

## Acceptance criteria

- [ ] On a phone, a moderator approves, requests changes on, and rejects a submission from the
  review page using the bottom bar (`review.mobile.e2e.ts`, Chromium and WebKit).
- [ ] On a phone, bulk approve of 4 (one risk-flagged) and bulk release of 3 complete, with the
  list visible above the footer (e2e).
- [ ] The comment form and decision dialogs keep their buttons on screen with the keyboard open
  (WebKit e2e).
- [ ] The review title with a 64-character name doesn't overflow (sweep).
- [ ] The sweep's `EXPECTED_FAILURES` entries for 073 are gone.

## Open questions

- None.
