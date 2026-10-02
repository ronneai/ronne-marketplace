# 060 — Server data table, first on the audit log

> Milestone: Across the app · Depends on: 007, 032, 049, 050 · Design: [MVP §11](../../MVP/MVP.md#11-rest-api-sketch-apiv1) (cursor pagination) · Contracts: none new

## Goal

The audit log grows with every sign-in, submission and release, and it's hard to read. Each row
spreads its time, actor, action, target id, every metadata pair and the IP address over several
lines. It also can't be sorted, and its actor filter loads every actor into a select. The owner
asked (2026-10-02) for:

1. **Pagination, filtering and sorting on the server.**
2. **One line per event** with only what's needed to read it, and **all the details in a dialog**.
3. **A clean UI with less on screen.**
4. **A table component other lists can use**, with data loaded from the server, pagination and
   sorting built in.

So this feature builds a shared **server data table** (the component, the URL state, and the
keyset paging on the server) and rebuilds the audit log on it.

## Scope

**In:**
- **`DataTable`** in `components/ui`. It takes column definitions and one page of rows, renders
  sortable headers and a pagination bar, and keeps all its state in the URL. It's a server
  component made of links and a GET form, so it works without JavaScript, and every view has a
  URL.
- **List state in the URL** (`components/ui/data-table/list-query.ts`): parsing and serialising
  `sort`, `dir`, `size`, `cursor` and a list's own filters, checked against what that list allows.
- **Keyset paging on the server** (`server/db/keyset.ts`): it sorts by an allowed column with the
  id as tiebreak, uses an opaque cursor for Next and Previous, and counts the total up to a cap.
  It works the same on SQLite, PostgreSQL, MySQL and MariaDB.
- **The audit log on it:**
  - one line per event, and a details dialog with a URL of its own;
  - a readable summary for every action in the catalogue;
  - server-side filters: action (a single action or a group), actor (by email) and dates;
  - sorting by time and by action;
  - page sizes of 25, 50 and 100.
- A migration that adds the index sorting by action needs.

**Out** (and where it goes instead):
- **Moving the other lists** (Users, Scopes, the review queue, My submissions, the catalogue) to
  `DataTable`. Each becomes a small follow-up feature once this one has proven the component. The
  index lists them as `planned`.
- **Export** (CSV or JSON), **retention**, and **live updates** of the audit log: post-MVP, as in 007.
- **Searching inside metadata**, such as "every event about `@team/x`". It needs a JSON search that
  works the same on all four databases, so it's a separate decision.
- **Choosing which columns show.** The columns are fixed per list.
- **The `/api/v1` pagination contract.** It stays as MVP §11 says; this is the web app's tables.

## Behaviour

### The data table (shared)

**A list definition** says what a list allows. It lives with the list's feature, and both the
server and the page use it:

```ts
const AUDIT_LIST = defineList({
  path: "/admin/audit",
  sorts: { time: "desc", action: "asc" }, // allowed sort keys and their default direction
  defaultSort: "time",
  sizes: [25, 50, 100],
  defaultSize: 50,
  filters: { action: "string", actor: "string", from: "day", to: "day" },
});
```

**The URL** holds the whole view, as in `?action=user.*&sort=time&dir=asc&size=25&cursor=…`:
- `sort` and `dir` must be an allowed key and `asc` or `desc`. Anything else falls back to the
  default, as `parseAuditQuery` does today: malformed values are ignored rather than trusted.
- `size` must be one of the list's sizes.
- `cursor` is opaque. Changing a filter, the sort or the size drops it, so you start again at the
  first page.
- Default values are left out of the URL, so the plain path is the default view.

**`DataTable` renders:**
- **The header:**
  - A **sortable** column's header is a link that sorts by it, or flips the direction when it's
    already the sort. It shows a direction icon and sets `aria-sort`.
  - Other headers are plain text.
- **The rows:** a cell is a `render(row)` function in the column definition. `DataTable` is a server
  component, so those functions never cross into a client component
  (`docs/knowledge/server-client-props.md`). Each column can set its width, alignment, `mono`, and
  `truncate` (one line, with an ellipsis and the full text in `title`).
- **The empty state:** "No events yet", or "No events match these filters" with a **Clear
  filters** link. The words come from the list.
- **The pagination bar**, under the table:
  - the total: "1,234 events", or "10,000+ events" past the cap. It doesn't say which rows of the
    total a page holds ("51–100"), because keyset paging doesn't know a page's position without
    a second count;
  - **First**, **Previous** and **Next** links, disabled at the ends;
  - the page size (a small GET form through `next/form`, so it navigates on the client; its Show
    button is hidden when JavaScript runs, and the select submits on change).

  It doesn't jump to page N: keyset paging has no page numbers, and Previous, Next and First
  cover reading a log.
- **The toolbar slot** above the table, for the list's filters. It holds one GET form, and its
  hidden fields keep `sort`, `dir` and `size`.

**Keyset paging** (`server/db/keyset.ts`):
- `paginate(query, { sort, dir, size, cursor })` orders by the sort column, then `id`, in the same
  direction. It fetches `size + 1` rows to know if there's a next page, and returns
  `{ rows, next, previous }`.
- **The cursor** is base64url JSON: `{ k, v, id, d }`. `k` is the sort key, `v` the sort value of
  the boundary row, `id` its id, and `d` the direction (`after` or `before`).
  - A cursor whose `k` doesn't match the current sort is ignored, and you get the first page.
  - Values are typed: dates as ISO strings, through `toDbDate`.
- **Previous** queries in the opposite order from the first row on the page, then reverses the
  rows. There's no offset, so a page stays stable while new events arrive.
- **The comparison** is written out as `(col > v) or (col = v and id > id0)`, not as a row
  comparison `(col, id) > (v, id0)`. Row comparisons don't behave the same on all four databases;
  `docs/knowledge/` gets a note if a dialect needs a helper.
- **The total** is `count(*)` over the filtered query, wrapped as `select count(*) from (… limit
  10001)`. It's exact up to 10,000 and "10,000+" beyond, so a large log never needs a full count.
  It runs alongside the page query.
- **Sorting is only on indexed columns.** Each list's definition names them, and the spec for each
  list names the index.

### The audit log on it

**The line**: one row per event, 40px, nothing wraps:

| Column | Shows | Sortable |
|---|---|---|
| **Time** | Local time to the minute (`Oct 2, 14:03`), with the full time and UTC on hover (049) | ✅ (default, newest first) |
| **Actor** | The email, or `system` / `cli`, truncated | — |
| **Event** | The action as a small mono badge, then a **summary** in plain words, truncated | ✅ by action |
| (no header) | An icon button, **Details**, that opens the dialog | — |

The IP address, the target id and the metadata move to the dialog. Clicking anywhere on the row
also opens it (the whole row is the link's hit area, and the Details button is what keyboard and
screen-reader users reach).

**Summaries**: one per action in the catalogue (`features/admin-audit/summary.ts`). Each is a short
sentence built from the metadata and the target. Some examples:

| Action | Summary |
|---|---|
| `auth.signed_in` | Signed in (remembered for 30 days) |
| `auth.sign_in_failed` | Failed sign-in for **alex@example.com**: wrong password |
| `user.role_changed` | Changed **alex@example.com** from user to moderator |
| `user.disabled` | Disabled **alex@example.com** (2 sessions ended, 1 token revoked) |
| `access_token.created` | Created token **laptop** (expires in 90 days, from the CLI) |
| `submission.approved` | Approved **@team/reviewer** |
| `version.published` | Published **@team/reviewer@1.2.0** as `latest` |
| `dist_tag.moved` | Moved `beta` of **@team/reviewer** to 1.3.0-beta.1 |
| `settings.usage_policy` | Changed the usage policy from off to people choose |

- A **user target's email** is read with a join on `user` (for `target_type = 'user'`), so
  summaries say who rather than a ULID. Other targets use the name their event already records
  (`metadata.name`), which every submission, version, tag and scope event has.
- **An unknown or older event shape** (a missing key, an action added later) falls back to the
  action and the target type, such as "user.created (user)". It never throws. A test renders every
  action in the catalogue, and fails when a new action has no summary.

**The details dialog** (the existing `Dialog`, `large`):
- **Opening:** it opens from `?event=<id>`. The page reads that one event by id and renders the
  dialog open, so a link to one event can be shared, and it works without JavaScript. Closing it
  goes back to the same URL without `event`. With JavaScript, opening and closing are client
  navigations that keep the scroll position.
- **Content, as a two-column description list:**
  - **When:** the local time with its zone, and UTC.
  - **Actor:** the email and id, or `system` / `cli`.
  - **Action:** the badge and the summary.
  - **Target:** the type and id. Where the app has a page for it, the target is a link: a user goes
    to Users searched by email, a submission to its page, and an item or version to the item page.
  - **IP address.**
  - **Details:** every metadata key and value, in the order recorded.
  - **Event id.**
  - **Raw JSON:** the whole event, folded, with a copy button.
- **Not found:** an `event` that doesn't exist, or isn't a ULID, shows the list with an info notice
  "That event doesn't exist." The rest of the URL is kept.

**Filters**: one row above the table, in a single GET form:
- **Action:** a select with "All actions", then one `<optgroup>` per group. Each group starts with
  its "All user.*" option, followed by that group's actions. The values are an action or
  `<group>.*`. The server checks them against the catalogue.
- **Actor:** a text field matching the actor's email (case-insensitive, contains, through
  `containsInsensitive`). The word `system` matches events without an actor; a helper says so.
  This replaces today's select of every actor, which doesn't scale.
