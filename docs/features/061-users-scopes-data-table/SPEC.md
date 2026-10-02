# 061 — Users and Scopes on the server data table

> Milestone: Across the app · Depends on: 008, 010, 059, 060 · Design: [060](../060-server-data-table/SPEC.md) · Contracts: none new (`GET /api/v1/scopes` is unchanged)

## Goal

060 built a shared server data table and moved the audit log onto it. Users (008) and Scopes (010)
already page on the server, but each has its own table, its own pagination ("First page" and
"Next" only), no sorting and no page sizes, and a Filter button. This feature moves both onto
`DataTable`, so the admin area's lists look and behave the same: sortable headers, First /
Previous / Next with a total, page sizes, filters that apply as they change, and chips.

## Scope

**In:**
- **`/admin/users`** on `DataTable`:
  - sorting by **email**, **name** and **created**;
  - the existing search (email or name), role and status filters, applying on change, as chips;
  - page sizes of 25, 50 and 100.
- **`/scopes` and `/admin/scopes`** on `DataTable`:
  - sorting by **name** and **created**;
  - the existing search (name or description), as a chip;
  - the same page sizes.

  The two pages keep sharing the columns. Admin adds its Edit action.
- **Server listings with keyset paging** (`paginate`, `countCapped`) for both, alongside the
  existing ones, which other callers still use.
- **A migration**, `0015_user_name_index`, for sorting users by name.

**Out** (and where it goes instead):
- **`GET /api/v1/scopes`** and the new-draft page's scope list keep `ScopeRepository.list`, whose
  cursor is a scope name (037's contract for `rmk`). Only the web tables change.
- **The users' row actions** (change role, reset, disable, enable, your own row read-only: 008,
  059) are unchanged. They render in the table's last column.
- The review queue and My submissions: 062 and 063.

## Behaviour

**Users** (`features/admin-users/list.ts`):

```ts
defineList({
  path: "/admin/users",
  sorts: { created: "desc", email: "asc", name: "asc" },
  defaultSort: "created",
  sizes: [25, 50, 100],
  defaultSize: 50,
  filters: { q: "string", role: "string", status: "string" },
});
```

- **Columns:**

  | Column | Shows | Sortable |
  |---|---|---|
  | Email | mono, truncated | ✅ |
  | Name | truncated | ✅ |
  | Role | badge | — |
  | Status | active or disabled | — |
  | Created | local day | ✅ (default, newest first) |
  | (actions) | the row actions | — |

  The Role and Status columns aren't sortable. The filters cover them.
- **Sort keys:** `created` orders by `id` (ULIDs sort by creation time). `email` orders by
  (`email`, `id`), where email is unique and already indexed. `name` orders by (`name`, `id`),
  with the new index.
- **Filters:** the same as today. The search matches part of the email or the name, any case. Role
  and Status are selects. A role or status the list doesn't know is dropped, as now. Each active
  filter shows as a chip: `Search: alex ×`, `Role: moderator ×`, `Status: disabled ×`.
- **The count:** "123 users", capped at 10,000 as in 060.
- **The page header** keeps Create user. After a change (create, change role, disable…), the
  existing `revalidatePath` refreshes the page with the same URL, so the view is kept.

**Scopes** (`features/scopes/list.ts`): two list definitions with the same sorts, sizes and
filters. Only the path differs: `/scopes` and `/admin/scopes`.

```ts
sorts: { name: "asc", created: "desc" }, defaultSort: "name", filters: { q: "string" }
```

- **Columns:**
  - Scope: `@name`, mono, sortable (the default, A to Z).
  - Description: truncated, with the whole text in `title`.
  - Created by.
  - Created: sortable, local day.
  - Admin only: the Edit action.
- **Sort keys:** `name` orders by (`name`, `id`), with name unique and indexed. `created` orders
  by `id`.
- **Filter:** the search over the name or the description, as a chip.
- **The count:** "12 scopes".

**Server:**
- **Users:** `IdentityRepository.pageUsers({ filters, sort, dir, size, cursor })` and
  `countUsers(filters)`, built on one filtered query, with the same `users.view` check.
  `listUsers` and the cursor that `adminListUsers` takes are replaced, since only the page used
  them.
- **Scopes:** `ScopeRepository.page(…)` and `count(search)`. `list` stays for the API and the
  new-draft page.

**What stays the same:**
- Permissions: Users is root only (404 for others), and `/scopes` is for everyone signed in.
- 059's own-row rule.
- Every action and dialog.

## Edge cases

- **Sorting by name with equal names:** the `id` tiebreak keeps pages strict. There's a test with
  more same-named users than a page holds.
- **A user changed while you page:** a role or status change doesn't move a row in any of the sort
  orders (none is by role or status). Renaming is out of the app. A new user appears on the first
  page of "created", never in the middle.
- **Old links** with `?cursor=<ULID>` from 008's Next button: the cursor isn't the table's, so it
  shows the first page (060's rule).
- **A filter that matches nothing** shows "No users match these filters." with Clear filters.
- **An instance with no scopes** shows "No scopes yet. Root creates the first one in the admin
  area." There's no pagination bar.

## Documentation

- **Install › Root accounts and Roles:** no change.
- **Scopes › "What a scope is"** (`content.tsx`): one sentence saying the list can be sorted by
  name or creation date, and searched.
- **Administration** (060's topic) gains a short **"Users"** section:
  - finding people (search, role, status);
  - sorting;
  - that the row actions are where they were.
- **Helpers:** none new. The existing helpers keep their places.

## Acceptance criteria

- [ ] `/admin/users` and both scope pages render with `DataTable`. Their old tables, pagination
  and query helpers are gone.
- [ ] Users sort by email, name and created, and scopes by name and created, both ways. There's no
  repeat and no gap across pages on SQLite, PostgreSQL, MySQL and MariaDB.
- [ ] Filters apply on change and show as chips. Page sizes are 25, 50 and 100, and the totals
  show.
- [ ] `0015_user_name_index` runs on all four databases.
- [ ] `GET /api/v1/scopes` answers exactly as before (its tests unchanged), and the new-draft page
  still lists every scope.
- [ ] The row actions, root-only access and the own-row rule behave as before (the existing
  end-to-end tests, updated only for the new controls).
- [ ] The Documentation listed above says what the feature does now.

## Open questions

- None.
