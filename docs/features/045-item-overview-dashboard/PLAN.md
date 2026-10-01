# 045 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Used by and approval.** In the items domain: `dependents(itemId)` (items whose listed
  version depends on it, with their ranges) and `approvalOf(submissionId)` (the latest `approve` or
  `override` event, with the approver's name), and the item page service returning `usedBy` and
  `shown.approval`.
  *Done when:* `*.db.test.ts` covers dependents through listed versions only, an approval, an
  override and a version without review; on all four database servers. (A review's actor can't be
  deleted, `review_events_actor_id_fk` restricts it, so the "former user" case is only a fallback.)

- [ ] **2. The dashboard.** The stat cards, the Install card with quick flags (and the panel gone
  from the other tabs), capabilities and guardrails, the main file card with its role, and the side
  column (package verification, configuration, Used by, maintainers and review, included files).
  *Done when:* `item-page.test.tsx` covers each card from real data and the hidden ones, and
  `catalogue.e2e.ts` copies an install command from the Overview and follows a Used by link.

- [ ] **3. Documentation.** The sections and helpers in the spec's Documentation section.
  *Done when:* the docs render tests pass, and every helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
