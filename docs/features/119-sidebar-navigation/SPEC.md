# 119 — Sidebar navigation

> Milestone: Across the app · Depends on: 032, 065, 066, 088, 094, 114, 115 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) · Contracts: none changed

## Goal

The header's strip of links (032, 066) has grown with workspaces (090–118) and no longer reads at a
glance. The owner's new mocks (2026-10-11, kept in the git-ignored
`docs/UI-Mocks-Materials/stitch_ronne.ai/new-sidebar/`) move the navigation into a **left
sidebar**, grouped by what you're doing, that folds into a rail of icons.

## Scope

**In:**
- **A left sidebar from `lg` up**, replacing the header: the logo, the workspace switcher,
  **+ Propose item**, the links in three groups, and at its foot the signed-in person (with their
  menu), the appearance switch and the version.
- **The links**, each shown only to those allowed, as today (`navFor`, 008, 091, 114):

  | Group | Link | Opens | Shown to |
  |---|---|---|---|
  | Discover | Home | `/` | everyone |
  | | Catalogue | `/catalogue` | everyone |
  | | Workspaces | `/workspaces` | everyone |
  | | Requests (count) | `/workspaces/requests` | those who answer requests, while some wait (094, 115) |
  | Governance & reviews | Reviews (count) | `/reviews` | reviewers (014) |
  | | Submissions | `/submissions` | those who can submit |
  | | Users | `/admin/users` | root |
  | | Audit log | `/admin/audit` | root |
  | | Settings | `/admin/settings` | root |
  | Tools | Documentation | the website (088), in a new tab | everyone |
  | | CLI & tokens | `/account/tokens` | everyone |

  A group's heading shows only when one of its links does. The current link is marked as the
  header's was: Catalogue on item pages (also a workspace's, 118), Workspaces on a workspace's
  pages but not on Requests or its items (115).
- **+ Propose item** opens `/submissions/new`, for those who can submit.
- **The workspace switcher** (owner, 2026-10-11: it jumps, it doesn't filter): it shows your
  personal workspace (114), or "Workspaces" when you have none; opened, it lists your workspaces,
  your personal one first, then `global` and the others you're a member of, by name, with your role in each, and **All
  workspaces**. Choosing one opens its page (`/workspaces/<name>`). Nothing else on the page
  changes: there is no "current workspace".
- **Folding:** a button at the top folds the sidebar into a 64px rail: the monogram, then icons
  with their names as tooltips and accessible names, a dot where a count waits. The choice is kept
  in a cookie, so the next page renders folded at once.
- **The person at the foot:** their name and, for root, the role badge; it opens a menu with
  Account and Sign out. Access tokens is CLI & tokens under Tools.
- **The content** fills the width beside the sidebar, 24px from each edge, with no maximum
  (owner, 2026-10-11: the mocks' 1024px column, centred, left wide screens half empty), and the
  footer under it.
- **Below `lg`**, as today (066): a slim header with the logo and **Menu**, whose side sheet (and
  `/menu` without JavaScript) holds the same switcher, Propose item and groups, then the person,
  Account, the appearance switch and Sign out. The Menu button shows the Reviews count.
- **Signed out** (errors outside the app): the header with the logo and the appearance switch, no
  sidebar.

**Out (owner, 2026-10-11):** the mocks' top bar (breadcrumbs, ⌘K search, Docs and API links, the
notifications bell: notifications are out of the MVP), the ⌘K hint on Propose item, a Scopes link
(removed in 115), "Local instance" (the app doesn't know it), and option 2's item page.

## Behaviour

- The sidebar is sticky and as tall as the window; its links scroll when they don't fit.
- Admin's pages (Users, Audit log, Settings) have no tabs of their own: the sidebar, or the Menu
  below `lg`, is how you go from one to another (owner, 2026-10-12).
- Counts show as today's `NavCount`: "3 waiting" for screen readers. Folded, a dot, and the link's
  name says how many wait.
- The fold button is a button with `aria-expanded` and `aria-controls`. Without JavaScript the
  sidebar stays as the cookie left it (unfolded by default) and every link works.
- The switcher and the person's menu are native `<details>` (`DismissibleDetails`): they work
  without JavaScript, and close on a click outside, Esc and a change of page.

## Edge cases

- A long workspace or person name is cut with an ellipsis, its full text in `title`.
- Root's personal workspace is listed like anyone's; root sees all workspaces under All workspaces.
- Someone in no workspace but `global`: the switcher shows "Workspaces" and lists `global`.
- An unknown fold cookie value means unfolded.
- Wide tables (Users, workspaces) get the whole width; below it they scroll inside their panel as
  they do on a tablet today.

## Documentation

- **Overview → Finding your way** (the paragraph that says the Catalogue, Submissions, Reviews and
  Admin are links at the top of every page, and Menu at the top right): the sidebar, its groups,
  the switcher, Propose item, folding, and Menu below a laptop's width.
- **Workspaces** (`workspaces.tsx`: "Workspaces, in the top menu", "in the menu"): Workspaces is
  in the sidebar; the switcher opens your workspaces.
- **Administration**: Users, Audit log and Settings are in the sidebar for root.
- Every page (EN, PT, FR) that says "the top menu", "your menu" or "Admin" for the link is
  reworded. No topic or section is added or renamed, so neither `topics.ts` changes, and no
  helper's words change.

## Acceptance criteria

- [x] From `lg`, every signed-in page shows the sidebar with the links above per role, and no
      header; below `lg`, the slim header and Menu, whose sheet and `/menu` list the same links.
- [x] The switcher lists the personal workspace first, then shared ones by name, and opens a
      workspace's page; All workspaces opens `/workspaces`.
- [x] Folding works, survives a reload, and every rail icon has a name.
- [x] Unit tests cover the links per role, the groups, the counts, the current link and the
      switcher; the end-to-end tests pass on desktop, phone (Chromium and WebKit) and tablet,
      with no sideways scroll.
- [x] The Documentation above is updated in a ronne-web branch.
- [x] MVP §15's design-system row says the navigation is a sidebar.

## Decisions

- **Jump, don't filter** (owner, 2026-10-11): a current workspace that filters the catalogue,
  reviews and the API would be its own feature.
- **Admin's three pages in the sidebar** (owner, 2026-10-11) rather than one Admin link.
- **No Admin tabs** (owner, 2026-10-12): with the three links in the sidebar, the tabs on Admin's
  pages repeated them, so they went.
- **No cap on the content's width** (owner, 2026-10-11), rather than the mocks' 1024px centred
  column.
- **No new colour token:** the sidebar is Surface on Canvas with a hairline, like the header was.
