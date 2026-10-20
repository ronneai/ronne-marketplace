# 123 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. The page's data.** A read for one user for root: the account, workspaces with roles,
  two-factor, SCIM state, last sign-in, and the number of sessions and tokens, from the queries the list and
  `adminDisableImpact` already use; null for an unknown id; `users.view` checked.
  A **last sign-in** read for a set of user ids: the latest `auth.signed_in` per actor, in one query
  (used by the list for its page of rows, and by the page for one).
  *Done when:* action tests cover root, a non-root (refused), an unknown id, an erased account and a
  SCIM-managed one; a `.db.test.ts` covers the counts and the last sign-in (password, identity
  provider and two-factor events; none; the latest of several) on the test database, run on all
  three servers since it is database code.

- [ ] **2. The page `/admin/users/[id]`.** Header, the sections of the spec and a back link, with the
  Account, Sign-in and access, Workspaces, Their data and Erase sections; read-only for root's own
  and an erased account; 404 for non-root and unknown ids.
  *Done when:* component tests render each state (active, disabled, erased, own, SCIM-managed, two-factor
  on and off) and the page test checks the 404s.

- [ ] **3. The actions on the page.** Mount the existing dialogs (`ActionForm`, the workspaces,
  download and erase dialogs) on the page, each returning here with the page refreshed; their
  server actions revalidate the page as well as the list.
  *Done when:* tests show each action calls its server action and the page shows the new state; the
  existing action tests pass unchanged.

- [ ] **4. The list without actions, with Last sign-in.** Drop the Actions column and
  `UserRowActions` from the list; the email links to the page, add *Open*, make the role badges
  plain, keep the SCIM badges; add the Last sign-in column (hidden on phones; *Never*; an en dash
  for erased), filled by the one query of task 1; the row links as a whole on a phone.
  *Done when:* the list's tests pass without action buttons and show the links and the three Last
  sign-in states; a check at 1280px and 1440px finds no overlapping cell (browser test).

- [ ] **5. Links in.** The audit log's event details link to the page when the event names an account;
  the page's audit link (`/admin/audit?actor=`) works.
  *Done when:* `admin-audit` tests cover both links.

- [ ] **6. e2e and phone.** Move every e2e step that clicked a row button (`user-admin.e2e.ts`,
  `scim.ts`, and any other found by searching *Reset password*, *Change role*, *Disable*, *Erase* and
  *Download their data*) to the page; add the list and one page to the phone sweep (065) and the axe
  run.
  *Done when:* `pnpm test:e2e` passes on the desktop, phone and tablet projects.

- [ ] **7. Documentation.** Administration → Users in ronne-web (en, pt, fr), the other topics that say
  "Users list" for an action, and the helpers that moved.
  *Done when:* the Documentation's render tests pass in ronne-web and the helper link test passes here.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- The overflow is in `UsersPage.tsx` (`w-[17rem]` on the Actions column) and `UserRowActions.tsx`
  (`whitespace-nowrap` buttons in a `min-w-0` fieldset); task 4 removes both rather than widening.
