# 018 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Catalogue queries.** Search, type and scope filters, both sorts and cursor paging over
  published items, in an `items` domain service that 019 will reuse.
  *Done when:* database tests cover search (with `%` and `_`), each filter, both sorts, paging, and
  items without an installable version, on all four databases.

- [ ] **2. Markdown.** The chosen library through the dependency checklist, with raw HTML off, safe
  links and images, and shifted headings.
  *Done when:* unit tests cover ordinary Markdown and hostile input (script tags, event attributes,
  `javascript:` links).

- [ ] **3. The catalogue page.** Search box, filter chips, sort, cards, paging, the empty state, and
  the nav item.
  *Done when:* render tests pass.

- [ ] **4. The item page.** Header, install commands, the tabs, another version by URL, and 404s.
  *Done when:* render tests pass, and the Playwright test in the acceptance criteria passes.

## Notes
