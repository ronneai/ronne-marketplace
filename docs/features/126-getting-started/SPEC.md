# 126 — Getting started checklist

> Milestone: M18 · Depends on: 009, 107, 124, 129 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) · Contracts: none changed (the web app only)

## Goal

A new person signs in to a page of items and has to work out how to get one onto their machine.
Home shows a short checklist that walks them from "I have an account" to "an item is installed",
ticking itself as they go, and goes away when they are done or don't want it.

## Scope

**In:**
- **A Getting started banner** on Home (section 3 of 124), for any signed-in person who hasn't
  finished or hidden it: one slim row with a progress ring, "Getting started · 2 of 4 done", the
  next step ("Next: Install your first item") with its one button, **See all steps** (or **Show the
  commands**, while the next step is connecting rmk) and a Hide icon. The four steps, their commands
  and their buttons are in the dialog those open (owner, 2026-10-21: the full list on the page was
  too heavy). Four steps:

  | # | Step | Done when | How it's detected |
  |---|---|---|---|
  | 1 | **Create an access token** | they have a token that isn't revoked | `access_tokens` (009) |
  | 2 | **Connect rmk** | a token of theirs has been used | `last_used_at` set, or a device grant approved (107) |
  | 3 | **Install your first item** | they say so | a button "I've installed one" (`install_confirmed_at`) |
  | 4 | **Start a draft** (optional) | they have a draft or any submission | `submissions` (012) |

  In the dialog each step has one sentence and one action: step 1 → CLI & tokens; step 2 → the install and login
  commands for this instance (the same ready-made lines the tokens page shows, with the instance's
  address, including `rmk login --registry <address> --web`) and a copy button; step 3 → the
  catalogue, and for the install, the command on any item page; step 4 → New item and the
  Documentation's export section.
- **Progress:** "2 of 4 done", the steps ticked, the first undone step highlighted. Step 4 doesn't
  block completion: the panel counts as done when steps 1–3 are.
- **Done:** when steps 1–3 are done, the panel shows "You're set up" with links (Documentation,
  New item) once, then disappears on the next visit.
- **Hide it:** a Hide button on the panel; on Account, a **Show getting started again** button.
- **Existing accounts:** the panel works out its state from what already exists. One who has only
  a token sees it with step 1 ticked. Steps 1, 2 and 4 are read from tokens, grants and
  submissions, but an install can't be seen (see step 3), so a long-time user sees "2 of 4" until
  they press "I've installed one" or Hide; with all three done they see "You're set up" once and
  never again.

**Out** (and where it goes instead):
- A tour or tooltips over the interface; videos.
- Per-role checklists (a reviewer's, a workspace admin's): later.
- Emails or reminders: notifications are out of scope for the MVP.

## Behaviour

- **State.** One row per person in `user_onboarding` (`user_id`, `hidden_at`, `install_confirmed_at`,
  `completed_seen_at`); no row means defaults. Everything else is read from existing tables at
  render time, so it is always true and nothing needs back-filling.
- **Step 3 is the person's word.** The registry can't tell who installed what: downloads are a
  count per item, and usage telemetry (046) is daily totals with nothing per person or project, so
  neither can tick a step for one person (checked against MVP §14.6 and the `usage_daily` table
  while building, 2026-10-21; this replaces the first draft, which had an `install` event tick it).
  So the button is the signal, always.
- **The commands** come from the same function as the tokens page (so the address and the flags
  never differ), and show the `npm install --global @ronneai/rmk` line before them when the person
  has no token yet. Nothing secret is on Home: a token is never shown here.
- **No JavaScript:** Hide, "I've installed one" (the banner's button while the next step is the
  install) and Show again are forms, and the banner's links work; the steps dialog and the copy
  buttons need JavaScript, and the commands stay selectable text.
- **Phone:** the banner wraps onto a few lines with 44px actions; the steps dialog fills the screen
  (067) as a stacked list, and its commands wrap (071).
- **Disabled and held people:** the panel shows only where Home does (the two-factor and
  password-change holds redirect first).

## Edge cases

