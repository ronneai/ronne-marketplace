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

- [x] **2. The page `/admin/users/[id]`.** Header, the sections of the spec and a back link, with the
  Account, Sign-in and access, Workspaces, Their data and Erase sections; read-only for root's own
  and an erased account; 404 for non-root and unknown ids.
  *Done when:* component tests render each state (active, disabled, erased, own, SCIM-managed, two-factor
  on and off) and the page test checks the 404s.

- [x] **3. The actions on the page.** Mount the existing dialogs (`ActionForm`, the workspaces,
  download and erase dialogs) on the page, each returning here with the page refreshed; their
  server actions revalidate the page as well as the list.
  *Done when:* tests show each action calls its server action and the page shows the new state; the
  existing action tests pass unchanged.

- [x] **4. The list without actions, with Last sign-in.** Drop the Actions column and
  `UserRowActions` (and the row variants of the download, erase and workspaces buttons); Name
  first, then Email, the same width; Name links to the page, add *Open*, and on a phone the email
  covers the row as the link; make the role badges plain, keep the SCIM badges; no cell breaks a
  line (a `nowrap` option on the data table's columns); add the Last sign-in column (hidden on
  phones; *Never*; an en dash for erased), filled by the one query of task 1.
  *Done when:* the list's tests pass without action buttons and show the links and the three Last
  sign-in states, the column order and that no cell wraps; a browser check at 1280px and 1440px finds no overflowing cell.

- [ ] **4b. Icons in the list.** An `IconLink` beside `IconButton` (sharing its classes); *Open* becomes
  a chevron `IconLink` named "Open <email>"; a copy `IconButton` beside each email that copies it
  (check mark for two seconds; selects the email where nothing can copy); the Name and Email
  columns widen so the longest typical email still fits beside the icon. Record the decision for
  other tables in the spec (done: decision 6).
  *Done when:* component tests cover `IconLink` and the copy button's markup; the list test shows
  both icons with their names and no word "Open" text; a browser check clicks the copy icon with
  clipboard permission and reads the email back, and the table still has no overflowing cell at
  1280px and 1440px.

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

- **Task 2: the phone sweep** (found by the pre-commit test): `pages-coverage.test.ts` requires every
  page in the sweep, so `/admin/users/[id]` went in with task 2 (`e2e/pages.ts`, the sweep's member
  gives the id); the phone and tablet sweep passed on it. Task 6 still adds the axe run and moves
  the e2e steps.
- **Task 3: moved and changed** (Claude). The dialogs' form code moved from `UserRowActions.tsx` to
  `UserActionDialogs.tsx` unchanged (the row keeps working until task 4 deletes it); the page's
  buttons are `UserPageActions.tsx`; `DownloadDataButton`, `EraseUserButton` and
  `UserWorkspacesButton` gained a `variant` for the page. While looking at an erased account's page
  in a browser, its *Provider* row (which repeated the *Erased on* badge) went: the spec says an
  erased account shows its pseudonym, *Erased on* and the greyed download, nothing of SCIM's.
- **Task 4:** `ScimManagedNotice` now lives in `UserActionDialogs.tsx`, so nothing is left to move
  when `UserRowActions` goes.
- The overflow is in `UsersPage.tsx` (`w-[17rem]` on the Actions column) and `UserRowActions.tsx`
  (`whitespace-nowrap` buttons in a `min-w-0` fieldset); task 4 removes both rather than widening.
