# A sort by timestamp needs a tie-breaker

Two rows can have the same `publishedAt`: SQLite stores milliseconds, the e2e seed inserts versions
in a tight loop with a synchronous driver, and `new Date()` can return the same millisecond twice.
With no tie-breaker the order is whatever the database returned, so a test that reads "the last
Exactly version" can flip between runs. On 2026-10-26 `version-pin.e2e.ts` failed on Chromium,
retries included (the seed runs once per run, so a retry sees the same data), and passed on a re-run.

## What to do

- **Use `compareNewestFirst`** (`@ronneai/core`, `versions.ts`) as the tie-breaker for versions. The picker
  (`dependency-search.ts`) sorts by `publishedAt` and then by it; `dependency-search.test.ts` covers equal
  timestamps, and the e2e seed now publishes its versions a millisecond apart.
- **Sort by time and then by something unique.** `listing.ts` breaks ties by `id`, and `versions.ts`
  by `version`. Do the same wherever a list of versions is ordered by `publishedAt`.
- **Prefer a semver comparison** for "newest version": a backport released later (1.0.1 after 2.0.0)
  sorts first by time alone.
- **Give seeded rows distinct times**, such as the loop index added in milliseconds, and add a unit test
  with equal timestamps for any new ordering.

## How to spot it

A test passes alone and on most runs, then fails with the expected row in the other position, on a
re-run it passes. The failing run's seed produced equal timestamps.

## Why (root cause)

1. The newest "Exactly" row was 1.1.0 when 1.0.0 was expected. `confirmed` (the log).
2. The picker shows the server's order. `confirmed` (`DependencyField.tsx`, `model.ts`).
3. `dependency-search.ts` sorts by `publishedAt` only, with no tie-breaker. `confirmed`.
4. The seed gives both versions the same millisecond. A tie in that run is a `hypothesis`: it fits a
   failure that repeated within a run and passed on a re-run, but the data was not inspected.

Found: 2026-10-26. Evidence: PR #243's first CI run.
