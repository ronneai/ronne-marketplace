# 166 — Audit context: request, channel, client, workspace and outcome

> Milestone: M28 · Depends on: 007, 060, 100, 102, 103, 104 · Design: [MVP §10](../../MVP/MVP.md#10-data-model-mvp) (`audit_log`), [§15](../../MVP/MVP.md#15-decision-log) ("Personal data") · Contracts: none changed (the audit export API is planned in M29, 168)

## Goal

An audit event says who did what to which target, when, and from which address. It doesn't say
which request it came from, though every log line has that ID (100). It doesn't say whether it came
through the web, the API, a terminal, SCIM or a scheduled job. It doesn't say from what client, or
in which workspace, which today is only a name inside the metadata, when at all. And a failure
reads like any other event.

This feature adds those five facts to every event, so an event can be tied to its log lines,
filtered by team and read for what it was. It is the foundation of the audit export, the auditor
role and the tamper-evident log planned after it (owner, 2026-11-01).

## Scope

**In:**
- **A migration on `audit_log`:**

  | Column | Type | Notes |
  |---|---|---|
  | `request_id` | string 128, nullable | |
  | `via` | string 16 | `web`, `api`, `scim`, `cli` or `system` |
  | `user_agent` | string 256, nullable | |
  | `workspace_id` | id, nullable | no foreign key: an event outlives its workspace, whose name stays in the metadata |
  | `outcome` | string 16, not null, default `success` | `success`, `failed` or `denied` |

  Indexes on (`workspace_id`, `id`) and on `request_id`. Older rows get `via` as null (shown as
  "—") and `outcome` `success`.
- **`recordAudit` fills them, so callers don't change:**
  - **request ID, channel and client** come from the request context (`log/context.ts`), which
    gains `via` and `userAgent`:
    - `apiRoute` sets `api` (and `scim` for `/api/v1/scim/**`);
    - `serverAction` and the route handlers behind the web session set `web`;
    - the terminal commands (`reset-root-password`, `revoke-access`, `rotate-secret`, `backup`,
      `restore`…) run in a context with `cli`;
    - scheduled jobs (`purge`, scans, the upgrade check) run in one with `system`.
  - **The user agent** is cut to 256 characters at a code point, with control characters removed.
  - **The outcome** comes from the action catalogue (`audit/models/audit-event.ts`). Each failure
    action is marked there:
    - `auth.sign_in_failed`, `auth.two_factor_failed`, `auth.sso_failed`, `auth.device_denied` and
      `auth.device_expired` are `failed`;
    - `scim.request_refused` is `denied`.

    Every other action is `success`.
  - **`workspace_id`** is a new optional field on `NewAuditEvent`. The services set it for every
    event about something in a workspace: `submission.*`, `version.*`, `dist_tag.*`, `item.*`,
    `scope.*`, `workspace.*`, `scan.*`, and workspace pins (`pin.*` with a workspace). The catalogue
    marks those actions `inWorkspace`, and a guard test fails when one is recorded without it.
- **The audit log page** (060):
  - two filters, **Workspace** (every workspace, root sees them all) and **Request ID** (exact);
  - the event's detail shows the request ID (copy button), the channel, the client and the outcome;
  - a failed or denied event's line is marked as such;
  - **people by name** (owner, 2026-11-01, asked during this feature): the actor column, the
    event sentences and the detail show a person's name (an erased person's pseudonym), with the
    email on hover and in the detail, since names aren't unique; the actor filter takes a name or
    an email, so the links that filter by email (a user's page) still work.
- **The data's lifecycle:**
  - **retention** (102) clears `user_agent` together with `ip_address` after root's period: it's
    personal data in the same way;
  - **erasing a person** (103) clears their events' user agents with their addresses;
  - **a person's data download** (104) includes the five fields of their own events.
- **A permission inside the audit's own actions.** `appAuditPage` and `appAuditEvent` (and the
  Workspace filter's list, `appAuditWorkspaces`) check `audit.read` themselves, held by root (and by
  the auditor role planned in M29, 169), instead of relying on the page. `audit.read` is the
  permission 007 named `audit.view`, renamed rather than doubled.

