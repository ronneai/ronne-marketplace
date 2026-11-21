# 109 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-11-21 00:21 EST, by a fresh agent (blind). Commit: 6c863032 + working-tree diff (new `docs/features/109-shared-rate-limits/`, edits to `docs/MVP/MVP.md` and `docs/features/README.md`). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The MVP §15 "Login rate limit" row says where the count lives | no | partly | `git diff docs/MVP/MVP.md` → MVP.md:987 now says "Counted in the database since 109 (M17, "Rate limits" below), so replicas share the count and a restart doesn't empty it". It names the right place, but in the present tense while the code still counts in memory (`auth-instance.ts:19-23` `__ronneLoginLimiter`, `login-rate-limiter.ts:6` "in memory"). Other unbuilt decisions (MVP.md:1023-1024) say "planned"; this row does not |
| 2 | A new §15 "Rate limits" row records the database, fixed windows, keyed hashes, failing closed, and the two limiters left in memory, as the spec does | no | partly | MVP.md:1026 has all five, matching SPEC "Decisions" 1-5 and "Behaviour". Same present-tense issue as row 1, and it repeats the spec's incomplete list (row 6) |
| 3 | The index links 109 in M17 and matches the spec | no | confirmed | `docs/features/README.md:328` is under "### M17 — More than one replica" (line 321), links `[109](./109-shared-rate-limits/SPEC.md)`, the same limiters, keyed hashes, locking transaction, purge and the two in-memory exceptions. Status `in progress` |
| 4 | `pnpm witness:check` passes | no | confirmed | `pnpm witness:check; echo $?` → 0 |
| 5 | `pnpm docs:check` passes | no | confirmed | `pnpm docs:check; echo $?` → 0 |
| 6 | The spec's Scope table, with its Out list, covers every in-memory limiter the set-up app uses | no | partly | `grep -rln LoginRateLimiter apps/web/src` → session, two-factor, token-exchange, sso, device-grants, scim, upload-rate-limit, usage-rate-limit, feedback-limiter, setup-code-limit: all in Scope or Out. **Missed:** the backup-code regeneration gap, `two-factor.ts:56-57` (`REGENERATE_GAP_MS = 30_000`, a module `Map`, checked at :249-251, answering `just_made`): per user, per process, loosened by replicas and emptied by a restart, in neither Scope nor Out |
| 7 | The Scope rows' limits, windows and keys match the code | no | partly | SSO, device, `/device` page, SCIM, uploads, submits, usage and feedback all match (sso.ts:57,62,77-78; device-grants.ts:37-40,51-53,111-112,137-139; scim.ts:36-38,72-80; upload-rate-limit.ts:7-8,21,37,47; usage-rate-limit.ts:10-11,21; feedback models/feedback.ts:14-15). **Misstated:** the sign-in row says "the email, and the client IP with `TRUST_PROXY`" for every path, but changing a password (`session.ts:207`) and two-factor (`two-factor.ts:95`) call `loginRateLimitKeys(email, null)`: email only. The key strings (`email:…`, `ip:…`) aren't listed as in the other rows |
| 8 | What stays in memory matches the code: the setup code limiter, and Better Auth's `rateLimit` on `HTTP_ENDPOINTS` only | no | confirmed | `setup-code-limit.ts:6-28` (10 per address, 30 in all, 10 min, `globalThis` at :54). `better-auth.ts:78` `rateLimit: { enabled: true }`, :32 `HTTP_ENDPOINTS = new Set(["/get-session", "/ok"])`, `auth-http.ts:16` 404 for any other path. Side note: `setup-code-limit.ts:12` still says "109 moves them to the database" |
| 9 | The helpers the spec names exist | no | confirmed | `db/locks.ts:9` `forUpdate` (no-op on SQLite, :12), :20 `readCommittedTransaction`, :42 `retryOnDeadlock`; `crypto/sealed.ts:26-27` HKDF-SHA256; `jobs/retention-purge.ts:18` `PURGE_BATCH = 1000`; `jobs/scheduler.ts:17` every 6 h; `retention-job.ts:8,34` under a lease |
| 10 | Migration number 0044 is free | no | confirmed | The last migration is `0043_audit_context.ts`; `grep -rn 0044 docs/features/*/PLAN.md` → only 109's PLAN |

**Overall:** not met. Bugs: (1) the backup-code gap missing from Scope; (2) the sign-in row's keys misstated for two paths; (3) MVP.md's two rows in the present tense for unbuilt work. For later tasks: MVP.md's Feedback row ("the in-memory limiter, 037") and `setup-code-limit.ts:12`.

### Re-check 1

Witnessed: 2026-11-21 00:23 EST, by a fresh agent (blind). Commit: 6c863032 + working-tree diff (untracked `docs/features/109-shared-rate-limits/`, edits to `docs/MVP/MVP.md` and `docs/features/README.md`). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The MVP §15 "Login rate limit" row says where the count lives, and doesn't describe the database count as already built | no | confirmed | MVP.md:987 reads "Ronne's own limiter … Planned to be counted in the database (109, M17, "Rate limits" below)". The code still counts in memory (`login-rate-limiter.ts`), so the row is accurate |
| 2 | The new §15 "Rate limits" row records the database, fixed windows, keyed hashes, failing closed and the two limiters left in memory, matches the spec, and is marked as not built | no | confirmed | MVP.md:1026 starts "Planned (109)", lists all ten Scope limiters including "the gap between new backup codes", and names fixed windows, the HMAC under a key derived from `AUTH_SECRET`, "failing rather than passing", the purge, and the setup code and Better Auth staying in memory, as SPEC Decisions 1–5 and Out say |
| 3 | The index row follows the spec, backup-code gap included | no | confirmed | `docs/features/README.md:328` lists "the gap between new backup codes" and the two limiters left in memory. Status `in progress` |
| 4 | `pnpm witness:check` passes | no | confirmed | → exit 0 |
| 5 | `pnpm docs:check` passes | no | confirmed | → exit 0 |
| 6 | The Scope table now covers the backup-code regeneration gap, and matches the code | no | confirmed | SPEC Scope row "New backup codes (105) … 1 in 30 seconds … the user … (a module `Map` today)". `two-factor.ts:56-57` (`REGENERATE_GAP_MS = 30_000`, `regenerated` Map), :249-251 checked before (`just_made`), :262 set after a success, :315 deleted on disable |
| 7 | The sign-in rows give the right keys per path, as key strings | no | confirmed | Sign-in and `POST /api/v1/auth/token`: "`email:…`, and `ip:…` with `TRUST_PROXY`" = `session.ts:111`, `token-exchange.ts:122` (`loginRateLimitKeys(email, context.ip)`). Changing a password and two-factor changes: "`email:…` only" = `session.ts:207`, `two-factor.ts:95` (`…, null`). Strings match `login-rate-limiter.ts:85` |
| 8 | PLAN.md's tasks cover the backup-code gap and the stale statements noted for later | no | confirmed | Task 3 moves the backup-code gap; task 5 owns `setup-code-limit.ts:12` and MVP.md:1010's "in-memory limiter, 037", and drops "Planned" from the two §15 rows |

**Overall:** met. One wording point, not a failure: SPEC Goal's first sentence put every limit in `LoginRateLimiter`, but the backup-code gap is a plain `Map`; reworded to "nearly all of them by `LoginRateLimiter`".
