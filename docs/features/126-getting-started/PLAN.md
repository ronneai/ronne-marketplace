# 126 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. The state table.** Migration `user_onboarding`, repository and model (defaults when no
  row), cascade on user delete, included in "Your data" (104) and removed on erase (103).
  *Done when:* `*.db.test.ts` pass on SQLite and, run once, on the other servers; the data-export
  and erase tests are extended.

- [x] **2. Reading the steps.** A service `gettingStarted(userId)` returning each step's state from
  tokens (not revoked; used; device grant approved), the confirm button and submissions, plus
  the panel's visibility (`hidden`, `completed_seen_at`).
  *Done when:* unit and database tests cover every row of the detection table, a revoked token, an
  existing complete account (panel not shown) and that a usage `install` total ticks nothing.

- [x] **3. Actions.** Hide, confirm installed, show again, mark "You're set up" seen; thin server
  actions.
  *Done when:* action tests cover each, and that one person can't change another's.

- [x] **4. The panel.** Steps with their actions, progress, the commands from the tokens page's
  function (shared, not copied), copy buttons, the "You're set up" state; fills 124's slot.
  *Done when:* component tests cover each progress state, the commands with the instance address,
  no token value anywhere, and the no-JavaScript forms.

- [x] **5. Account's "Show getting started again".**
  *Done when:* a component test and an end-to-end step.

- [x] **6. Messages and phone.** Everything in messages (129) in three languages; scan; phone
  sweep.
  *Done when:* parity and scan pass; the sweep passes on every project.

- [x] **7. End to end.** A fresh user sees 0 of 4; creates a token (1 ticked); runs `rmk` through
  the fake CLI step or a direct API call with the token (2 ticked); confirms an install (3 ticked,
  "You're set up"); next visit it is gone; Show again from Account.
  *Done when:* the end-to-end tests pass on every project.

- [x] **8. Banner and steps dialog** (owner, 2026-10-21). Getting started becomes a slim teal banner
  (progress ring, the next step and its one button, Hide) and a dialog with the four steps.
  *Done when:* component and end-to-end tests cover the banner for each next step, its colour, the
  dialog, the no-JavaScript buttons and the phone; the phone sweep passes on every project.

- [x] **9. Compact cards and the Catalogue's view** (owner, 2026-10-21). The item cards on Home, its
  shelves and the Catalogue become a compact card in a grid of at most five to a row, with the date
  on the version's row, two lines of description, no workspace and scope line, and a copy icon; the
  Catalogue gets Grid view and List view.
  *Done when:* tests cover the card, the grid at every window width (never narrower than 17rem,
  never more than five, the same height), the two-line ellipsis measured in a browser, the copy
  icon, and the view switch with and without JavaScript; the phone sweep passes on every project.

- [ ] **10. Documentation.** The sections and helpers in the spec, in a ronne-web branch.
  *Done when:* the docs tests pass in ronne-web, and the helper link test passes here.

## Notes

Depends on 124's slot and 129's messages. Nothing here reads or shows a secret.
