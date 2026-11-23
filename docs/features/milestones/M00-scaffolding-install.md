# M0 — Scaffolding & install

> [All milestones](README.md) · [Features index](../README.md)

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [001](../platform/001-monorepo-scaffold/SPEC.md) | Monorepo scaffold, tooling and CI | — | done |
| [002](../platform/002-db-layer/SPEC.md) | Database layer and first migration | 001 | done |
| [003](../install/003-setup-installer/SPEC.md) | `pnpm run setup` installer and root account | 002 | done |
| [004](../platform/004-ci-db-matrix/SPEC.md) | CI against SQLite, MySQL and PostgreSQL | 002, 003 | done |
| [005](../install/005-docker/SPEC.md) | Docker image and compose | 003 | done |
