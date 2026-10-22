# 127 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Table, model and repository.** [risky] Migration `feedback`, the model (kinds, status,
  limits, page-path sanitising that drops the query), repository behind an interface, cascade
  rules for user delete.
  *Done when:* unit tests cover validation and path sanitising; `*.db.test.ts` pass on SQLite and,
  run once, on the other servers; the migration guard test passes.

- [x] **2. Service and actions.** `sendFeedback` (rate limit 10/hour via the existing limiter),
  `listFeedback`, `markHandled` (bulk), `deleteFeedback`, `countNewFeedback`; root-only checks;
  `feedback.handled` and `feedback.deleted` audit actions and the `feedback` audit group.
  *Done when:* tests cover the limit, a non-root refused on the server, bulk acting only on the
  selected ids, and audit rows without message text.

- [x] **3. The dialog and the page.** Sidebar and Menu entry, the dialog (full-screen below `sm`),
  the `/feedback` page for no-JavaScript, the confirmation.
  *Done when:* component tests cover validation messages, the page path option and the
  confirmation; held people are redirected first (the `holdPage` guard test lists the page).

- [x] **4. Admin › Feedback.** A server data table (060) with sort, filters (kind, status), search,
  paging in the URL, detail dialog, bulk handled and delete; the sidebar count for root.
  *Done when:* component tests and `*.db.test.ts` for the query pass; non-root gets not-found.

- [x] **5. Privacy.** Feedback in "Your data" (104); deleted on erase (103); the retention setting
  for handled feedback on the Privacy tab (102) and the purge in the existing job.
  *Done when:* the data-export, erase and purge tests are extended and pass.

- [x] **6. Messages and phone.** Everything in messages (129) in three languages; scan; phone
  sweep (dialog with the keyboard open, 072).
  *Done when:* parity and scan pass; the sweep passes on every project.

- [x] **7. End to end.** A user sends feedback; root sees the count, opens it, marks it handled;
  rate limit reached; erase removes it.
  *Done when:* the end-to-end tests pass on every project.

- [x] **8. Decision log and index.** MVP §15 row "Feedback" (to the instance's admins, plain text,
  deleted on erase, retention).
  *Done when:* the row is in.

- [ ] **9. Documentation.** The sections and helpers in the spec, both `topics.ts`, in a ronne-web
  branch.
  *Done when:* the docs tests pass in ronne-web, and the helper link test passes here.

## Notes

Independent of 124–126; needs 129's messages. Message text never goes to logs or audit events
(`codeql-logging.md`).

**For the owner, by hand (not a task's claim):** with a real on-screen keyboard on a phone (iOS Safari and Android Chrome), open `/feedback`, focus the message field and check the Send feedback bar stays above the keyboard. Playwright's emulation can't shrink the visual viewport, so the end-to-end test only shows the bar is on screen with the field focused.
