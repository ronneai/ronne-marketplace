# M1 — Auth & users

> [All milestones](README.md) · [Features index](../README.md)

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [032](../web-ui/032-design-system/SPEC.md) | Design system and app shell (brand, fonts, light and dark themes, `components/ui`) | 001 | done |
| [006](../identity/006-web-sign-in/SPEC.md) | Web sign-in, sign-out, change password; Playwright end-to-end tests | 003, 032 | done |
| [007](../operations/007-audit-log/SPEC.md) | Audit log | 002 | done |
| [008](../identity/008-user-admin/SPEC.md) | User admin: create, disable, change role, reset password | 006, 007, 032 | done |
| [009](../identity/009-access-tokens/SPEC.md) | Personal access tokens: UI, `POST/DELETE /api/v1/auth/token`, `GET /api/v1/me`, bearer guard | 006, 007, 032 | done |
| [059](../identity/059-multiple-roots/SPEC.md) | More than one root: root makes other accounts root and changes any role but their own; roots manage each other; at least one active root always remains; `reset-root-password --email` | 003, 006, 007, 008 | done |
