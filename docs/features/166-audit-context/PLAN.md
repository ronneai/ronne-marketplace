# 166 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Decision.**
  - MVP.md §10's `audit_log` row lists the new columns, and `docs/features/README.md` lists 166 in
    M28.
  - *Done when:* both say what this spec says, and `pnpm witness:check` passes.

- [x] **2. Migration.** [risky]
  - The five columns and two indexes, in the shared migration set.
  - `schema.ts`.
  - *Done when:* the migration's db test passes on the three servers (`pnpm test:db:postgres --
    <file>`, `:mysql`, `:mariadb`), and `migrations.guard.test.ts` and
    `audit-log.guard.test.ts` pass.

- [x] **3. Context and `recordAudit`.** [risky]
  - `RequestContext` gains `via` and `userAgent`, set by `apiRoute` (`api`, or `scim` under
    `/api/v1/scim`), `serverAction` and the session routes (`web`).
  - `withChannel("system", fn)` for jobs; terminal commands set the whole process's channel once
    (`setProcessChannel("cli")`, at the top of each command that records events).
  - `recordAudit` writes the request ID, channel, client (cut, cleaned) and outcome (from the
    catalogue's failure marks).
  - *Done when:* db tests record an event through each channel and read the fields back; a test
    covers a long and a control-character user agent; `audit.db.test.ts` passes.

- [x] **4. The workspace on events.**
  - `NewAuditEvent.workspaceId`.
  - The catalogue's `inWorkspace` marks.
  - The call sites in submissions, items, versions, dist-tags, scopes, workspaces, scans and pins.
  - A guard test: every `inWorkspace` action recorded in the test suite carries a workspace.
  - *Done when:* the guard test passes and the domains' db tests pass.

- [x] **5. Lifecycle.** [risky]
  - The retention purge clears `user_agent` with `ip_address`.
  - The erasure rewrite clears the person's user agents.
  - The data download includes the fields.
  - *Done when:* `retention-purge` db tests, the erasure db tests (MySQL's after-commit path
    included) and the data download tests cover them, on the three servers for the purge and
    erasure.

- [x] **6. The audit page and its permission.**
  - The Workspace and Request ID filters (060's URL state).
  - The detail's fields with copy.
  - The failed and denied mark.
  - `audit.read` in the matrix and in `appAuditPage` and `appAuditEvent`.
  - People by name (owner, during 166): the actor column, the sentences and the detail show the
    name, the email on hover and in the detail; the actor filter takes a name or an email.
  - *Done when:* component tests cover the filters, the detail, old rows and names (an erased
    person, a removed one, none); db tests cover the filters' queries (keyset with each filter, the
    actor by name and by email) and a non-root refused by the actions; the audit e2e test filters
    by workspace and reads a name.

- [x] **7. Messages.**
  - Every new key in `en`, `pt` and `fr`.
  - *Done when:* the parity and raw-text tests pass; the phone sweep passes on the audit page.

- [ ] **8. Documentation.**
  - `audit#audit`, `logs`, `privacy#retention`, `privacy#erase`, the helper; MVP §10.
  - *Done when:* the docs render tests and `pnpm docs:links` pass, and the helper lands on a real
    section.

- [x] **9. An Admin group in the sidebar.**
  - Owner, 2026-11-01, during 166: Users, Audit log, Settings and Feedback move out of Governance &
    reviews into a group of their own, **Admin**, after Tools, for root only (the one role those
    pages are open to). Governance & reviews keeps Reviews and Submissions (Requests is in Discover,
    as since 094). The phone's
    Menu has the same groups.
  - *Done when:* the navigation tests list the groups and their links for a member, a moderator and
    root (no Admin group but for root), the group's name is in en, pt and fr, and the e2e and phone
    tests that use the sidebar and the Menu pass.

- [ ] **10. Groups that open and close.**
  - Owner, 2026-11-01, during 166: Discover, Governance & reviews, Tools and Admin each open and
    close from their heading (`<details>`, so it works without JavaScript), open at first. Each
    group's state is kept in a cookie per browser, as the fold is (119), so the next page renders
    the same; the phone's Menu shares it. A closed group's heading shows a dot when one of its
    links has a count waiting. The folded sidebar has no headings and shows every link.
  - *Done when:* component tests cover a group closed from the cookie, the toggle writing it, the
    dot, and the folded sidebar; the e2e tests close a group and see it still closed on the next
    page, on a desktop and a phone; the phone sweep passes.

Tasks 9 and 10 are built after task 7 and before task 8, so the Documentation covers them.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- **`request_id` compares byte for byte** (task 2): `exactString(128)`, so MySQL's default
  collation doesn't make the exact filter match an ID that differs only in case. `utf8mb4_bin`
  still pads with spaces, so the Request ID filter (task 6) trims its input and checks it against
  100's pattern before querying.
