# 007 — Audit log

> Milestone: M1 · Depends on: 002 · Used by: 006, 008, 009, and later 014–016 · Design: [MVP §10](../../MVP/MVP.md#10-data-model-mvp), [§12](../../MVP/MVP.md#12-security-considerations)

## Goal

A permanent record of who did what, when, and from where, for everything that changes access or
content. Root can read it in the web app. It's the evidence MVP §12 asks for (approvals, overrides,
releases, tag moves, yanks, user and role changes), starting with the M1 identity events.

## Scope

**In:**
- Migration `0002_audit_log` and its Kysely types.
- An `audit` domain: `AuditEvent` model, repository and `recordAudit()`. It writes in the caller's transaction.
- The M1 event catalogue (below), and recording it from 003 (setup and reset), 006 (sign-in), 008 (user admin) and 009 (tokens).
- `/admin/audit`: root-only, newest first, cursor pagination, filters.

**Out:**
- Review, release and tag events → recorded by 014–016 using this same API.
- Export, retention limits, and shipping events to external systems (SIEM) → post-MVP.
- Notifications about events → out of MVP scope.

## Behaviour

**Table `audit_log`** (migration `0002_audit_log`, the 002 portability rules):

| Column | Type | Notes |
|---|---|---|
| `id` | ULID | Sorts by time |
| `actor_id` | ULID, nullable | FK → `user` **ON DELETE SET NULL**. `null` means the system or the command line (then `metadata.via = "cli"`) |
| `action` | `varchar(64)` | From the catalogue, for example `user.created` |
| `target_type` | `varchar(32)` | `user`, `access_token`, `session`, `instance`, and later `item`, `submission`… |
| `target_id` | `varchar(64)`, nullable | The target's id |
| `metadata` | JSON text | Extra facts. **Never secrets**: no passwords, token values or hashes |
| `ip_address` | `varchar(45)`, nullable | From the request (IPv6-sized). Behind a proxy, only with `TRUST_PROXY=true` |
| `created_at` | timestamp | UTC |

Indexes on `created_at`, (`target_type`, `target_id`) and `actor_id`. The foreign key is a
table-level constraint (the 002 rule for MySQL).

**Writing:**
- `recordAudit(db, event)` in `domains/audit`. Services call it **inside the transaction** of the
  change it describes, so a failed change leaves no event and an event never exists without its change.
- It validates `action` against the catalogue, and `metadata` against a denylist of secret-looking
  keys (`password`, `token`, `hash`, `secret`). It throws rather than store a secret.
- **No update or delete** exists anywhere in the code for `audit_log`. A guard test fails if the
  repository gains one. (A root with direct database access can still change rows: this log is
  for accountability inside the app, not tamper-proofing. Signing is post-MVP.)

**M1 event catalogue:**

| Action | Target | Recorded by | Metadata |
|---|---|---|---|
| `instance.root_created` | user | setup (003), actor `null` | `{ via: "cli", email }` |
| `user.password_reset` | user | reset-root-password (003), root reset (008) | `{ via, sessionsEnded, tokensRevoked }` |
| `auth.signed_in` | session | 006 | `{ remember }` |
| `auth.sign_in_failed` | — | 006, actor `null` | `{ email }` (as typed, lowercased), `reason: "invalid" \| "disabled" \| "rate_limited"` |
| `auth.signed_out` | session | 006 | — |
| `user.password_changed` | user | 006 | `{ otherSessionsEnded }` |
| `user.created` | user | 008 | `{ email, role }` |
| `user.role_changed` | user | 008 | `{ from, to }` |
| `user.disabled` / `user.enabled` | user | 008 | `{ sessionsEnded, tokensRevoked }` for disable |
| `access_token.created` | access_token | 009 | `{ name, expiresAt, via: "web" \| "cli" }` |
| `access_token.revoked` | access_token | 009, 008 | `{ name, by: "owner" \| "root" \| "disable" }` |

A failed sign-in is recorded only as an attempt, with the typed email. That's useful for spotting
attacks, and it doesn't say whether the account exists.

**`/admin/audit`** (root only, 032's table and 008's admin area):
- **Columns:** time (UTC, mono), actor email (or `system` / `cli`), action (mono badge), target,
  details (the metadata, as key and value pairs), and IP address.
- **Filters:** action (grouped by prefix: `auth.*`, `user.*`, `access_token.*`, `instance.*`),
  actor, and a date range.
- **Paging:** 50 per page, cursor-based (MVP §11: `?cursor=`, based on the ULID).
- **Read-only.** There are no actions on this page.

## Edge cases

- **High volume of failed sign-ins** (an attack): rows are small, and the rate limit (006) caps them
  per IP address. A retention policy is post-MVP; the spec notes the growth risk.
- **A disabled or deleted actor:** events keep `actor_id`. The page shows the email if the user
  still exists, and the id otherwise. Users are disabled, not deleted, in the MVP.
- **Timestamps** are shown in UTC with the offset, never in local time without saying so.
- **Big metadata:** capped at 4 KB when serialized. Larger payloads are a programming error, and it throws.

## Acceptance criteria

- [ ] `0002_audit_log` creates the table, indexes and table-level foreign key on SQLite, MySQL 8.4,
      MariaDB 10.11 and PostgreSQL 15 (the 004 matrix). The foreign key is checked like 0001's.
- [ ] `recordAudit` writes inside the caller's transaction: a rolled-back change leaves no event (a test for each database).
- [ ] Unknown actions, secret-looking metadata keys and metadata over 4 KB are rejected.
- [ ] Setup and reset-root-password (003) record their events.
- [ ] 006, 008 and 009 record the catalogue's events, with a test per event.
- [ ] `/admin/audit` is root-only (others get 404), lists newest first, filters by action, actor and
      date, and pages with a cursor.
- [ ] A guard test fails if code outside migrations updates or deletes `audit_log`.

## Open questions

- None.
