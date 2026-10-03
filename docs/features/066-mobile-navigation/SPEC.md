# 066 — Navigation on phones

> Milestone: M10 · Depends on: 065, 067, 032, 033 · Design: [032 app shell](../032-design-system/SPEC.md) · Contracts: none new

## Goal

On a phone the main navigation is a strip that scrolls sideways with its scrollbar hidden. For a
moderator or root at 375px, Reviews, Admin and Docs sit off-screen with nothing to say they're
there, and the role badge takes room the links need. The section tab strips (the item page's seven
tabs, the review queue, Admin) do the same, and the item page doesn't scroll its active tab into
view. This feature gives phones a menu and makes every tab strip show where it is.

## Scope

**In:**
- **A menu on phones and tablets** (below `lg`, where the strip no longer fits for root):
  - The header shows the logo, the page's main link count badge (Reviews' count, when there is
    one, on the menu button), and a **Menu** button (44px, `aria-expanded`, labelled "Menu").
  - The menu opens as a side sheet from the right (067's `Dialog` with `variant="side"`): the
    nav links from `nav.ts` with their counts, the current page marked (`aria-current`), then the
    account links (Account, Access tokens), the appearance switch, the user's email and role, and
    Sign out. Each row is 44px.
  - It closes on a link, on Esc, on a tap outside, and on navigation (back and forward included).
    Focus returns to the Menu button.
  - From `lg` the header is as today: the strip, the account menu, the theme toggle.
- **The account menu** (`<details>`, desktop) closes on a click outside, on Esc and on navigation.
  Today it stays open.
- **Home** is a link in the menu (today it's hidden on phones); the logo stays a link home too.
- **A shared `ScrollStrip`** for tab strips that may not fit (`components/ui`):
  - scrolls the current tab into view on load and on change (`block: "nearest"`, no smooth
    scrolling when reduced motion is asked for);
  - a fade on the edge that has more tabs, shown only while there's more to scroll: a CSS mask
    that turns the tabs transparent at that edge, so no colour is added and it works on any
    background (032 allows no shadows and no gradient fills; `fade-*` in `globals.css`);
  - each tab at least 44px tall on a coarse pointer.
  It replaces the hand-made strips in the item page tabs (`ItemPageView.tsx`), `DocsNav`
  (phones), `AdminNav` and the review queue tabs (`QueueTable.tsx`), and the submissions status
  links if they don't fit.
- **`Tabs`** (`components/ui/Tabs.tsx`, the equal-column toggle): stays equal columns for two or
  three short choices; with four or more it uses `ScrollStrip`. `h-8` becomes 44px
  on a coarse pointer.
- **Docs on phones:** the topic strip keeps its groups (each group's label as a small heading
  inside the strip). On tablets in landscape the sticky sidebar gets a max height and scrolls
  (`max-h-[calc(100dvh-6rem)] overflow-y-auto`), so the last topics can be reached.

**Out** (and where it goes instead):
- A global search box in the header: not part of mobile; the home and catalogue searches stay.
- Bottom tab bars: the app has six top-level pages and a side sheet holds them; a bottom bar would
  take height from every page.

## Behaviour

- **Phone, member:** header = logo · Menu. The menu lists Home, Catalogue, Submissions, Docs, then
  the account part.
- **Phone, moderator with 3 submissions waiting:** the Menu button shows a `3` badge; the menu
  lists Reviews with its count.
- **Tablet (768–1023px):** the same menu (root's strip doesn't fit at 768 with the account part).
- **Desktop:** unchanged, except the account menu now closes on an outside click.
- **No JavaScript:** the Menu button is a link to `/menu`, a plain page listing the same links (so
  the sign-out form and every link still work). With JavaScript it opens the sheet instead.

## Edge cases

- **Unsaved changes** (the draft editor's guard): a link tapped in the menu goes through the same
  guard; if the person stays, the menu closes and they're still on the page.
- **Rotating** a phone to landscape at 915px wide keeps the menu (below `lg`).
- **The sheet is open and the window grows past `lg`:** it closes.
- **Many counts** (Reviews and Submissions both with badges): the Menu button shows the Reviews
  count only, the one that's someone else waiting.

## Documentation

- **Overview › "The path of an item"** (`features/docs/content.tsx`): where it says "in the
  navigation", add "(the Menu on a phone)". Grep for other "navigation" mentions and do the same.
- **Topics and helpers:** no change.

## Acceptance criteria

- [ ] Below `lg` the header shows the logo and Menu; the sheet holds every nav link for the role,
  with counts, plus the account links, the appearance switch and Sign out (`AppShell` unit tests
  per role).
- [ ] The sheet closes on a link, Esc, an outside tap and back/forward; focus returns to Menu
  (`navigation.mobile.e2e.ts`).
- [ ] The desktop account menu closes on an outside click and on navigation (unit test and
  `theme.e2e.ts` or a new desktop e2e).
- [ ] `/menu` works without JavaScript (an e2e with JavaScript off).
- [ ] The item page tabs, docs topics, Admin and queue tabs use `ScrollStrip`; opening
  `?tab=risks` on a phone shows the active tab on screen (e2e).
- [ ] The docs sidebar scrolls on a 1024×768 landscape tablet (tablet project).
- [ ] The sweep's `EXPECTED_FAILURES` entries for 066 are gone.
- [ ] The Documentation listed above mentions the Menu.

## Decisions

Owner, 2026-10-02:

- **The Menu shows below `lg` for everyone** (not only below `md`), so one person doesn't see two
  different headers on the same tablet.

## Open questions

- None.
