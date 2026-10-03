# 079 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Benchmark, and the baseline.** `apps/web/scripts/feed-benchmark.ts` and the
  `bench:feeds` script: a throwaway database and storage, N seeded skills, then the cold and warm
  marketplace requests per tool, timed, with each marketplace's size. Run it on SQLite and on
  PostgreSQL (`pnpm test:db:up`) at 1,000, 5,000 and 10,000 items, before any change.
  *Done when:* the baseline numbers are in the notes below.

- [ ] **2. The catalogue revision.** A migration with the one-row counter and the `plugin_feeds`
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
