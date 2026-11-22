# M14 — Run it safely

> [All milestones](README.md) · [Features index](../README.md)

What a company checks before it runs Ronne (owner, 2026-10-06, from an evaluator's feedback): how
to back it up and restore it, what it logs, what threats it faces and what to do in an incident.
After M13. Build order: 098 → 099 → 100 → 101.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [098](../operations/098-threat-model/SPEC.md) | Threat model and incident response: the threat model (items run on developers' machines, review as the boundary, tokens, plugin feeds, export, our supply chain) and an incident runbook (yank a version, revoke tokens in bulk, rotate `AUTH_SECRET`, read the audit log, tell users); `rmk-server revoke-access` and `rotate-secret`; `SECURITY.md` links both | 007, 016, 009 | done (the yank wording's fix in ronne-web `fix/marketplace-098-yank-locks`) |
| [099](../operations/099-backup-restore/SPEC.md) | Backup and restore: `rmk-server backup` and `restore` (the database, storage and the settings file in one portable archive, made while running, restorable into any of the three database kinds; native dumps left to operators), the Docker volumes, encrypted backups, a backup runbook and a restore test in CI; encryption at rest is the disk's or the database's, documented | 082, 005 | done |
| [100](../operations/100-structured-logs/SPEC.md) | Structured logs: JSON lines with a level, time and request ID, `LOG_LEVEL`, the same fields in every domain, no secrets or tokens in any line | 001 | done |
| [101](../operations/101-metrics-traces/SPEC.md) | Metrics and traces: OpenTelemetry, off unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set (requests, database time, sign-ins, releases, feed builds); the health endpoint reports the database and storage | 100 | done |
