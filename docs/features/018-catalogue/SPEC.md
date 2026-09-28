# 018 — Catalogue

> Milestone: M3 · Depends on: 015 · Design: [MVP §2](../../MVP/MVP.md#2-personas--roles), [§8](../../MVP/MVP.md#8-web-application), [§9.4](../../MVP/MVP.md#94-database) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md)

## Goal

Everyone signed in can find what's in the registry and decide whether to install it: search and filter
the published items, and open an item's page with its README, versions, dependencies, what it can do
(its risk flags) and the command to install it.

## Scope

**In:**
- **The catalogue** (`/catalogue`): search, filters, sorting and paging over published items.
- **The item page** (`/items/[scope]/[name]`): overview, README, versions (016's page as a tab),
  dependencies, files, risk flags, and the install command.
- Rendering README Markdown safely.
- **Catalogue** in the main nav, for everyone signed in.

**Out:**
- The per-platform support matrix → 026.
- The read API for `rmk` and the MCP server → 019 (the same search service, over HTTP).
- Downloading an artifact from the web page → 019's tarball endpoint.
- Install counts and ratings (MVP §14, later).

## Behaviour

**The catalogue** (`/catalogue`, everyone signed in):
- **Search** (`?q=`): case-insensitive `LIKE` on the name, description and keywords of each item's
  `latest` version, through the `containsInsensitive` helper in `db/` (MVP §9.4).
- **Filters:** type (the 11, as chips with counts) and scope.
- **Sort:** most recently published (the default), or by name.
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
  - **Files:** the shown version's files, sizes and executable flags, from 015's `files`.
  - **What it can do:** the version's risk flags (014), as the review page shows them.
- **Another version** (`?version=1.1.0`): the page shows that version; a banner says it isn't
  `latest`, and whether it's deprecated or yanked.
- **Propose a change** (017), for everyone signed in.
- A missing item, or one with no published version, is a 404.

**Markdown** is rendered on the server with a Markdown library with raw HTML turned off (see Open
questions), headings shifted so the page keeps one `h1`, and the design system's type styles.

## Edge cases

- **A deprecated `latest`:** listed and installable, with its message on the card and the page.
- **A yanked version asked for by URL:** shown, with a banner that new installs can't resolve it.
- **Search with `%` or `_`:** escaped by the `db/` search helper, so they match themselves.
- **A README with a script tag or an event attribute:** shown as text, never run.

## Acceptance criteria

- [ ] The catalogue lists published items only, with search, type and scope filters, both sorts and cursor paging, on all four databases.
- [ ] Each card shows the latest version, the risk badge and deprecation as specified.
- [ ] The item page shows the header, install commands, and the README, Versions, Dependencies, Files and What it can do tabs, for `latest` and for another version.
- [ ] README rendering never runs HTML or scripts from the item, tested with hostile input.
- [ ] Items without a published version aren't listed, and their pages are 404s.
- [ ] Playwright: a user searches for a published skill, filters by type, opens it, reads its README and copies the install command.

## Open questions

1. **Markdown library:** `markdown-it` (MIT) with `html: false` (recommended: safe by default, no
   sanitiser needed), or `marked` (MIT) with a sanitiser, through the dependency checklist.
2. **Catalogue and item pages need sign-in** (recommended; the instance is private and the proxy
   already requires a session), or they're public to anyone who can reach the instance.
