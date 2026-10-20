# 123 — A page for each user, with the actions

> Milestone: M16 · Depends on: 008, 059, 092, 103, 104, 105, 108 · Design: [MVP §8](../../MVP/MVP.md#8-web-application) · Contracts: none new

## Goal

Root opens a user's own page from the Users list and finds there everything about the account and
every action on it. The list goes back to being a list: who, what role, what status, when they last signed in, and a way in.
Today the list carries six buttons on each row and they draw over the Status and Created columns
(the report, 2026-10-20).

## The problem

`UserRowActions` renders up to six buttons in one row: *Change role*, *Reset password*, *Reset
two-factor* (when it's on, 105), *Disable* or *Enable*, *Download their data* (104) and *Erase*
(103). Each is `whitespace-nowrap`, which is roughly 560px of text in a column fixed at
`w-[17rem]` (272px) in `UsersPage.tsx`. The fieldset has `min-w-0` and `justify-end`, so the extra
width doesn't widen the column or scroll the table: it spills to the left and prints over the
Status and Created cells (in the report, "active" and "2026-10-20" are overprinted by "Change role"
and "Reset password"). A seventh button, Reset two-factor, makes it worse, and the *Managed by …*
badges (108) make the Role column taller on the same row.

How bad: on a desktop-width screen it is visible on every row but your own, the text under the
buttons can't be read, and a click on the Status text lands on a button. Every action still works,
and no data is wrong. It grew with each feature that added a button (103, 104, 105), and the
comment above the fieldset ("the table scrolls sideways") is no longer true: nothing scrolls.

## Scope

**In:**
- **A user page, `/admin/users/<id>`**, root only (`users.view`; anyone else gets a 404, as the list
  does). It shows the account and holds all the actions.
- **The Users list loses its action buttons.** Each row shows Name, Email, Role, Status, **Last
  sign-in** and Created (owner, 2026-10-20: the name first, then the email, the two of the same
  width, and no cell breaks a line). The name is a link to the user's page, with an *Open* link at
  the end of the row so the way in is also visible, 44px on a coarse pointer.
- **The same actions, in the same dialogs**, moved to the page: change role, reset password, reset
  two-factor, disable or enable, download their data, erase. The dialogs, their server actions and
  their rules (059, 103, 104, 105, 108) don't change.
- **Last sign-in, in the list and on the page:** the time of the account's latest web sign-in, read
  from the audit log (below); no migration.
- **The workspaces a user is in**, with their role in each, on the page; the *Workspaces* dialog (092)
  that the role badges open moves there as a button.
- **Where else the page is linked from:** the audit log's event details (today they link to
  `/admin/users?q=<email>`) and the Users search.

**Out** (and where it goes instead):
- Anything root can't do today. The page is a place for existing actions, with no new permission.
- A person's own account page (`/account`), and workspace admins managing their own members
  (workspace pages, 091).
- Bulk actions on several users.
- Sorting or filtering the list by last sign-in (the column is shown, not sorted: the time lives in
  the audit log, and a sort would need a join on every page; see the open questions).
- A token's last use (the access tokens page has it, 009) and `rmk login`: not a web sign-in.
- A list of what the person submitted or reviewed: *Download their data* has it (104), and the audit
  log is one link away.

## Behaviour

**The list.** `/admin/users`: the same search, filters, sorting and paging (061). The Actions column
is gone. A **Last sign-in** column follows Status: the day and time in the person's own time zone
(`LocalTime`), such as *2026-10-20 09:12*, with the full time on hover, or *Never* for an account
with no sign-in on record and an en dash for an erased one. It is hidden on a phone, as Status and
Created are, and shown on the page. The Role cell shows root, or the role badges with their counts (092), as plain badges with
the hover list; the SCIM badges (108) stay under the role. **Columns,
left to right:** Name (sortable), Email (sortable, the same width as Name), Role, Status, Last
sign-in, Created (sortable), Open. Every cell stays on one line: Name and Email are cut with an
ellipsis (the full text on hover), the others are wide enough for their value. On a phone Name,
Status, Last sign-in, Created and Open are hidden, and the email is the link, covering the whole
row: a tap anywhere opens the page.

**The page.** A header with the name and the email, the role badge, and the status (*active*,
*disabled*, or *Erased on* a date), then sections in one column (two on a wide screen):

| Section | Shows | Actions |
|---|---|---|
| Account | email, name, role, status and when it changed, created date, last sign-in, two-factor on or off, the identity provider and SCIM state if any (108) | *Change role* |
| Sign-in and access | the number of sessions and personal access tokens | *Reset password*, *Reset two-factor* (only when it's on), *Disable* or *Enable* (the dialog still counts what it ends) |
| Workspaces | each workspace and the role there, root's own row says "root: every workspace" | *Manage workspaces* (the dialog of 092) |
| Their data | what *Download their data* gives, and a link to their events in the audit log (`/admin/audit?actor=<email>`) | *Download their data* |
| Erase this account | what erasing does and that it can't be undone (103) | *Erase* (the same typed confirmation) |

Erase sits last and apart, as the only action that can't be undone. Each action opens the dialog it
opens today and returns here with the page refreshed.

**Your own page.** Root opening their own row sees the page read-only: the account and workspaces,
with a notice in place of the actions (059), "This is your own account. Another root changes your
role, disables you or resets your password. Change your password in Account.", and the `own-row`
helper. No action shows, the data download included, as the own row of the list offered none.

**An erased account** shows its pseudonym, *Erased on*, and the greyed download (104); nothing else
can change it (103).

**A SCIM-managed account** keeps the notice its dialogs show now (*<provider> manages this account
through SCIM*), and shows it at the top of the page too, since a change here may be undone by the
next sync (108).

**Phones** (065): one column, the actions as full-width buttons 44px tall, dialogs full screen as
elsewhere; the list shows email and role, and the row opens the page.

**Navigation.** The sidebar's *Users* stays current on `/admin/users/<id>` (the nav item's section
is already `/admin/users`). The page has a *Users* back link above the header, and the browser's
back button returns to the list with its filters, since they are in the URL (061).

## Edge cases

- **An id that doesn't exist, or isn't a user's:** 404.
- **Not root:** 404, with no hint that the user exists.
- **The user is changed while the page is open** (disabled by another root, erased): an action fails
  with the error it shows today, and the page shows the new state on refresh.
- **The last root:** the actions that would remove it (role, disable, erase) refuse, as today.
- **Last sign-in means a web sign-in:** an `auth.signed_in` event, written for a password, an
  identity provider's sign-in (106) and the second step (105), and not for `rmk login --web` (107),
  a token's use or a session that was only kept alive. An account that has only used tokens shows
  *Never*, and the page says what the time counts.
- **Retention** (102): the purge clears IP addresses from events and keeps the events, so the time
  survives it. An account created before the audit log recorded sign-ins has none (*Never*).
- **An erased account** (103) shows an en dash: its events stay under the pseudonym, and nothing
  about when the person last signed in is shown.
- **A user with no workspaces:** the Workspaces section says "None".
- **JavaScript off:** the list and the page render; the actions are dialogs and need it, as today.

## Documentation

- **Administration → Users** (`admin#users`): rewritten for the page: open a user from the list,
  what the page shows, the Last sign-in column and what it counts, where each action is. Changed in ronne-web (en, pt, fr); no section id is
  added, so both `topics.ts` stay as they are.
- **Helpers:** `own-row`, `role-root`, `reset-two-factor` and `scim-managed` keep their wording and
  move with their actions; no new helper.
- **Other topics** that say "in the Users list" for an action (Privacy: erase and download; Two-factor:
  reset; SCIM: disable) say "on the user's page". Found by a search of the Documentation's text for
  *Users list* and *row*.

## Acceptance criteria

- [ ] `/admin/users` shows no action buttons, and its Status and Created columns are readable at
  1280px, 1440px and on a phone: nothing overlaps.
- [ ] The list shows a Last sign-in time for an account that signed in with a password, with an
  identity provider and with two-factor; *Never* for one that has not; an en dash for an erased one;
  the same time is on the page.
- [ ] The times of the page's rows come from one query for the rows shown, not one per row.
- [ ] Each row's name and its *Open* link go to `/admin/users/<id>` (on a phone, the email and the
  row); a click elsewhere on the row does nothing surprising (the Role cell no longer opens a dialog).
