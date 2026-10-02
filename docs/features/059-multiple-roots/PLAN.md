# 059 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Model, errors and the self rule.** Any of the three roles can be given (`isRole`;
  `ASSIGNABLE_ROLES` goes). Replace `CannotModifyRootError` with `CannotModifySelfError`, and add
  `LastRootError`. `loadTarget` refuses the actor's own row instead of every root, so roots manage
  each other. The `ERR:` notices come from the existing `IdentityError` mapping.
  *Done when:* `user-admin.db.test.ts` covers creating a root, promoting, demoting, disabling,
  enabling and resetting another root, and every self action; `actions.test.tsx` covers the new
  message; nothing imports `CannotModifyRootError`.

- [x] **2. Repository: roots and locks.** `IdentityRepository` gains `lockRoots(actorId)` (the
  root rows and the actor's row, via `forUpdate`), `countActiveRoots()`, `listRoots()` and
  `findFirstRoot()`, which replaces `findRoot()` (setup's "has a root" is `findFirstRoot() !==
  null`). Identity transactions run in `readCommittedTransaction`.
  *Done when:* `kysely-identity-repository.db.test.ts` (listing, counting, and a second
  transaction waiting on `lockRoots` and then seeing the first's change) passes on SQLite and
  against `pnpm test:db:up` (PostgreSQL, MySQL, MariaDB).

- [x] **3. Services: the actor and the last root.** Every `users.manage` service re-reads the
  actor inside the transaction (`ForbiddenError` if they're no longer an active root). `changeRole`
  and `disableUser` lock, change, then check `countActiveRoots() > 0` (`LastRootError`).
  *Done when:* `user-admin.db.test.ts` covers a demoted actor and the last-root guard. A
  concurrency test runs two mutual demotions in parallel and expects one success, one
  `ForbiddenError` and one active root, on all four databases.

- [ ] **4. Setup and reset-root-password.** Setup state uses `hasRoot`, and setup's message uses
  `findFirstRoot` and the count (warning only when every root is disabled). `reset-root-password`
  takes `--email` / `RONNE_ROOT_EMAIL`: interactive choice when there are several roots, exit 2
  without it under `--yes`, exit 2 for a non-root email. Audit metadata gains `email`. Rebuild
  `dist-scripts`.
  *Done when:* `cli.test`, `steps.db.test.ts`, `root-account.db.test.ts` and
  `reset-root-password.db.test.ts` cover one root, several roots, `--email`, a non-root email and
  "every root disabled".

- [ ] **5. Admin UI.** The role select offers `root`, with the warning line. Change role shows the
  to-root and from-root confirmations. Another root's row has every action, and the disable dialog
  notes "is a root". The signed-in root's row shows "You" with the `own-row` helper. The page
  passes the current user's id to the table.
  *Done when:* `admin-users.test.tsx` covers the root option, both confirmations, the "You" row and
  another root's full menu.

- [ ] **6. End to end.** `user-admin.e2e.ts`: root creates a second root, who signs in and opens
  `/admin/users`. The second root demotes the first, who then gets 404 on `/admin/users` on the
  next request. Neither can act on their own row.
  *Done when:* `pnpm test:e2e` passes.

- [ ] **7. Documentation and decisions.** The topics, sections and helpers in the spec's
  Documentation section; `ForgotPassword.tsx`; `CannotModifySelfError`'s message.
  *Done when:* the docs render tests pass (`docs.test.tsx`, `sign-in.test.tsx` updated for the new
  wording), every new helper's link lands on a real section, and the index marks 059 `done`.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
