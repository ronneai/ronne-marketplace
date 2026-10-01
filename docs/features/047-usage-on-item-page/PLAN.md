# 047 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. The summary queries.** `usageSummary(itemId, today)` and `usageByVersion(itemId, today)`
  in the usage domain (046's `domains/usage`; repository interface and Kysely implementation), with
  the 20-event minimum and the 20-run rule applied in the service, not the page.
  *Done when:* `*.db.test.ts` covers the minimum either side of 20, the 30-day window, per-tool and
  per-version counts, the 14 full days without today, the outcome split and a type without runs; on
  all four database servers.

- [ ] **2. Stat cards.** The item page service returns the summary; Installs, Runs and Works in's
  shares replace 045's cards at the minimum and over, the minimum line below it, nothing with usage
  off and no data.
  *Done when:* `item-page.test.tsx` covers below, at and above the minimum, the success rate
  either side of 20, a type without runs, and usage switched off.

- [ ] **3. The Usage card.** Daily runs with the peak, by tool, by trigger, by outcome, the gaps, the
  note and the text alternatives; SVG and CSS from the design tokens.
  *Done when:* component tests cover each part and an empty day, and `catalogue.e2e.ts` opens an
  item with seeded usage and reads the peak.

- [ ] **4. The Versions page and dialogs.** The Runs and Installs columns, and the counts in the
  deprecate and yank dialogs.
  *Done when:* the versions feature's tests cover the columns under the minimum and both dialogs.

- [ ] **5. Documentation.** The sections and the `usage` helper in the spec's Documentation section.
  *Done when:* the docs render tests pass, and the helper's link lands on `usage#reading`.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Task 1.** The repository returns an item's rows for the window; `models/usage-summary.ts` sums
  them in TypeScript (a few hundred rows at most), so no dialect differs. Under the minimum the
  service returns only `shown: false` with whether anything is stored, so no number can reach the
  page. Bundles count as a type without runs.
