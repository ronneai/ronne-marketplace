# 026 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. `supportOf`.** The pure function in core over `RENDERERS` and the manifest's `targets`,
  and `support` in the API's summaries and versions.
  *Done when:* unit tests cover the four levels, and the API tests see `support`.

- [ ] **2. The item page and cards.** The Tools panel, the card marks, and `?tool=` on the catalogue.
  *Done when:* render tests cover the panel for `latest` and another version, and the database
  tests cover the filter on all four databases.

- [ ] **3. Documentation.** The types table's tool columns, the Installing line, and the helper.
  *Done when:* the docs render tests cover them, and the helper's link lands on a real section.

## Notes
