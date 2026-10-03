# 018 — Catalogue

> Milestone: M3 · Depends on: 015 · Design: [MVP §2](../../MVP/MVP.md#2-personas--roles), [§8](../../MVP/MVP.md#8-web-application), [§9.4](../../MVP/MVP.md#94-database) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md)

## Goal

Everyone signed in can find what's in the registry and decide whether to install it: search and filter
the published items, and open an item's page with its README, versions, dependencies, what it can do
(its risk flags) and the command to install it. The home page becomes the starting point: what's new
and what's used most in the registry.

## Scope

**In:**
- **The catalogue** (`/catalogue`): search, filters, sorting and paging over published items.
- **The item page** (`/items/[scope]/[name]`): overview, README, versions (016's page as a tab),
  dependencies, files, risk flags, and the install command.
- Rendering README Markdown safely.
- **Catalogue** in the main nav, for everyone signed in.
- **The home page** (`/`): recently published and most used items, and what's waiting for the
  viewer. It stays a page of its own, never a redirect, since more sections will join it later.
- **Download counts:** a count per item, which the home page's "Most used" reads. 019's tarball
  endpoint adds to it.

**Out:**
- The per-platform support matrix → 026.
- The read API for `rmk` and the MCP server → 019 (the same search service, over HTTP).
- Downloading an artifact from the web page → 019's tarball endpoint.
- Counting downloads: 019's tarball endpoint does it; 018 adds the column and reads it.
- Ratings, and opt-in install telemetry from `rmk` (MVP §14, later).

## Behaviour

**The catalogue** (`/catalogue`, everyone signed in):
- **Search** (`?q=`): case-insensitive `LIKE` on the name, description and keywords of each item's
  `latest` version, through the `containsInsensitive` helper in `db/` (MVP §9.4).
- **Filters** (owner, 2026-10-02): a **Filters** button, counting the active filters, opens a
  panel with:
  - **Type:** collapsible (open when some are chosen), all 11 types as checkboxes, each with its
    name for people ("MCP server"), a dot in its colour (054) and its count. Several can be
    chosen, meaning any of them (`?type=skill&type=rule`). Types with no items stay, muted.
  - **Scope** and **Works in** (026), as selects; **Apply** and **Clear filters**.

  Beside the button, each active filter (and the search) is a chip that removes just it, the
  types in their badge's colours; then **Clear all**. It's a `<details>` with a GET form, so it
  works without JavaScript; with it, it closes on an outside click or Esc.
- **Sort**, on the right, a menu saying what each puts first: most recently published (the
  default), **most installed** (the download count, which `rmk install` raises; `?sort=installs`,
  owner 2026-10-02), or by name.
- **Every card shows its install count** ("12 installs", owner 2026-10-02).
- **Paging:** cursor-based, 24 items a page, as 010's scopes list.
- **What's listed:** items with at least one published version. An item with no installable version
  (every version yanked) is listed last, marked "no installable version".
- **Each card:** `@scope/name`, type badge, description, `latest` version, when it was published,
  keywords, a `⚠ risk` badge when its `latest` version has risk flags (014), and `deprecated` when that
  version is deprecated.
- An empty catalogue explains how items arrive: submit, review, release.

**The item page** (`/items/[scope]/[name]`):
- **Header:** name, type, description, `latest` version, license, keywords, and the owner (the first
  author).
- **Install:** `rmk install @scope/name` with a copy button (032's `CopyableCommand`), and the version
  pinned form (`rmk install @scope/name@1.2.0`). A note when `latest` is deprecated.
- **Tabs:**
  - **README:** the version's `readme` from 015, rendered as Markdown with raw HTML off, links opened
    safely, and images only from `https:` URLs. No README: the description and a note.
  - **Versions:** 016's page.
  - **Dependencies:** each dependency of the shown version, with its range and a link to its page.
  - **Files:** the shown version's files, sizes and executable flags, from 015's `files`. 044 adds
    their contents and an Overview tab.
  - **What it can do:** the version's risk flags (014), as the review page shows them.
- **Another version** (`?version=1.1.0`): the page shows that version; a banner says it isn't
  `latest`, and whether it's deprecated or yanked.
- **Propose a change** (017), for everyone signed in: added by 017, which builds on this page.
- A missing item, or one with no published version, is a 404.

**The home page** (`/`, everyone signed in; replaces the scaffold's placeholder):
- **Search:** a search box that opens `/catalogue?q=…`.
- **Recently published:** the 6 items with the most recent release, as catalogue cards, and "See
  all" to the catalogue sorted by most recently published.
- **Most used:** the 6 items with the most downloads, as catalogue cards with their count. Hidden
  while no item has been downloaded yet (before 019, or on a new instance).
- **For you:** your submissions in progress (drafts and changes requested), linking to
  `/submissions`; for moderators and root, how many wait for review, linking to `/reviews`. A line
  each, left out when there's nothing.
- **An empty registry:** explains how items arrive (submit, review, release) and links to a new
  submission.
- Items with no installable version (every version yanked) are left out of both lists.

**Download counts:** `items.download_count`, an integer starting at 0. 019's tarball endpoint adds
one per artifact download, in a single `UPDATE … SET download_count = download_count + 1`, so
concurrent downloads never lose a count. It counts downloads, not people or projects: a CI job that
installs on every run counts every time. Nothing about who downloaded is stored.

**Markdown** is rendered on the server with a Markdown library with raw HTML turned off (see Open
questions), headings shifted so the page keeps one `h1`, and the design system's type styles.

## Edge cases

- **A deprecated `latest`:** listed and installable, with its message on the card and the page.
- **A yanked version asked for by URL:** shown, with a banner that new installs can't resolve it.
- **Search with `%` or `_`:** escaped by the `db/` search helper, so they match themselves.
- **A README with a script tag or an event attribute:** shown as text, never run.

## Acceptance criteria

- [x] The catalogue lists published items only, with search, type and scope filters, both sorts and cursor paging, on all four databases.
- [x] Each card shows the latest version, the risk badge and deprecation as specified.
- [x] The item page shows the header, install commands, and the README, Versions, Dependencies, Files and What it can do tabs, for `latest` and for another version.
- [x] README rendering never runs HTML or scripts from the item, tested with hostile input.
- [x] Items without a published version aren't listed, and their pages are 404s.
- [x] The home page shows recently published and most used items (most used hidden with no downloads, and items with no installable version left out), the viewer's submissions in progress and, for moderators and root, the review count; an empty registry explains how items arrive.
- [x] `items.download_count` exists on all four databases, and the most used query orders by it.
- [x] Playwright: a user starts from the home page's search box, searches for a published skill, filters by type, opens it, reads its README and copies the install command.

## Open questions

The owner started 018 (2026-09-28) without answering these, so it's built on the recommendations;
any can still change.

1. **Markdown library:** `markdown-it` (MIT) with `html: false` (recommended: safe by default, no
   sanitiser needed), or `marked` (MIT) with a sanitiser, through the dependency checklist.
   *Built with `marked`:* `markdown-it` 15 depends on `argparse` 3, which is PSF-2.0 and would need a
   license exception. `marked` has no dependencies, and its renderer escapes raw HTML and filters
   URLs itself (PLAN, task 2).
2. **Catalogue, item and home pages need sign-in** (recommended; the instance is private and the proxy
   already requires a session), or they're public to anyone who can reach the instance.
3. **"Most used" counts all-time downloads** (recommended: one column, one query), or downloads
   over the last 30 days, which needs a count per item per day and a cleanup job.
