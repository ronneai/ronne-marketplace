# 033 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Spec and plan.** This feature's SPEC and PLAN, and its row in the index.
  *Done when:* they're committed.

- [ ] **2. Documentation shell and HelpTip.** `/docs` with its topic list and pages, the nav item,
  and the shared `HelpTip`.
  *Done when:* render tests cover the topic list, a topic page, the nav item and HelpTip.

- [ ] **3. Topics.** The eight topics' content, from MVP §2–§4 and the M2–M3 specs, with the type
  descriptions shared with the New item form.
  *Done when:* render tests cover each topic's sections, and the types match the form's.

- [ ] **4. Inline helpers.** HelpTips in the places the spec lists, and a test that every "Learn
  more" target exists.
  *Done when:* render tests pass, and the Playwright test in the acceptance criteria passes.

## Notes
- **Built on the recommendations (2026-09-28).** The owner started 033 without a spec; it was
  written first and built without waiting for answers: the documentation needs sign-in, and each
  topic has its own page.
