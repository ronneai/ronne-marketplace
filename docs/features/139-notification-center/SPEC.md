# 139 — Notification center

> Milestone: M21 · Depends on: 007, 060, 102, 103, 104, 119, 129 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("Notifications"), MVP §14.5 (email and webhooks stay out) · Contracts: none changed

## Goal

People find out in the app what happened to their work and what waits for them, without watching
each page (owner, 2026-10-29): a bell in a top bar with how many are unread, a short list behind
it, and a page with all of them. In the app only; email and webhooks stay out of scope.

## Scope

**In:**
- **A top bar** (owner, 2026-10-31, from the mock `stitch_fixed_notification_center_bar`): a slim bar
  fixed at the top of the content area, to the right of the sidebar (119), never over it; the
  sidebar keeps its full height and sits above the bar (`z-40` over `z-30`), so its fold button,
  which sticks out half over the page, is never hidden under it (owner, 2026-10-31). It is one
  header for every width: from `lg` it sticks to the top while the page scrolls and holds the bell
  at its right (143 later puts global search at its left), and the logo and the Menu, which the
  sidebar replaces, are hidden; below `lg` it is the phone header (066) with the bell beside the
  Menu button. Pages without the sidebar (signed out, setup) have no bell.
- **A bell** in that bar, with the unread count as a badge ("99+" past ninety-nine, as `NavCount`
  does it; the count read out in the button's name). The sidebar and the Menu sheet get no bell.
- **The short list**, a popover under the bell (`Popover`, full screen below `sm` as dialogs are,
  067), flat with a border, no shadow: a header with the title, an unread pill and "Mark all as
  read"; the ten latest, unread ones with a dot and a stronger title, read ones dimmed; each row is
  one link with an icon tile by kind (neutral or teal, red only for a rejection or a request for
  changes, never raw colours), its sentence, and when (`LocalTime`, 049); "See all" at the foot.
  No filter chips, row buttons, Dismiss or settings in it: the filters are on the page.
- **The page**, `/notifications`: every notification of the person, newest first, on the server data
  table (060) with keyset pagination, a filter by read/unread and by kind (the filters live only here, not in the popover); mark one, the selected or
  all as read.
- **What notifies whom** (the first set; each is one `kind`):
  - **the author of a submission:** approved, approved by override, changes requested, rejected, a
    comment by someone else (014, 058); released by someone else (015, 055); a dependency they
    submitted with was rejected (056);
  - **a person who asked to join a workspace:** approved or declined (094);
  - **a person who asked to move a scope or an item:** moved or declined (115, 134);
  - **a member:** added to a workspace, removed from one, their role there changed (092);
  - **the people who answer requests:** a new request waits, once per request: to join a workspace
    or to move an item (094, 134), for root and the workspace's moderators and admins; to move a
    scope (115), for root and the target workspace's admins (root alone for `global` or a personal
    workspace), as 115 says who answers;
  - **root:** new feedback (127); an update is available (140 adds the kind).
- **Not to yourself:** an action never notifies the person who did it.
- **Reading marks it read:** opening a notification's link marks it read; so does "Mark all as read".
- **Kept for 90 days**, read or not, then deleted by the retention job (102).
- **Erasing a user** (103) deletes their notifications; **their data** (104) includes them.

**Out** (and where it goes instead):
- **Email, webhooks, Slack, push:** out of scope (MVP §14.5); the table is shaped so a later
  delivery can read from it.
- **Choosing which kinds you get** (per-person preferences): a later feature, once people say which
  are noise. The first set is only what's addressed to the person.
- **Notifications in `rmk`, the MCP server or `/api/v1`:** not now.
- **A notification for each new submission waiting for review:** no; the Reviews count (014) already
  says it, and a busy queue would bury everything else.
- **Live push** (websockets, server-sent events): no; the count refreshes on navigation and every
  minute while the page is visible.

## Behaviour

**From the person's side.** A reviewer requests changes on Ana's skill. Next time Ana opens any page,
or within a minute if a page is open, the bell shows 1. She opens it: "Bruno requested changes to
@tools/lint-helper 1.2.0", two minutes ago. She clicks it, lands on the submission, and the count
goes back to 0.

**Writing them.** A `notifications` domain (`server/domains/notifications`) with
`notify(trx, { recipients, kind, actorId, subject, params })`:
- called by the services that already write the audit event (007), in the same transaction, so a
  decision that rolls back notifies nobody;
- recipients are user ids; the actor is removed from them; disabled users are skipped;
- one row per recipient.

**Reading them.** Each row stores its `kind` and parameters (ids and the names at that time), never a
sentence: the sentence is a message (`notifications.<kind>`) drawn in the reader's language when
read. The link is built from the kind and the subject.

**Who may still see it.** When a notification is read, it's shown only if the person can still see
its subject (091, 093): someone removed from a private workspace no longer sees its item names in
old notifications. Hidden ones aren't counted. The rule, per subject:
- a submission, a request or a workspace is judged by the workspace it lives in now; a move by
  either of its two workspaces (the asker and the answerers knew both names);
- a subject that was deleted is still judged by the workspaces it lived in when the notification was
  written (`workspace_ids`, below), so deleting an item or a request can't bring a hidden
  notification back; with none of those workspaces left there is nothing to check, and it shows
  without a link;
