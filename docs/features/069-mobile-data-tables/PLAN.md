# 069 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Column API.** `primary`, `mobile: "show" | "meta" | "hide"`, `hideBelow`; `hideOnMobile`
  becomes `mobile: "hide"` everywhere; primary minimum width and frame scroll from `sm`.
  *Done when:* `data-table.test.tsx` covers the new settings; typecheck forces one `primary`.

- [ ] **2. Stacked rows.** The below-`sm` rendering in `DataTable` (heading with checkbox, meta,
  labelled lines, actions row), and the Sort select in the filter bar.
  *Done when:* unit tests render a table at both layouts (by class) and the Sort select keeps the
  URL parameters.

- [ ] **3. The five `DataTable` pages.** Settings for My submissions, the queue tabs, Users,
  Scopes, Audit log; `hideBelow` where the tablet needs it.
  *Done when:* their unit tests pass; `tables.mobile.e2e.ts` submits a draft and approves from a
  phone; the tablet project shows Users and To release without a starved column.

- [ ] **4. `Table`'s stacked mode.** Shared cell renderer; Versions, Access tokens and the bulk
  dialogs' lists use it.
  *Done when:* unit tests pass; e2e yanks a version and revokes a token from a phone.

- [ ] **5. Prose tables.** Minimum column widths for the docs tables and Dependencies tab;
  `ProposalChanges` stacks below `sm`.
  *Done when:* the docs render tests pass; the sweep's 069 entries are removed and it passes.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
