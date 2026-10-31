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

- [ ] **3. Writing them from the services.**
  - Each kind in Scope, called beside its audit event in the same transaction; the actor and
    disabled users left out.
  - *Done when:* a db test per kind checks the recipients, and that a rolled-back decision writes
    none.

- [ ] **4. Reading them, with the visibility check.** [risky]
  - The sentence from `notifications.<kind>` with its parameters, the link from the subject, the
    check that the reader can still see the subject (091, 093); hidden ones not counted.
  - *Done when:* db tests cover a person removed from a private workspace (not shown, not counted),
    a deleted subject (no link) and an erased actor; messages pass the parity test.

- [ ] **5. The top bar, the bell, the popover and the count.**
  - A top bar fixed over the content area from `lg` (not over the sidebar; the sidebar's height is
    unchanged), the bell with its badge in it and in the phone header, the count in `loadShell`,
    the popover (flat, per the spec's Design note), the `/notifications/count` route (session
    only) and the minute's polling while visible.
  - *Done when:* component tests cover the badge ("9+"), the bar not overlapping the sidebar,
    "Mark all as read" and the polling (fake timers, visibility); an e2e test sees a request for
    changes reach the author; the phone sweep passes with the bell in the header.

- [ ] **6. The page `/notifications`.**
  - The data table, filters, selection and mark read; opening a link marks it read.
  - *Done when:* component and e2e tests cover paging, the filters and marking; the phone sweep and
    tap-target checks pass.

- [ ] **7. Retention, erasure and your data.** [risky]
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
