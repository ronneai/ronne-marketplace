# 166 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP.md §10's `audit_log` row lists the new columns, and `docs/features/README.md` lists 166 in
    M28.
  - *Done when:* both say what this spec says, and `pnpm witness:check` passes.

- [ ] **2. Migration.** [risky]
  - The five columns and two indexes, in the shared migration set.
  - `schema.ts`.
  - *Done when:* the migration's db test passes on the three servers (`pnpm test:db:postgres --
    <file>`, `:mysql`, `:mariadb`), and `migrations.guard.test.ts` and
    `audit-log.guard.test.ts` pass.

- [ ] **3. Context and `recordAudit`.** [risky]
  - `RequestContext` gains `via` and `userAgent`, set by `apiRoute` (`api`, or `scim` under
    `/api/v1/scim`), `serverAction` and the session routes (`web`).
  - A `withChannel("cli" | "system", fn)` for terminal commands and jobs.
  - `recordAudit` writes the request ID, channel, client (cut, cleaned) and outcome (from the
    catalogue's failure marks).
  - *Done when:* db tests record an event through each channel and read the fields back; a test
    covers a long and a control-character user agent; `audit.db.test.ts` passes.

- [ ] **4. The workspace on events.**
  - `NewAuditEvent.workspaceId`.
  - The catalogue's `inWorkspace` marks.
  - The call sites in submissions, items, versions, dist-tags, scopes, workspaces, scans and pins.
  - A guard test: every `inWorkspace` action recorded in the test suite carries a workspace.
  - *Done when:* the guard test passes and the domains' db tests pass.

- [ ] **5. Lifecycle.** [risky]
  - The retention purge clears `user_agent` with `ip_address`.
  - The erasure rewrite clears the person's user agents.
  - The data download includes the fields.
  - *Done when:* `retention-purge` db tests, the erasure db tests (MySQL's after-commit path
    included) and the data download tests cover them, on the three servers for the purge and
    erasure.

- [ ] **6. The audit page and its permission.**
  - The Workspace and Request ID filters (060's URL state).
  - The detail's fields with copy.
  - The failed and denied mark.
  - `audit.read` in the matrix and in `appAuditPage` and `appAuditEvent`.
  - *Done when:* component tests cover the filters, the detail and old rows; db tests cover the
    filters' queries (keyset with each filter) and a non-root refused by the actions; the audit
    e2e test filters by workspace.

- [ ] **7. Messages.**
  - Every new key in `en`, `pt` and `fr`.
  - *Done when:* the parity and raw-text tests pass; the phone sweep passes on the audit page.

- [ ] **8. Documentation.**
  - `audit#audit`, `logs`, `privacy#retention`, `privacy#erase`, the helper; MVP §10.
  - *Done when:* the docs render tests and `pnpm docs:links` pass, and the helper lands on a real
    section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