- [ ] No cell of the list breaks a line, at 1280px and 1440px, and Name and Email have one width.
- [ ] The page shows the sections above, with real data, and every action works from it and ends
  back on the page showing the new state.
- [ ] Anyone but root gets a 404 on the page; an unknown id is a 404 for root.
- [ ] Root's own page and an erased account's page are read-only, as their rows were.
- [ ] The audit log's event details link to the user's page when the event names an account.
- [ ] The phone sweep (065) and the axe check cover the list and the page.
- [ ] The e2e tests that clicked row buttons (`user-admin.e2e.ts`, `scim.ts`, and others found by
  searching for *Reset password* and *Change role*) use the page instead.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **A page, not a wider table or a menu per row** (owner, 2026-10-20). Six actions, three of them
   destructive, are too much for a row; a dropdown was ruled out before because the table scrolls
   sideways and would clip it (the comment in `UserRowActions`); a page also has room for the
   account's state, which the actions' dialogs only hint at.
2. **The existing dialogs are kept** (Claude): their server actions, copy and tests stay, so this
   moves buttons and adds a page; it doesn't change what an action does.
3. **The workspaces dialog moves to the page** (Claude): the list's role cell becomes plain badges,
   so the row has one place to go.
4. **Erase is its own section at the end** (Claude), since it can't be undone.
5. **Last sign-in is read from the audit log, not stored on the user** (Claude): `auth.signed_in` is
   already written at every web sign-in, kept for ever by retention, and `audit_log` is indexed by
   actor, so one grouped query over the page's rows (`max(created_at)` per `actor_id`) gives it with
   no migration, no backfill and no second place to keep the time. A column on `user` is the
   alternative if that query turns out slow.

## Open questions

- Should the list sort by last sign-in (to find who never signed in, or who left)? It needs a join
  or a stored column (decision 5), so it is left out here; the status filter could instead gain
  *never signed in*.
- Should a sign-in through `rmk login --web` or a token's use count as activity? Default: no, they
  are not a person signing in to the web app.
- Should a quick action stay on the row, such as *Disable*? The default is no: the page is one click
  away and the list stays a list.
- Is the audit link `?actor=<email>` enough, or should the audit log also filter by account id? The
  filter matches part of the email today (060), so the pseudonym of an erased account also works.