- A person with only revoked tokens: step 1 is not done.
- A token created by `rmk login --web` (device flow) counts for step 1 and, once used, step 2.
- An erased user (103) has no row; deleting the user deletes theirs.
- A person who hid the panel and later finishes everything: nothing to show; "Show again" shows
  "You're set up".
- A root: the same panel, plus one line pointing to Admin when the instance has no scope yet (124's
  empty-instance message already covers the rest).
- Step 3 stays ticked once confirmed; nothing the instance does later unticks it.

## Documentation

- **Overview → Finding your way** (`overview.tsx`): the checklist and how to hide or reopen it.
- **Account** (`account.tsx`): "Show getting started again".
- **rmk** (`rmk.tsx`) or **Install**: nothing new, the panel links to them; check the links land.
- **Helpers:** on the panel, "Why isn't step 3 ticked by itself?" → the Overview's section on the
  checklist (explains the registry doesn't record who installs what, so they say so).
- Both `topics.ts` change only if a section is added.

## Acceptance criteria

- [ ] Each step ticks from the data in the table above (revoked token, unused token, device grant,
      the confirm button, a draft), with tests for every detection, and an `install` event in the
      usage totals ticks nothing.
- [ ] The panel disappears after "You're set up" is seen, can be hidden, and can be brought back
      from Account.
- [ ] The commands shown are the tokens page's, with the instance address; no token value is on
      Home.
- [ ] An existing account with everything done sees "You're set up" once and then never sees the panel.
- [ ] Hide, confirm and show again work without JavaScript.
- [ ] Everything is in messages (129) in three languages; phone sweep passes.
- [ ] `user_onboarding` is in "Your data" (104) and deleted on erase (103).
- [ ] The Documentation and helpers above say what the feature does now.
- [ ] Home shows Getting started as a slim teal banner with a steps dialog, and the item cards on
      Home, its shelves and the Catalogue are compact cards in a grid of up to five to a row that
      keeps its shape while the window is resized; the Catalogue also has a list view.

## Home's cards (owner, 2026-10-21)

Done in the same change, since Home was being reworked. The banner is the light teal of the inline
helpers' panel (deep teal in the dark theme), the `--popover` pair of tokens.

The item cards on Home, on its shelves (125) and on the Catalogue are one **compact card** in a
**grid**: as many columns as fit with a card never narrower than 17rem, and **never more than five
to a row**, so one to a row on a phone and four or five on a wide screen. The columns change on
their own as the window is resized and the cards share the room, so a card is 17rem or wider (it
grows when the row is capped at five) and keeps about the same shape, never a narrow, tall one just
before a column drops off (the owner saw that with fixed breakpoints). The column count follows the
room the list has, which a test checks at thirteen window widths. The card has:

- the name, in at most two lines (the whole of it on hover), broken at `-` and `/` first; the
  full name already says the workspace and the scope, so the **Workspace/Scope line is left out**,
  except a small cue for a private workspace (a lock and "Private") or a personal one;
- the version, the type and any badges, with the **date at the right of the same row**, no word
  beside it (the word is there for screen readers);
- a description cut at **two lines with an ellipsis**, with room kept for two;
- in the footer, the installs and a **copy icon** (its words for screen readers, the command as its
  tooltip) instead of a box with the command in it.

The keywords and the AI tools an item works in are left to the item's page.

### Grid or list on the Catalogue

The Catalogue has two links beside Sort, **Grid view** and **List view**: `?view=list` shows the
earlier full-width cards (keywords, tools, the place line and the install command), one to a row;
the grid is the default and leaves the parameter out. It is a link, so it works without JavaScript,
the choice is in the address, and it rides along searching, filtering, sorting and paging.

## Open questions

- Should step 3 also tick when the person's token was used from the MCP server (`rmk-mcp`) rather
  than `rmk`? Both use the same tokens, so step 2 already covers it.

## Decisions

- **No telemetry tick (2026-10-21, while building).** The first draft said an `install` event ticks
  step 3 when the instance collects usage. That cannot be per person: 046 stores daily totals with
  nothing about who sent them, a decision the owner made on purpose (MVP §15). Step 3 is therefore
  the button alone.
