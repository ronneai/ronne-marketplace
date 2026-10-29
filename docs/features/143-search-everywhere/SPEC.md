# 143 — Search on every page

> Milestone: M22 · Depends on: 142, 119, 120, 066, 067, 129 · Design: [MVP §8](../../MVP/MVP.md#8-web-application), [MVP §15](../../MVP/MVP.md#15-decision-log) ("Search") · Contracts: none changed

## Goal

A search that can be opened from any page once you're signed in (owner, 2026-10-29), so finding an
item never means going to the catalogue first. It uses 142's index, shows results as you type, and
also lists the pages you can go to, so the same box takes you to Reviews or Admin › Settings.

## Scope

**In:**
- **A search button** at the top of the sidebar (119), above the workspace switcher, reading
  "Search" with the shortcut beside it (`⌘K` on macOS, `Ctrl K` elsewhere); on phones and tablets
  below `lg`, a search icon in the header beside the Menu (066).
- **Shortcuts:** `⌘K` / `Ctrl+K` from anywhere, and `/` when focus isn't in a field, open it.
- **The search dialog** (`components/ui` dialog, 067: full screen below `sm` with the field fixed at
  the top):
  - a field, results after 150 ms without typing, at most 8 items;
  - each item with its type badge (054), full name, description on one line, its workspace, and
    where it matched ("in the description");
  - **In this workspace**, on when a current workspace is set (120), off for all you see;
  - **Go to**: the pages of the sidebar and the Menu you can open (`nav.ts`, the same rules), whose
    name matches, listed after the items;
  - **See all results** opens the results page;
  - arrow keys move, `Enter` opens, `Esc` closes and returns focus to where it was.
- **The results page, `/search?q=&workspace=&type=`:** every result, 20 per page, the type filter
  as the catalogue's, and the same fields as the dialog; it works without JavaScript (a form with
  `GET`), like `/menu` (066).
- **Empty and failing states:** "Nothing matches", with a link to the catalogue; a failed search
  says "Search isn't available right now" and keeps the field.
- **Accessibility:** the dialog is a combobox with a listbox (WAI-ARIA), results announced politely
  ("8 results"), 44 px rows on a coarse pointer (067).
- **Messages:** a new `search` namespace in English, Portuguese and French.

**Out** (and where it goes instead):
- **Files' contents and their snippets:** 144 adds them to the same dialog and page.
- **Recent searches:** not kept (nothing about what people search is stored).
- **Searching the Documentation:** it's on the website (088); the dialog's footer links to it.
- **Actions in the dialog** (create a draft, release): only going to pages here.
- **Signed out:** no search (everything needs a session).

## Behaviour

- Opening the dialog doesn't query; the first query goes when two characters or more are typed (one
  for a name starting with `@`).
- A newer query cancels the one in flight; an answer that arrives late is ignored.
- Results come from 142's `searchEverywhere` action; Go to entries are computed in the browser from
  the navigation the page already has, so they cost nothing.
- Opening an item goes to its page (`/items/...`, 118's path); with the dialog's workspace toggle
  on, the workspace is passed as the catalogue does (`?workspace=`).
- The page title is "Search" or "Search: <query>" (translated).

## Edge cases

- **A shortcut already used by the page** (the file editor's CodeMirror, `⌘K` in a text field):
  `⌘K` still opens search except inside the code editor, where CodeMirror keeps it; `/` never
  opens it from a field.
- **A dialog already open** (a decision dialog): the shortcut does nothing.
- **A very long query:** the field stops at 200 characters (142's limit).
- **Root with many personal workspaces:** as 142, others' personal workspaces stay out unless the
  current workspace is one.
- **Large text and long names** (075): the dialog wraps and stays within the screen at 360 px.

## Documentation

- **Items › Searching** (`items#search`, added by 142): opening it from any page, the shortcuts,
  In this workspace, Go to, and the results page.
- **Using Ronne on a phone** (075's topic), if published: the search icon in the header.
- **Helper:** on the results page, "What does search look in?" → `items#search`.

## Acceptance criteria

- [ ] The search opens from the sidebar button, the header icon on phones, `⌘K`/`Ctrl+K` and `/`,
  on every signed-in page; never for a signed-out visitor.
- [ ] Typing shows ranked items with type, name, description, workspace and where they matched, and
  the pages the reader can open; the keyboard alone opens any of them.
- [ ] In this workspace limits results to the current workspace and follows the switcher.
- [ ] `/search` lists every result with paging and the type filter, also with JavaScript off.
- [ ] A page the reader can't open is never offered in Go to (tested for a user, a moderator and
  root).
- [ ] The dialog passes the phone sweep (065) and the tap-target check, and an axe check with no
  serious issues.
- [ ] Every word is a message in the three languages (the parity and raw-text tests pass).
- [ ] The Documentation and the helper above say what the feature does.

## Decisions

1. **One dialog for items and pages** (Claude): people reach for one shortcut; a second "go to"
   palette would split it. Pages come from `nav.ts`, so the dialog can't offer a page the sidebar
   wouldn't.
2. **No search history** (Claude): what people search for can say what they work on; storing it
   would be personal data for 104 and 103 with no feature asking for it.
3. **The catalogue's box stays** (Claude, with 142): it filters the list it's on; the dialog finds.

## Open questions

- Should `/` be left out entirely, as some people type it to start an item name?