- **From** and **To** (UTC days, as now).
- **Applying filters:** filters apply when the form is submitted. With JavaScript, the selects and
  dates submit on change and the actor field after a short pause, so there's no Filter button.
  Without JavaScript, a Filter button shows.
- **Clear** shows only when a filter is set.
- **Active filters** show as small removable chips under the row (`Action: user.* ×`), so a
  filtered view is obvious at a glance.

**Sorting and indexes:**
- **Time:** sorts by `id`. ULIDs sort by creation time, and the index already exists.
- **Action:** sorts by (`action`, `id`). A new migration, `0014_audit_log_action_index`, adds that
  index. Filters on `actor_id` and `created_at` already have theirs (007).

**Server shape:**
- `listAuditEvents(db, dialect, { filters, sort, dir, size, cursor })` returns
  `{ events, next, previous, total }`.
- `findAuditEvent(db, dialect, id)` returns one event, for the dialog.
- `appAuditPage` no longer loads the list of actors.
- The page is root only, as before (`audit.view`, 404 for anyone else).

## Edge cases

- **New events while you read:** keyset cursors don't shift, so Next never repeats or skips an
  event. The total can change between pages, which is expected.
- **A cursor from another sort or another list,** or one that has been tampered with: it's ignored,
  and you get the first page. It's never an error page.
