# M15 — Privacy and data lifecycle

> [All milestones](README.md) · [Features index](../README.md)

Personal data (emails, names, IP addresses) is kept only as long as needed, and a person can see
it and have it erased, as Quebec's Law 25, PIPEDA and the GDPR expect (owner, 2026-10-06). The
audit log stays whole: an erased person becomes a pseudonym, never a gap. Build order: 102 → 103 →
104.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [102](../operations/102-retention/SPEC.md) | Retention: root sets how long IP addresses (audit log, sessions, device grants) and expired sessions are kept, 90 days by default, on a Privacy tab of Settings; a scheduled purge in the server under a lease in a `jobs` table, and `rmk-server purge` for cron; the Privacy topic in the Documentation | 007, 006, 099 | done (the Documentation in ronne-web `docs/marketplace-102-retention`) |
| [103](../operations/103-erase-user/SPEC.md) | Erase a user: root anonymises an account (email and name become `deleted-user-<id>`; sessions, accounts and tokens deleted; SCIM links (108) deleted, tombstones included, so no `externalId` links it again; IPs cleared), published items and audit events kept under the pseudonym; the last root can't be erased; audited | 008, 059, 102 | done |
| [104](../operations/104-your-data/SPEC.md) | Your data: a person downloads what the instance holds about them (account, tokens' names, submissions, comments, audit events) as JSON, and root can do it for them | 102, 103 | done (the Documentation in ronne-web `docs/marketplace-104-your-data`) |
