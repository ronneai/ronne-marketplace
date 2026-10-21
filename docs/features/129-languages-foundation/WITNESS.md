# 129 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).


## Task 1 — Inventory and dependency check

Witnessed: 2026-10-21 01:55 UTC, by a fresh agent (blind). Commit: 105bb2b5 plus uncommitted changes (apps/web/package.json, pnpm-workspace.yaml, pnpm-lock.yaml, PLAN.md). Machine: macOS (Darwin 27), Node v24, pnpm 12.6.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `next-intl` is added to apps/web at an exact version, not older than ronne-web's | yes | confirmed | `git diff apps/web/package.json` → `"next-intl": "4.14.9"`, no `^` or `~`. `../ronne-web/www/package.json:25` → `4.14.6`. Lockfile specifier is 4.14.9. |
| 2 | Release age is at least 4320 minutes | yes | confirmed | `pnpm view next-intl@4.14.9 time` → 2026-10-02T11:05Z, about 19 days before 2026-10-21. `pnpm install --frozen-lockfile` → "Lockfile passes supply-chain policies". |
| 3 | Licence is allowed | yes | confirmed | `pnpm view next-intl@4.14.9 license` → MIT. Its new dependencies are MIT, except `@swc/core` (Apache-2.0). `pnpm licenses:check` → "345 packages checked. All licenses are allowed by the policy." |
| 4 | `pnpm audit --audit-level high` passes | yes | confirmed | `pnpm audit --audit-level high` → "No known vulnerabilities found". |
| 5 | Every package with an install script is ruled on in `allowBuilds` | yes | confirmed | Only `@swc/core@1.16.18` (postinstall) and `@parcel/watcher@2.6.0` (install) have scripts; `pnpm-workspace.yaml` sets both to `false` with a comment; `pnpm ignored-builds` → "Explicitly ignored (via allowBuilds): @parcel/watcher, @swc/core, esbuild"; the frozen install passes under `strictDepBuilds`. |
| 6 | Disabling those two builds does not break typecheck | no | confirmed | `pnpm --filter @ronneai/web typecheck` → "Types generated successfully", no tsc errors. |
| 7 | The notes list the areas that need keys | yes | confirmed | Folder counts and sizes match (app 32, components/ui 28, admin-settings 16, …; 198 non-test .tsx files, 22,942 lines in features and components). |
| 8 | The notes list the error codes that need keys | yes | confirmed | `error: "<code>"` extracted from non-test src and diffed against the notes' list → identical, 38 codes. |
| 9 | The notes' counts of constant error/label maps, domain error classes, `Intl` files and added packages are accurate | yes | not met | The notes said 17 map files, 152 error classes, 12 `Intl` files, 32 packages and named `LocalTime` as formatting; the witness counted 16 files / 18 definitions, 153 classes, 15 files, 48 package versions, and no `Intl` hit in `LocalTime`. |
| 10 | The notes describe the error path: actions return `{ error: "<code>" }`, components map it with constant maps, and the OAuth device codes stay as they are | yes | confirmed | The maps exist at `features/sign-in/types.ts`, `account-security/types.ts`, `device/types.ts` and `account/types.ts`; the seven device-flow codes are in the 38-code list. |

**Overall:** not met (row 9: five wrong counts in the notes; the dependency rows and both lists were confirmed). Fixed in the notes: the package count removed, the maps and classes given with their commands (17 files and 19 definitions; 153), the `Intl` files recounted (15), `LocalTime` described through `time-text.ts`.

### Re-check (row 9 only)

Witnessed: 2026-10-21 02:10 UTC, by a fresh agent (blind re-check). Commit: 105bb2b5 plus uncommitted changes. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9 | The notes' counts of maps, domain error classes, `Intl` files and the LocalTime remark are accurate | yes | confirmed | From apps/web/src: the stated maps command (tests left out) → 17 files, 19 definitions; `grep -rhE "^export class \w+ extends" server/domains` → 153; `Intl.\|toLocale` over non-test files → 15 (10 UI, 5 server); `components/ui/LocalTime.tsx:4` imports `time-text`, and `time-text.ts:26` uses `Intl.DateTimeFormat`; the package count is gone from the notes. |

**Overall:** met.
