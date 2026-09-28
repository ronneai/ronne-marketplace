# 016 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Tag and version rules.** The pure rules: tag names, `latest` only on stable versions, and
  where `latest` moves after a yank.
  *Done when:* a table test covers each rule and edge case in the spec.

- [ ] **2. Services.** Move, add and remove tags; deprecate and undeprecate; yank and unyank; the
  `versions.manage` permission, the item row lock, and the audit events.
  *Done when:* database tests cover each action, refusals, `latest` after a yank, and concurrent
  changes on all four databases.

- [ ] **3. The Versions page.** The list, and the action dialogs for moderators and root.
  *Done when:* render and action tests pass, and the Playwright test in the acceptance criteria passes.

## Notes
