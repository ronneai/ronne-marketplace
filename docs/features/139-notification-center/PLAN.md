# 139 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Decision.**
  - MVP.md §15 has the "Notifications" row, §14.5 and §2 say in-app notifications are in and email
    and webhooks stay out, and `docs/features/README.md` lists 139 in M21 with its dependencies.
  - *Done when:* the docs say what this spec says, and `pnpm witness:check` passes.

- [x] **2. The table and the domain.** [risky]
  - The migration, its schema interface, the repository (insert many, list by keyset, count unread
    capped at 100, mark read, mark all read, delete older than), the `notify` service.
  - *Done when:* the migration and repository db tests pass on SQLite and, with `pnpm test:db:up`,
    on PostgreSQL, MySQL and MariaDB for these files; the migrations guard test passes.

- [x] **3. Writing them from the services.**
  - Each kind in Scope, called beside its audit event in the same transaction; the actor and
    disabled users left out.
  - *Done when:* a db test per kind checks the recipients, and that a rolled-back decision writes
    none.

- [x] **4. Reading them, with the visibility check.** [risky]
  - The sentence from `notifications.<kind>` with its parameters, the link from the subject, the
    check that the reader can still see the subject (091, 093); hidden ones not counted.
  - *Done when:* db tests cover a person removed from a private workspace (not shown, not counted),
    a deleted subject (no link) and an erased actor; messages pass the parity test.

- [x] **5. The top bar, the bell, the popover and the count.**
  - A top bar fixed over the content area from `lg` (not over the sidebar; the sidebar's height is
    unchanged), the bell with its badge in it and in the phone header, the count in `loadShell`,
    the popover (flat, per the spec's Design note), the `/notifications/count` route (session
    only) and the minute's polling while visible.
  - *Done when:* component tests cover the badge ("9+"), the bar not overlapping the sidebar,
    "Mark all as read" and the polling (fake timers, visibility); an e2e test sees a request for
    changes reach the author; the phone sweep passes with the bell in the header.

- [x] **6. The page `/notifications`.**
  - The data table, filters, selection and mark read; opening a link marks it read.
  - *Done when:* component and e2e tests cover paging, the filters and marking; the phone sweep and
    tap-target checks pass.

- [x] **7. Retention, erasure and your data.** [risky]
  - The retention job deletes rows older than 90 days; erasing a user deletes theirs; the download
    (104) includes them.
  - *Done when:* the retention, erase and download db tests cover notifications.

- [ ] **8. Documentation.**
  - The `notifications` topic, the privacy and your-data lines, the helper; `topics.ts` here and in
    ronne-web together.
  - *Done when:* the docs render tests and `pnpm docs:links` pass, and the helper lands on a real
    section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **Task 3:** a repository method `notify(notification, now)` sits beside `recordAudit` on the
  submission, workspace, SSO and identity-provider repositories; feedback's `insert` notifies in its
  own transaction. Choices: a person added while their request to join is open gets
  `join_request.approved` only; `global` is never announced at account creation (nor by SSO or SCIM
  mapping, though a role change in it is); an at-once move by the asker writes nothing; cancelled
  requests aren't notified. Parameters hold names, ids and numbers, never free text.
  `testing/throw-after-notify.ts` makes a test fail a call right after its notification was written.
  The SCIM entry point isn't tested for notifications on its own: it shares `applyGroups` with the
  SSO path.
- **Task 4:** the reader (`services/read.ts`, `subjects.ts`) resolves each subject in one batched
  query per kind and judges it with `models/visibility.ts`; a notification stores the workspaces its
  subject lived in (migration 0042, filled by `notify`), so a deleted subject can't bring a hidden
  notification back. The domain returns a link descriptor, the web app turns it into an address
  (`features/notifications/href.ts`); sentences are the `notifications` messages, drawn with
  `renderSentence`, which falls back to a plain line rather than show a message key. The count and
  the popover have accepted limits (spec).
- **Task 5:** the header is one sticky bar for every width (logo and Menu hidden from `lg`, one bell,
  one poller); the sidebar is `z-40` over it so the fold button, half over the page, isn't covered.
  `Popover` gained `bare` (no pointer, no default layout or tone). The phone panel is the shared
  `Dialog`, which carries the title, so the panel drops its own heading there. New route segments
  (`notifications`, `count`, `latest`) are in `telemetry/sanitize.ts`. Marking read is a server
  action; opening a row marks it read (not without JavaScript: the popover needs it, and the
  page, task 6, marks with forms).
- **Task 6:** the page is the feedback inbox's pattern (server data table, client selection parts).
  Its status filter is labelled "Status", not "Show", which the pager's page-size control already
  uses. The row checkbox sits in a `touch-hit` label (a bare input can't draw the 44px area). The
  total is `countVisible`, up to 1,000 rows, so it reads "at least" past that. The e2e seed writes
  30 notifications for `notificationsReader` through `notify`. New page folders must join two lists:
  the phone sweep's (`e2e/pages.ts`) and feedback's `PAGE_ROOTS`.
- **Task 7:** the purge deletes notifications older than a fixed 90 days (`RETENTION_DAYS`, no policy
  field), as its own last rule in `runRetentionPurge`, and `notificationsDeleted` is carried to the
  job log, the stored result, `rmk-server purge` and the Privacy tab. Erasing a user deletes the
  notifications addressed to them. A notification's parameters never hold a person's name: the
  sender of new feedback was one, and erasing them left the name behind (found by the adversarial
  pass), so the sentence now uses the actor, read when shown. The download's section drops
  `sender` defensively and scrubs other emails. No purge rule guards against a wrong clock.
