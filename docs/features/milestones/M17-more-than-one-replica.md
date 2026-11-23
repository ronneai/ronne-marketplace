# M17 — More than one replica

> [All milestones](README.md) · [Features index](../README.md)

Ronne runs behind a load balancer on several replicas (owner, 2026-10-06). Nothing that has to be
shared lives in one process's memory or on one machine's disk. Build order: 109 → 110 → 111.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [109](../operations/109-shared-rate-limits/SPEC.md) | Shared rate limits: every limit the set-up app keeps (sign-in, provider sign-in, `rmk login --web`, SCIM, uploads, submits, usage, feedback, the gap between new backup codes) counted in one database table instead of in memory, as keyed hashes, each attempt in one locking transaction; expired rows purged; the same limits and messages; the setup code's and Better Auth's limiters stay in memory | 006, 037, 046 | done (the Documentation in ronne-web `docs/marketplace-109-rate-limits`) |
| 110 | S3-compatible storage: a `StorageAdapter` for S3 (AWS, MinIO, R2 and the like), chosen in setup or by environment; server-side encryption; tests against MinIO; a command that copies local storage into a bucket | 015, 099 | planned |
| 111 | Replicas checked: every remaining in-memory state found and made shared or safe to repeat (the marketplace cache by catalogue revision, scheduled jobs under a lock, the per-person two-factor queue of 105); a compose example with two replicas, and an end-to-end run against it | 109, 110, 079, 102 | planned |
