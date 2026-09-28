# 018 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Catalogue queries.** Search, type and scope filters, both sorts and cursor paging over
  published items, in an `items` domain service that 019 will reuse.
  *Done when:* database tests cover search (with `%` and `_`), each filter, both sorts, paging, and
  items without an installable version, on all four databases. Also the migration for
  `items.download_count`, and the home page's queries: recently published, most used, and the
  viewer's counts.

- [x] **2. Markdown.** The chosen library through the dependency checklist, with raw HTML off, safe
  links and images, and shifted headings.
  *Done when:* unit tests cover ordinary Markdown and hostile input (script tags, event attributes,
  `javascript:` links).

- [ ] **3. The catalogue page.** Search box, filter chips, sort, cards, paging, the empty state, and
  the nav item.
  *Done when:* render tests pass.

- [ ] **4. The item page.** Header, install commands, the tabs, another version by URL, and 404s.
  *Done when:* render tests pass, and the Playwright test in the acceptance criteria passes.

- [ ] **5. The home page.** Search box, Recently published, Most used (hidden without downloads),
  For you, and the empty registry, replacing the placeholder.
  *Done when:* render tests cover each section, hidden and shown, for a user and a moderator, and
  the Playwright test starts from the home page.

## Notes
- **Built on the recommendations (2026-09-28).** The owner started 018 without answering the
  spec's open questions: sign-in for every page, and all-time download counts. The Markdown
  library is `marked`, not the recommended `markdown-it` (see task 2).
- **Task 1 (2026-09-28): catalogue queries.** Migration `0009_catalogue` keeps the listing on the
  rows, so listing is one query with the same keyset paging on every database:
  - `items`: `download_count`, `listed_version_id` (`latest`'s version, else the newest),
    `installable` (any version not yanked) and `last_published_at`. `models/listing.ts` computes
    them; the item repository recomputes them after every release, tag change and yank, so no
    caller can forget.
  - `item_versions`: `description` and `keywords` from the manifest (search reads the listed
    version's), and `risk_flags` computed at release from the released files, since file contents
    aren't kept with a version. The migration backfills all of it from each version's revision.
  - `kyselyCatalogueRepository` and `services/catalogue.ts`: search, type and scope filters, type
    counts, both sorts with installable items first, base64url JSON cursors (a bad one starts over),
    24 a page; and the home page's recent and most used lists. The viewer's own counts reuse
    `listMySubmissions` and `countNeedsReview`.
- **Task 2 (2026-09-28): Markdown with `marked`.** `markdown-it` 15 depends on `argparse` 3, which is
  PSF-2.0: not on §1's allowed list, so it would need an exception. `marked` 18.0.14 passes the
  checklist as it is: MIT, no dependencies, its own types, four maintainers, releases every few
  weeks, no advisories (`pnpm audit`), no install scripts. `components/markdown/render-markdown.ts`
  overrides its renderer instead of sanitising afterwards: raw HTML (block and inline) is escaped
  text; links only to http(s), mailto or `#anchors`, checked after stripping the control
  characters and whitespace browsers ignore, and external ones open with `noopener noreferrer
  nofollow`; images only from https, lazy and without a referrer, else their alt text; headings one
  level down. `Markdown` renders it, styled by `.markdown` in globals.css with the tokens.
