# 120 — Working in one workspace

> Milestone: Across the app · Depends on: 119, 090, 091, 093, 094, 113, 114, 062, 063, 018 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) · Contracts: none changed (the web app only; the API, `rmk` and MCP don't change)

## Goal

Someone on a team spends most of their time in one workspace, and today picks it again on every
page (owner, 2026-10-11). The sidebar's workspace switcher (119) becomes a **current workspace**:
choose one and the Catalogue, Reviews and My submissions show only it, and New item starts in it,
until you choose another or All workspaces. It narrows what's shown, never what's allowed.

## Scope

**In:**
- **The current workspace**, chosen in the switcher: **All workspaces** (the default) or one of the
  workspaces you're a member of. It's remembered in a cookie, so it's the same on every page and
  after you sign in again.
- **The URL says it.** A filtered page carries `?workspace=<name>`, which is what the page shows: a
  link you send shows the same thing to whoever opens it (within what they can see). Opening a
  filtered page without the parameter while a current workspace is set redirects to the same page
  with it.
- **What it filters:**

  | Page | With a current workspace |
  |---|---|
  | Catalogue | Only that workspace's items. Its own Workspace filter (090) stays, as the same parameter: it also lists public workspaces you're not in |
  | Reviews (every tab) | Only that workspace's submissions. Its Workspace filter (091) goes: the switcher does it |
  | My submissions | Only your submissions in that workspace (a new filter, on the server) |
  | New item | The scope picker starts on that workspace's first scope; every scope stays choosable |

- **Nothing else is filtered:** Home, Workspaces, a workspace's page, item pages, Requests, Users,
  Audit log, Settings, Account and CLI & tokens are the same whatever the current workspace.
- **It shows:** each filtered page has a line under its heading, **"Showing acme only · Show all"**.
  Show all clears the current workspace (the cookie too). The switcher's button shows the current
  workspace's name (with "Personal workspace" for yours), or **All workspaces**.
- **The switcher** (119) lists All workspaces, then the workspaces you're a member of (personal
  first, then `global`, then by name), the current one marked. Choosing one sets it and stays on
  the page: a filtered page reloads filtered, another page doesn't change. Each workspace's row
  also has an **Open page** link to `/workspaces/<name>`; **Manage workspaces** opens
  `/workspaces`. It works without JavaScript: a choice is a link to a route that sets the cookie
  and goes back.
- **Counts don't follow it** (owner, 2026-10-11): the sidebar's Reviews and Requests counts stay
  everything waiting for you, so work in another workspace isn't missed.

**Out:** `rmk`, the MCP server and the API (they have no current workspace; the Documentation
says so); filtering Home, item pages or Requests; a current workspace per browser tab.

## Behaviour

- **Who can pick what.** The switcher lists only workspaces you're a member of. Root's list is
  root's own memberships too: any other workspace is reachable through the catalogue's filter or
  the URL. A public workspace you aren't in isn't listed (join it from Workspaces, 094).
- **Never a security boundary.** Every page and action checks permissions as before. A
  `?workspace=` naming a workspace you can't see filters to nothing, with the same message as a
  name no workspace has ("No workspace acme you can see"), so it doesn't reveal that a private
  workspace exists. The cookie is only a preference: the server checks it against your
  memberships on every request.
- **A stale choice falls back.** If the current workspace is one you're no longer in, was renamed
  (113: its old name answers as unknown) or deleted, the current workspace becomes All workspaces
  and the cookie is cleared, without an error page.
- **Reviews in a workspace you don't review in:** the queue is empty, with "You don't review
  submissions in acme · Show all".
- **The filter and the page's own:** on the Catalogue, choosing another workspace in Filters
  changes this view's URL only; the switcher's choice stays the remembered one. Show all clears
  both.
- **Without JavaScript** everything works: the switcher's choices and Show all are links.

## Edge cases

- A shared link with `?workspace=` opened by someone who isn't a member: they see that workspace's
  items they can see (public), or nothing with the message above (private). Their own current
  workspace doesn't change.
- `?workspace=` empty or `all` means all workspaces.
- Someone in no workspace but `global`: the switcher offers All workspaces and `global`.
- The personal workspace (114) is listed and filters like any other.
- Paging and sorting keep the parameter (the data tables' `fixed` parameters, 062).

## Documentation

- **Workspaces**, a new section **Working in one workspace** (`workspaces#current`): choosing the
  current workspace, what it filters and what it doesn't, Show all, that the counts don't follow
  it, that `rmk` and the MCP server don't have one, and that links carry it.
- **Overview → Finding your way**: the switcher sets the current workspace (rewording 119's
  sentence).
- **Review** (`review.tsx`, the Workspace filter on the queue, and where My submissions is
  described): the queue and My submissions follow the current workspace; the queue's Workspace
  filter is gone.
- **Items** (New item's scope): the scope picker starts in the current workspace.
- **Workspaces** elsewhere (`workspaces.tsx`: "New item, the catalogue's Workspace filter", the
  moderators' Workspace filter, personal and private workspaces in the catalogue): the catalogue's
  filter is the same parameter as the switcher's; the queue's filter is the switcher.
- **Helpers:** on the "Showing acme only" line, "What does this filter?" → `workspaces#current`.
  The Reviews "Workspace" helper (`queue-workspaces`) goes with its filter.
- Both `topics.ts` get the new section.

## Acceptance criteria

- [ ] The switcher sets and clears the current workspace, with and without JavaScript, and lists
      only the member's workspaces plus All workspaces; each row opens its page too.
- [ ] Catalogue, Reviews and My submissions show only the current workspace, with the "Showing …
      only · Show all" line and `?workspace=` in the URL; New item preselects its scope.
- [ ] Nothing else is filtered, and the sidebar counts don't change with it.
- [ ] A `?workspace=` for a private workspace you're not in shows nothing and the same message as an
      unknown name; a stale cookie falls back to All workspaces.
- [ ] Unit, database and end-to-end tests cover the above on desktop and phone.
- [ ] MVP §15's Workspaces row records the current workspace and that it's a filter, not a boundary.
- [ ] The Documentation and helpers above are updated in a ronne-web branch.

## Decisions

- **The URL is the truth, the cookie a default** (owner, 2026-10-11): links show what they say.
- **All workspaces by default**, so nothing disappears until someone chooses.
- **Counts unfiltered** (owner, 2026-10-11).
- **The switcher still opens a workspace's page**, through each row's Open page link (119's
  behaviour kept, as a second action).
- **Catalogue keeps its Workspace filter, Reviews loses its own:** the catalogue's covers public
  workspaces you're not in, which the switcher doesn't list; every workspace you review in is one
  you're a member of.
- **Web only:** `rmk`, MCP and the API are unchanged.
