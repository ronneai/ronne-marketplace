# M31 — Configurable governance

> [All milestones](README.md) · [Features index](../README.md)

Planned on 2026-11-01, with M28, M29, M30: why, and in what order, in [the milestones](README.md#planned-on-2026-11-01).

A workspace can make the instance's rules stricter for itself, every decision says which rule made
it, and exceptions end on a date.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| 178 | Governance policies: one policy module every decision goes through (approvals, the scan gate, moves, item types allowed), instance policies with workspace policies that can only make them stricter, and "why was this refused" on every refusal | 091, 137, 169 | planned |
| 179 | Approvals by risk: the instance or a workspace asks for two approvals, or one from a security reviewer, for hooks, MCP servers, widening permission rules or network access | 178 | planned |
| 180 | Exceptions with an owner and an end date: a scan override, a policy exception or an accepted risk recorded with its reason and expiry, listed, reminded before it ends, audited | 178, 139 | planned |
| 181 | Settings history: every instance and workspace setting kept with who, when and why (secrets redacted), compared, and restored from Admin › Settings | 166 | planned |
| 182 | Access report and inactive accounts: who holds which role where, with last sign-in and last token use, as a page and CSV; root's policy flags or disables accounts unused for a number of days | 166, 169 | planned |
| 183 | Session policy: the longest session, an idle timeout, and "remember me" for reviewers and root, set on the Authentication tab | 006, 122 | planned |
| 184 | Service accounts: workspace-owned accounts that sign in only with tokens, made by the workspace's admins, with an owner, scopes and an end date | 170 | planned |
| 185 | Tamper-evident audit log: each event chained to the one before by a hash, `rmk-server audit verify`, and retention's and erasure's rewrites recorded in the chain | 166 | planned |
| 186 | Alerts and scheduled backups: example alert rules for the metrics already sent (health, sign-in failures, rate limits, failing jobs, backup age), a failing-jobs metric, and `service install` adding an encrypted backup timer | 101, 165, 083 | planned |
