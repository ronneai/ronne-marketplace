# 020 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. The resolver.** `resolve()`, `RegistryReader`, `Resolution` and `ResolveError` in
  `packages/core`, with an in-memory registry for tests.
  *Done when:* unit tests cover tags, highest-fitting versions, locks (fitting, yanked, no longer
  fitting), deprecation warnings, conflicts with who asked, cycles, missing items, pre-releases and
  determinism.

- [ ] **2. The database registry and the endpoint.** A `RegistryReader` over the items domain, and
  `POST /api/v1/resolve` with 019's conventions.
  *Done when:* database tests cover a resolution and each error, on all four databases.

## Notes