- **Equal sort values** (many events with the same action): the `id` tiebreak keeps the order
  strict, so a page boundary never splits or repeats them. There's a test with 120 events of the
  same action across pages of 50.
- **Last and first pages:** Next and Previous are disabled. A filter that matches nothing shows the
  empty state, not a pagination bar.
- **A huge total:** counting stops at 10,001 rows and shows "10,000+".
- **An actor search with `%` or `_`:** matched literally (the escaping in `containsInsensitive`).
- **Long emails and summaries:** truncated with an ellipsis, and complete in `title` and in the
  dialog. The table never scrolls sideways at 1280px wide. On a phone the Actor column is hidden,
  and the actor is still in the summary line and the dialog.
- **Times:** the line shows local time to the minute, and the dialog shows seconds and UTC. The
  date filters stay UTC days (049).
- **Metadata over 4 KB** can't exist (007 refuses it), so the dialog needs no truncation.

## Documentation

- **A new topic, "Administration"** (`topics.ts`, `content.tsx`), with a section **"Audit log"**.
  It covers:
  - what's recorded (the groups);
  - reading a line;
  - opening the details, and sharing a link to one event;
  - filtering by action, actor (email, or `system`) and dates;
  - sorting by time or action, and the page sizes;
  - that it's read-only and kept forever for now.

  The Roles topic's "read the audit log" links to it.
- **New inline helpers** (`Help.tsx`):
  - `audit-actor` next to the Actor filter: "Part of an email. `system` finds events with no one
    signed in, such as setup and the command line."
  - `audit-summary` in the page description: what a line shows, and that Details has everything
    recorded.
- **The page description** becomes shorter: "Who did what, and when. Open an event for every
  detail."

## Acceptance criteria

- [ ] `DataTable`, the list state and `paginate` are shared, generic and documented in code. The
  audit log uses them, and nothing in them is specific to the audit log.
- [ ] Sorting, paging and filtering happen on the server. The page loads only `size` events and one
  capped count, and never the list of actors.
- [ ] Next, Previous and First work in both directions for every sort. There's no repeat and no gap
  across pages, including equal sort values, on SQLite, PostgreSQL, MySQL and MariaDB.
- [ ] A bad `sort`, `dir`, `size` or `cursor` falls back to the defaults, and a cursor from another
  sort is ignored.
- [ ] The total shows exactly up to 10,000, and "10,000+" above it.
- [ ] Each event is one line: time, actor, and the action badge with its summary. Every action in
  the catalogue has a summary, and the test fails for a new one without.
- [ ] `?event=<id>` opens the details dialog with every field, including the raw JSON. Closing it
  keeps the filters, sort and page. It works without JavaScript.
- [ ] The filters are: action (an action or a group), actor email or `system`, and dates. Active
  filters show as removable chips, and Clear resets them.
- [ ] `0014_audit_log_action_index` runs on all four databases.
- [ ] The page is still a 404 for anyone but root.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Open questions

- **Which list moves to `DataTable` next?** The proposal is Users (008), then the review queue
  (014). Each is a small follow-up feature, listed in the index as `planned`.
