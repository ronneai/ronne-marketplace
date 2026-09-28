# 020 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. The resolver.** `resolve()`, `RegistryReader`, `Resolution` and `ResolveError` in
  `packages/core`, with an in-memory registry for tests.
  *Done when:* unit tests cover tags, highest-fitting versions, locks (fitting, yanked, no longer
  fitting), deprecation warnings, conflicts with who asked, cycles, missing items, pre-releases and
  determinism.

- [x] **2. The database registry and the endpoint.** A `RegistryReader` over the items domain, and
  `POST /api/v1/resolve` with 019's conventions.
  *Done when:* database tests cover a resolution and each error, on all four databases.
- [x] **3. Documentation.** The Dependencies and Tags sections.
  *Done when:* the docs render tests cover the new text.

## Notes
- **Built on the recommendations (2026-09-28).** The owner started 020 without answering the
  spec's open questions: no backtracking, and `rmk` resolves with `POST /resolve`.
- **Task 1 (2026-09-28): the resolver.** `packages/core/src/resolve.ts`. Tags become versions
  first. A work queue, always taking the first name in order, settles each item on its locked
  version while it fits every range (even yanked), else the highest non-yanked one that does;
  choosing a new version withdraws the ranges its previous version put on other items, so items
  nothing needs any more drop out. A conflict (several ranges, each met by some version, none by
  all) names every range and who asked; a single range nobody meets is `no_matching_version`.
  Cycles are checked once it settles. Each item is read from the registry once. 13 unit tests,
  including one that pins down the no-backtracking behaviour.
- **Task 2 (2026-09-28): the database registry and the endpoint.** `items/services/resolve.ts`:
  `databaseRegistry` reads an item's versions and tags through the item repository (null for an
  item with no version), and `resolveRequest` runs core's resolver for anyone signed in.
  `postResolve` in `registry-api.ts` checks the body (maps of strings, at most 200 items), answers
  the resolution, and maps `ResolveError` to 409 (conflict, cycle) or 404 (missing item, tag or
  version) with its details. `readJsonObject` moved to `http/read-json.ts`, shared with 009's
  token route.
- **Task 3 (2026-09-28): documentation.** Items and types → Dependencies explains how an install
  picks versions and what a conflict says; Versions and tags → Tags says a tag becomes a version at
  install and the lockfile keeps it.
