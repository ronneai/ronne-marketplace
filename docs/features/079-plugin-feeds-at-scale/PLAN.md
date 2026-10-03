# 079 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Benchmark, and the baseline.** `apps/web/scripts/feed-benchmark.ts` and the
  `bench:feeds` script: a throwaway database and storage, N seeded skills, then the cold and warm
  marketplace requests per tool, timed, with each marketplace's size. Run it on SQLite and on
  PostgreSQL (`pnpm test:db:up`) at 1,000, 5,000 and 10,000 items, before any change.
  *Done when:* the baseline numbers are in the notes below.

- [x] **2. The catalogue revision.** A migration with the one-row counter and the `plugin_feeds`
  stats table (one row per tool), and the MVP data model updated. `ItemRepository` raises the
  revision in the same transaction as each change in the spec's list. A `revision()` read for the
  feeds domain.
  *Done when:* database tests show each change raises it by one, and a rolled-back change doesn't,
  on SQLite, PostgreSQL and MySQL.

- [ ] **3. The marketplace cache.** In `services/plugin-feed.ts`: read the revision, answer from an
  in-memory cache keyed by tool, revision, builder version and `PUBLIC_URL`. Cache only a complete
  marketplace, stored under the revision read before the build.
  *Done when:* tests with a counting catalogue and storage show a cache hit reads neither; a release
  invalidates it; an incomplete build isn't cached.

- [ ] **4. Stats, warnings and the cap.** Record each build in `plugin_feeds`. Log a warning past
  4 MiB (Claude Code) or 5 seconds (any tool), once per revision. Apply the 5 MiB cap only to Claude
  Code, with the new 507 message.
  *Done when:* tests cover both thresholds (a fake clock and an injected size), one warning per
  revision, Codex and Cursor never answering 507, and the message.

- [ ] **5. Admin › Settings › Plugin feeds.** The panel and its warning notice (amber, a token), for
  root only, with the inline helper.
  *Done when:* render tests cover "Not built yet", a normal build and a warning; the Admin page tests
  still pass; the mobile sweep passes.

- [ ] **6. Documentation, the decision, and the second measurement.** The *Large marketplaces*
  section, the Admin sentence and the helper. Run the benchmark again with the cache, and fill in
  the spec's Measured section. If the numbers meet the trigger, say so in the decision log and
  propose the per-scope feature to the owner.
  *Done when:* the docs render tests pass, and the Measured section and the decision log are
  current.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

### Baseline (task 1, 2026-10-03, before any change)

`pnpm bench:feeds` and `pnpm bench:feeds --db postgres` on the owner's Mac (Apple silicon), Node 24,
PostgreSQL 15 in Docker. Seeding took 12 s (SQLite) and 51 s (PostgreSQL) for 10,000 items.

| Database | Items | Tool | Marketplace size | Cold (s) | Warm (s) | Repeat (s) |
|---|---|---|---|---|---|---|
| sqlite | 1000 | claude-code | 492 KiB (9.6%) | 2.65 | 0.10 | 0.07 |
| sqlite | 1000 | codex | 487 KiB (9.5%) | 2.22 | 0.08 | 0.08 |
| sqlite | 1000 | cursor | 488 KiB (9.5%) | 2.21 | 0.08 | 0.08 |
| sqlite | 5000 | claude-code | 2461 KiB (48.1%) | 10.61 | 0.46 | 0.46 |
| sqlite | 5000 | codex | 2432 KiB (47.5%) | 10.69 | 0.47 | 0.41 |
| sqlite | 5000 | cursor | 2437 KiB (47.6%) | 10.74 | 0.45 | 0.40 |
| sqlite | 10000 | claude-code | 4922 KiB (96.1%) | 20.94 | 1.07 | 1.00 |
| sqlite | 10000 | codex | 4863 KiB (95.0%) | 21.19 | 1.06 | 0.97 |
| sqlite | 10000 | cursor | 4873 KiB (95.2%) | 21.57 | 1.07 | 1.01 |
| postgres | 1000 | claude-code | 492 KiB (9.6%) | 5.34 | 0.11 | 0.08 |
| postgres | 1000 | codex | 487 KiB (9.5%) | 5.24 | 0.09 | 0.10 |
| postgres | 1000 | cursor | 488 KiB (9.5%) | 5.20 | 0.10 | 0.09 |
| postgres | 5000 | claude-code | 2461 KiB (48.1%) | 25.35 | 0.57 | 0.51 |
| postgres | 5000 | codex | 2432 KiB (47.5%) | 25.14 | 0.55 | 0.52 |
| postgres | 5000 | cursor | 2437 KiB (47.6%) | 25.50 | 0.58 | 0.52 |
| postgres | 10000 | claude-code | 4922 KiB (96.1%) | 50.83 | 1.39 | 1.31 |
| postgres | 10000 | codex | 4863 KiB (95.0%) | 50.28 | 1.41 | 1.32 |
| postgres | 10000 | cursor | 4873 KiB (95.2%) | 51.20 | 1.42 | 1.30 |

What it shows:
- **Size is the limit that binds, not time.** An entry is about 490 bytes, so Claude Code's
  marketplace is 4.8 MiB (96% of 5 MiB) at 10,000 items. The 80% warning would fire near 8,300
  items, and the 507 near 10,400.
- **A warm request is fast**: at most 1.4 s at 10,000 items. The time trigger (5 s warm at 5,000
  items or fewer) is far off: 0.57 s.
- **The cold path is slow**: about 2 ms per plugin on SQLite and 5 ms on PostgreSQL. With 077's 5 s
  build budget per request, a fresh 10,000-item instance needs about 10 marketplace requests before
  every item is listed; so does every instance after a `PLUGIN_BUILDER_VERSION` bump, which builds
  every zip again. Items missing meanwhile can't be installed or updated from the marketplace (they
  aren't uninstalled: Ronne doesn't set `forceRemoveDeletedPlugins`). Not in 079's scope; raised
  with the owner.

