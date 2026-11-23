# 026 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. `supportOf`.** The pure function in core over `RENDERERS` and the manifest's `targets`,
  and `support` in the API's summaries and versions.
  *Done when:* unit tests cover the four levels, and the API tests see `support`.

- [x] **2. The item page and cards.** The Tools panel, the card marks, and `?tool=` on the catalogue.
  *Done when:* render tests cover the panel for `latest` and another version, and the database
  tests cover the filter on all four databases.

- [x] **3. Documentation.** The types table's tool columns, the Installing line, and the helper.
  *Done when:* the docs render tests cover them, and the helper's link lands on a real section.

## Notes

- Task 1 added migration 0011 (`item_versions.disabled_targets`) with the filter itself, since the
  API's summaries need each listed version's support and the catalogue query doesn't load
  manifests. Tested on SQLite, PostgreSQL 15, MySQL 8.4 and MariaDB 10.11.
- Task 2: the tool path lists moved from `features/docs/` to `components/tools/tool-paths.ts`, since
  the item page uses them too (`placeFor` puts the item's name into the path). The card marks went
  into the footer line after a screenshot showed a line of its own on every card was noisy.
- Task 3: the types table's tool columns were already done by 025's rework of Items and types.
  `rmk info` and `rmk search --target` were added here, as the spec's API section anticipated.