- being removed from a workspace (`membership.removed`) and a declined request to join are always
  shown, since their point is the workspace's name the person knew; they link to the workspace only
  if the reader sees it;
- feedback is for root alone.
**Accepted limits:** the count looks at the newest 100 unread rows before hiding, and the popover
at five batches of rows, so a reader with more than that many hidden rows newer than a visible one
can see a count or a list short of the truth until they read or purge the hidden ones. A page of
`/notifications` can hold fewer rows than its size when some are hidden.

**The count.** `loadShell` (`app/(app)/shell.ts`) adds the unread count to its result: one indexed
query when nothing is unread, and otherwise the newest 100 unread rows with one batched query per
kind of subject, to drop what the reader can't see. A client component asks `GET /notifications/count` (a route handler of the web app,
not `/api/v1`, session only, never cached) on every change of page and every 60 seconds while
`document.visibilityState` is `visible`, and at once when the page becomes visible again. The
popover loads its ten from `GET /notifications/latest` (the same kind of route) each time it opens;
marking read is a server action. A signed-out request gets 401 and nothing else.

## Edge cases

- **Two roots answer the same request:** the requester gets the one answer that was written; the
  other answer fails as today, and notifies nobody.
- **The actor is erased later:** the sentence shows the erased name (`deleted-user-<id>`, 103), as
  the actor's name is read when shown, not stored.
- **The item is renamed or moved** (113, 118, 134): the link follows the subject's id; the sentence
  keeps the name it had, as the audit log does.
- **The subject is deleted** (a draft deleted for good, 057): the notification stays, without a link.
- **A person with many unread** (thousands): the count is capped at "99+" in the query (`LIMIT 100`).
- **A parameter a sentence needs is missing** (an older or newer version wrote the row): the
  sentence shows a plain fallback line ("There is an update for you."), never a message key.
- **Several replicas** (111): nothing in memory; every replica reads the table.

## Data

- Migration (the next number): `notifications`
  - `id`, `user_id` (→ `user`, cascade on delete), `kind` (text), `actor_id` (nullable, → `user`,
    set null), `subject_type` and `subject_id` (text), `params` (JSON text, at most 2 KiB),
    `created_at`, `read_at` (nullable);
  - index `(user_id, read_at, created_at)`, `(user_id, id)` for the list, and `(created_at)` for
    the purge.
- Migration (the next): `notifications.workspace_ids` (nullable JSON text, at most two workspace
  ids): where the subject lived when written, filled by `notify`, so a deleted subject is still
  judged by it.
- The retention job (102) deletes rows older than 90 days.
- No audit event for reading or marking read.

## Documentation

- **New topic `notifications`** (Using Ronne group, website and `topics.ts`): what notifies you
  (`what`), reading and marking read (`reading`), how long they're kept (`kept`), what isn't sent
  (`not-email`: no email or webhooks).
- **Privacy** (`privacy`): notifications are deleted after 90 days and with an erased account.
- **Your data** (104's section): the download includes notifications.
- **Helpers:** on `/notifications`, "Why am I seeing this?" → `notifications#what`.

## Acceptance criteria

- [ ] The bell, in the fixed top bar of the content area (and in the phone header), shows the unread
  count as a badge, and refreshes on navigation and every minute while visible; the sidebar is
  unchanged and the bar never covers it.
- [ ] Each kind listed in Scope is written to its recipients, in the same transaction as its audit
  event, never to the actor or a disabled user; db tests cover each on the four databases.
- [ ] Sentences are drawn in the reader's language from the kind and parameters; every
  `notifications.<kind>` message exists in English, Portuguese and French.
- [ ] A notification whose subject the reader can no longer see is neither shown nor counted.
- [ ] The popover lists the ten latest; `/notifications` pages, filters and marks read on the server
  data table; opening one marks it read.
- [ ] Rows older than 90 days are purged; erasing a user deletes theirs; their data download
  includes them.
- [ ] The popover, the page and the bell pass the phone sweep and the tap-target check.
- [ ] The Documentation and inline helpers listed above say what the feature does.

## Decisions

1. **Notifications in the app only** (owner, 2026-10-29); email and webhooks stay out (MVP §14.5).
2. **A top bar over the content, bell with a badge; a page as well as the popover** (owner,
   2026-10-31): the popover is for a glance, the page for catching up, filtering and bulk marking.
3. **Polling, not push** (Claude): one indexed query a minute per open page is cheap, needs no new
   connection type through Caddy (080), and works with several replicas.
4. **Kinds and parameters, not sentences** (Claude): the sentence is in the reader's language, and a
   later translation fixes old notifications too.
5. **Only what's addressed to the person** (Claude): a decision on your work, an answer to your
   request, a request you must answer. Queue counts stay counts.
6. **90 days, fixed** (Claude): long enough to catch up after a holiday; root's retention tab (102)
   can take it later if asked.

## Design

The mock's top bar, bell, badge and popover are the reference (a Stitch export, in the owner's
git-ignored `docs/UI-Mocks-Materials`); its palette, shadow, filter chips, row buttons and settings
gear are not used. Colours are our tokens and the type is our scale (158).

## Open questions

- Should root be able to change the 90 days on the Privacy tab?
- Per-person preferences (mute a kind): wanted in this feature, or after people use it?
- Should a toast (138) show when a new notification arrives while the page is open?