- **The sidebar** (owner, 2026-11-01, asked during this feature; 119's navigation changes):
  - an **Admin** group, after Tools, for root only, holding Users, Audit log, Settings and
    Feedback, which leave Governance & reviews;
  - every group (Discover, Governance & reviews, Tools, Admin) opens and closes from its heading,
    open at first, each kept per browser in a cookie (as the fold is), in the sidebar and the
    phone's Menu; a closed group's heading shows a dot when a count waits in it (Decision 4); the
    folded sidebar shows every link.

**Out** (and where it goes instead):
- **Exporting the log, and `GET /api/v1/audit`:** 168 (M29).
- **New events** (authorization refusals, Scan now, purges, exports): 167 (M29), which uses
  `outcome: denied`.
- **A hash chain:** 185 (M31).
- **A foreign key to `workspaces`:** none on purpose (Decision 2).

## Behaviour

**Tracing a strange release.** Root sees `version.published` for `@team/tools/deploy@2.0.0`, opens
it, and copies its request ID. They search the server's JSON logs for it and find the
`http.request` line and the release's other lines, with timings. The audit log filtered by that
request ID shows the approval check and the publish together.

**A team's history.** Root filters the audit log by the workspace `payments` and sees its members'
changes, submissions, approvals, releases and scope moves, and nothing else.

**Failed sign-ins.** The list marks `auth.sign_in_failed` as failed. Filtering by the
authentication group and reading the outcome column shows them at a glance.

## Edge cases

- **An event recorded after the response** (Next's `after()`): it still runs inside the request's
  context, so it carries the request ID.
- **A client-supplied `X-Request-Id`** is used only through a trusted proxy and only when it matches
  100's pattern. Otherwise the server's own ULID is used. The audit row stores whichever the logs
  use.
- **A workspace deleted later:** its events keep `workspace_id` and the name in their metadata. The
  filter offers deleted workspaces by that name ("payments (deleted)").
- **An event about a scope moved between workspaces**: `workspace_id` is where the scope is when it
  happens: the target for `scope.moved`, the source while the move is asked, declined or cancelled
  (`scope.move_requested`, `_declined`, `_cancelled`); the metadata names both. An item move stays in
  its workspace (134).
- **Very long or binary user agents:** cut and cleaned. An empty one is null.
- **An erasure finished by another root's Retry** (103): `user.erased` names the root who started it
  as its actor, so it carries no address or client (they'd be the other root's, and would reach the
  first root's data download); its request ID and channel are the Retry's. The same root's Retry
  keeps both, and the retention job's has neither.
- **Old rows:** "—" for the new fields. The filters simply don't match them.

## Data

- One migration, adding the five columns and two indexes. These are additive on all three dialects:
  `outcome` has a default, and the rest are nullable.
- No backfill. Old rows' workspaces stay readable in their metadata.

## Documentation

- **Audit log** (`audit#audit`): the five fields; filtering by workspace and request ID; how to
  find an event's log lines.
- **Logs** (`logs`): an event's request ID ties it to its lines.
- **Privacy** (`privacy#retention`, `privacy#erase`): the client (user agent) is cleared with
  addresses.
- **Helpers:** the audit page's "What's the request ID?" → `audit#audit`.
- **Overview** (`overview`): the sidebar's groups, Admin among them, and that they open and close.

## Acceptance criteria

- [x] The migration adds the columns and indexes on SQLite, PostgreSQL, MySQL and MariaDB; the guard
  and migration tests pass.
- [x] Every event recorded during a web, API, SCIM, terminal or job run carries the right `via`,
  and the request's ID and client where there's a request; db tests per channel.
- [x] Failure actions record `failed` or `denied`; others `success`.
- [x] Every `inWorkspace` action is recorded with its workspace; a guard test fails when one isn't.
- [x] The audit page filters by workspace and by request ID, and shows the fields in the detail.
- [x] Retention and erasure clear user agents with addresses; the data download includes the
  fields.
- [x] `appAuditPage` and `appAuditEvent` refuse anyone without `audit.read`.
- [x] Every new text is a message in English, Portuguese and French; the audit page passes the
  phone sweep.
- [x] The sidebar and the phone's Menu have an Admin group, after Tools, for root only, with
  Users, Audit log, Settings and Feedback.
- [x] Each group opens and closes from its heading, open at first, kept per browser in a cookie
  that the sidebar and the Menu share; a closed group shows a dot while a count waits in it; the
  folded sidebar shows every link.
- [x] The Documentation and MVP §10's `audit_log` row say what the feature does.

## Decisions

1. **The five fields, filled in one place** (owner, 2026-11-01). `recordAudit` reads the request
   context, so the 34 repositories that record events don't change. Only the workspace is passed by
   callers, because only they know it.
2. **No foreign key on `workspace_id`** (Claude). An audit row must outlive what it describes. The
   actor's key is `SET NULL` for the same reason, and a workspace's id is worth keeping for the
   filter.
3. **The user agent is personal data** (Claude). It's cleared with addresses by retention and
   erasure, and it's in the person's download.

4. **The groups remember their state, start open, and a closed one shows a waiting count's dot**
   (Claude, to confirm). A cookie lets the server render each page as the person left it, with no
   flash; open at first, so nothing is hidden from someone new; the dot keeps reviews waiting from
   going unseen behind a closed group.

## Open questions

- Should `via: api` events also record the token's id (never its secret) as a column, rather than
  in the metadata as draft uploads do today? It would make "everything this token did" one filter.
