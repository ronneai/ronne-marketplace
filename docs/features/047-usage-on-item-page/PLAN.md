# 047 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **0. Decisions.** The owner answers the spec's open questions; the answers go into the spec
  and, for the threshold and "Most used", MVP §14.6 and the decision log (§15).
  *Done when:* no open question is left without an answer in the spec.

- [ ] **1. The summary queries.** `usageSummary(itemId, today)` and
  `activeProjectsByVersion(itemId, today)` in the items domain (repository interface and Kysely
  implementation), with the 5-project rule and the 20-run rule applied in the service, not the page.
  *Done when:* `*.db.test.ts` covers the threshold either side of 5, the active window, per-tool and
  per-version counts, the 14 full days without today, the outcome split, a type without runs, and
  that nothing per project is returned; on all four database servers.

- [ ] **2. Stat cards.** The item page service returns the summary; Active projects, Runs and Works
  in's shares replace 045's cards above the threshold, the threshold line below it, nothing with
  usage off and no data.
  *Done when:* `item-page.test.tsx` covers below, at and above the threshold, the success rate
  either side of 20, a type without runs, and usage switched off.

- [ ] **3. The Usage card.** Daily runs with the peak, by tool, by trigger, by outcome, the gaps, the
  note and the text alternatives; SVG and CSS from the design tokens.
  *Done when:* component tests cover each part and an empty day, and `catalogue.e2e.ts` opens an
  item with seeded usage and reads the peak.

- [ ] **4. The Versions page and dialogs.** The Active projects column, and the count in the
  deprecate and yank dialogs.
  *Done when:* the versions feature's tests cover the column under the rule and both dialogs.

- [ ] **5. Documentation.** The sections and the `usage` helper in the spec's Documentation section.
  *Done when:* the docs render tests pass, and the helper's link lands on `usage#reading`.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
