# 108 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Spike: the plugin

Witnessed: 2026-10-18 03:01 EDT, by a fresh agent (blind). Commit: cbbc6d6d + working-tree diff of 108's SPEC.md and PLAN.md. Machine: macOS 27.0.1, Node v24.0.0.

The witness read PLAN.md's Notes from the start, since they are the task's deliverable.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The version read is `@better-auth/scim@1.7.7`, matching the installed `better-auth@1.7.7`; 1.7.10 is the latest (2026-10-15) | yes | confirmed | `shasum` of the spike tarball = `npm view …@1.7.7 dist.shasum` (fea71313…); `diff -r` against the probe's copy → same; `npm view … time` → 1.7.7 2026-09-30, 1.7.10 2026-10-15; `node_modules/.pnpm/better-auth@1.7.7_*` |
| 2 | The dependency checklist: MIT, Jonathan Samines, the better-auth repository, the four peers, zod and @noble/hashes already in the lockfile, one 7,583-line `index.mjs` | yes | confirmed | `package.json` → MIT, J. Samines, `better-auth/better-auth` `packages/scim`, the four peers, deps `zod ^4.5.4`, `@noble/hashes ^2.2.0`; `pnpm-lock.yaml:904,2866`; `wc -l` → 7583 |
| 3 | Seven tables of its own with the field counts given, on all four databases | yes | partly | SQLite only: `node probe.mjs` → scimConnectionBinding(13), scimIdentityTombstone(7), scimSubject(5), scimUser(21), scimProjectionGrant(11), scimGroup(10), scimGroupMember(5). Not generated for PostgreSQL, MySQL or MariaDB; "all four" is inferred from the schema not depending on the database |
| 4 | `managedConnections` adds "two more" tables | yes | not met | `managedSCIMSchema` (`index.mjs:3013-3134`) has three: scimManagedConnection, scimManagedCredential, scimManagedConnectionEvent; `probe2.mjs` with managedConnections → those three plus the seven |
| 5 | Without a native `transaction`, `init` throws; Ronne's `database: { db, type }` gives the Kysely adapter `transaction: undefined` | yes | confirmed | `index.mjs:5499-5502`; `better-auth.ts:69`; `kysely-adapter/dist/index.mjs:40-48`; probe → "The scim plugin requires a database adapter with native transaction support." "Changes every Better Auth write" not tested (an inference) |
| 6 | Tokens: static `connections`, managed ones HMAC under a separate ≥ 32-character `credentialHashSecret`, `verifyBearerToken` for the app's own check | yes | confirmed | `index.mjs:3243-3244` `constantTimeEqual` over `options.connections`; `:2344`, `:2787` HMAC-SHA-256; `:7046` length < 32 throws; `:3257` `verifyBearerToken` |
| 7 | A create calls `internalAdapter.createUser({ email, name })`: a bare `user`, without `global`, the personal workspace or `user.created` | yes | confirmed | `index.mjs:6535-6539`; `kysely-identity-repository.ts:92-150`; `user-admin.ts:121-150` |
| 8 | The hooks' transaction adapter can't reach Ronne's tables, so revocation, memberships and audit "can't join the plugin's transaction" (Decision 5's main reason) | yes | partly | As probed → `Model "access_tokens" not found in schema`. But `probe2.mjs` declares `access_tokens` to Better Auth through a small plugin: `database.create({ model: "access_tokens" })` from `identity.reconcileUser` then works inside the transaction (201, 1 user + 1 token); with the hook throwing (`FAIL=1`) → 500, 0 users + 0 tokens. It can share the transaction, at the cost of declaring Ronne's tables to Better Auth and redoing `disableUser` against its adapter. Too strong as stated |
| 9 | The plugin itself only deletes sessions when the user ends up inactive | yes | confirmed | `index.mjs:4224-4225`; nothing touches tokens there |
| 10 | Routes only under `/api/auth/scim/v2`; `/api/v1/scim/v2` → 404; `meta.location` points at `/api/auth/scim/v2` | yes | confirmed | probe "other base path" → 404; `FULL=1` → `"location":"http://localhost:3000/api/auth/scim/v2/Users/…"`; `HTTP_ENDPOINTS` (`better-auth-http.db.test.ts:67`) |
| 11 | Filters: `eq` only, on User `userName`, `externalId`, emails, Group `displayName`, `externalId`; `maxResults` 100; Entra normalisers | yes | confirmed | `index.mjs:3430-3530` (`unsupported-filter-operator`); `canonicalizeFilterAttribute`; `:3689`; `:7118`, `:7122`. Not in the notes: `and` of up to 10 `eq`, and `id` |
| 12 | The replay table's results | yes | confirmed | `node probe.mjs` (own copy) → every row as listed; bodies hand-written from vendor examples, as the notes say |
| 13 | The choice is named with its evidence; no dependency added | yes | partly | Named; `git diff` touches no `package.json` or lockfile. The evidence leans on row 8, which overstates it, and row 4 is wrong; the other reasons (rows 5, 10, the tables, a second secret, URL rewriting) hold on their own |
| 14 | SPEC Goal, *Reconciling*, *Transactions*, the edge case and Decision 5 match the choice | yes | confirmed | `git diff SPEC.md` → each rewritten; Decision 5 repeats row 8's "couldn't share its transaction" |
| 15 | Decision 2: the plugin never matches by email alone | yes | confirmed | `index.mjs:4093` `resolveUser` defaults to create; `:6448-6459` existing email → 409 `uniqueness` |
| 16 | The DELETE row follows RFC 7644 §3.6 | yes | partly | The 404 matches §3.6, but §3.6 also says the deleted resource MUST be left out of query results and SHOULD NOT count in conflict checks; the row says neither. `probe2.mjs` → the plugin lists 0 after DELETE and re-creates with 201 |
| 17 | `pnpm licenses:check` and `pnpm audit --audit-level high` pass | yes | confirmed | → "✓ 323 packages checked. All licenses are allowed by the policy."; "No known vulnerabilities found", exit 0 |

**Overall:** not met: the Notes and Decision 5 overstate that the plugin "can't" share its transaction (row 8), `managedConnections` adds three tables, not two (row 4), and the DELETE row leaves out §3.6's rule on query results and conflicts (row 16).

Witnessed: 2026-10-18 03:08 EDT, by a fresh agent (adversarial). Commit: cbbc6d6d + working-tree diff of 108's SPEC.md, PLAN.md and WITNESS.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MIT, Jonathan Samines, 2026-09-30; the peers; zod and @noble/hashes already in the lockfile; 1.7.10 the latest | yes | confirmed | `npm view … dist.shasum` = `shasum` of the tarball (fea71313…); package.json as stated; `npm view time` → 1.7.7 2026-09-30, 1.7.10 2026-10-15; lockfile `zod@4.6.5`, `@noble/hashes@2.4.0`; `wc -l` → 7583 |
| 2 | `pnpm licenses:check` and `pnpm audit --audit-level high` pass | yes | confirmed | → "323 packages checked. All licenses are allowed by the policy"; "No known vulnerabilities found", exit 0 |
| 3 | Seven tables on all four databases, plus two more with `managedConnections` | yes | partly | Seven confirmed: SQLite by `probe.mjs`; PostgreSQL 15, MySQL 8.4, MariaDB 10.11 by `108-t1-adv/probe/ddl.mjs` (`compileMigrations`, read-only) → the same 7 with the same field counts. `managedSCIMSchema` (`index.mjs:3013-3172`) has **three**: scimManagedConnection, scimManagedCredential, scimManagedConnectionEvent |
| 4 | `init` throws without native transactions; Ronne's `{ db, type }` gives `transaction: undefined` | yes | confirmed | `index.mjs:5499-5502`; kysely-adapter `dist/index.mjs:41-48`; `better-auth.ts:69`; probe → the quoted error |
| 5 | Using the plugin means native transactions for all of Better Auth | yes | not met | `basepath.mjs`: a second, SCIM-only `betterAuth({ basePath: "/api/v1", database: { db, type, transaction: true }, plugins: [scim] })` on the same database serves `POST /api/v1/scim/v2/Users` → 201; the main instance keeps `transaction` off |
| 6 | Static `connections`; managed HMAC under a ≥ 32-character `credentialHashSecret`; `verifyBearerToken` | yes | confirmed | `index.d.mts:12-23`; `index.mjs:2344, 2787, 7046`; probe with `verifyBearerToken` → bad token 401 |
| 7 | A create calls `internalAdapter.createUser({ email, name })`, a bare `user` row | yes | confirmed | `index.mjs:6535-6538`; `kysely-identity-repository.ts` ~94-150; `user-admin.ts` ~121-150; probe → plain `user` rows only |
| 8 | Through the hook's `DBTransactionAdapter`, `access_tokens` can't be reached | yes | confirmed | Probe → `Model "access_tokens" not found in schema` |
| 9 | So Ronne's revoking, auditing and memberships "can't join the plugin's transaction" | yes | not met | `als.mjs` wraps Ronne's Kysely `transaction().execute` with AsyncLocalStorage: in `identity.reconcileUser`, `als.getStore()` is the plugin's own Kysely `Transaction`, sees the uncommitted `user` row and writes a Ronne table; a throw → 500 and both roll back. SQLite only. Reusing `disableUser` would still need it to take a transaction (`user-admin.ts:189`) |
| 10 | The plugin only calls `deleteUserSessions`, when a user ends up inactive | yes | confirmed | `grep deleteUserSessions` → one hit, `index.mjs:4225`, `if (!active)` |
| 11 | Routes only under `/api/auth/scim/v2`; a rewrite keeps wrong `meta.location`; `HTTP_ENDPOINTS` would change | yes | partly | Ronne's instance: `/api/v1/scim/v2/Users` 404; `rewrite.mjs` → 201 with `meta.location` and `Location` at `…/api/auth/scim/v2/…`; `better-auth.ts:32`. "Only" refuted: the `basePath: "/api/v1"` instance gives `…/api/v1/scim/v2/Users/…` |
| 12 | Filters: `eq` only on the attributes listed; maxResults 100; Entra normalisers | yes | partly | `co` → 400; `:3323, :3689`; `:7118-7122`. Left out: `id` is filterable (`:867-891`, probe → 1 result) and `and` of `eq` works (`rewrite.mjs` → 1 result) |
| 13 | The replay of Entra and Okta bodies gives the table's results | yes | partly | Rerun → every status as listed; hooks saw true, false, true. But the task asks for *recorded* bodies and these are reconstructed (the Notes say so); task 4's *Done when* still says "recorded" |
| 14 | The Notes name the choice with evidence that supports it | yes | partly | Named, but two of its four stated costs (rows 5, 9) are refuted and the "only" of a third (row 11). What stands: creation bypasses Ronne's services (reachable via row 9), the plugin's tables, and its SCIM `id` not being Ronne's user id (probe: resource id ≠ `user.id`) |
| 15 | SPEC and PLAN no longer depend on the plugin elsewhere | yes | confirmed | `grep -n -i plugin` → only Decision 2's comparison, Decision 5 and task 1; task 3 reads "over our handlers (task 1)" |
| 16 | Decision 2: the plugin never adopts an account by email alone | no | confirmed | `assertBetterAuthEmailAvailable`, `index.mjs:6448-6460`; probe → 409 "A Better Auth User already uses this email" |
| 17 | The Users DELETE row agrees with RFC 7644 §3.6 | yes | partly | With `id` = the user id and a re-create "links the account again", the deleted id comes back. §3.6's conflict rule is unaddressed: after DELETE, a POST with the same `userName` and a new `externalId` hits "an email that belongs to a non-provisioned account" → 409 (the plugin too, `als2.mjs`). Lists aren't said to leave it out |
| 18 | The edge case "Create for a deprovisioned user" agrees with the spec | yes | partly | For an account deprovisioned by `PATCH active: false` (link still there), the edge case says 201 and the POST row says 409 on a duplicate `externalId` |
| 19 | SPEC Decision 5's reasons hold | yes | not met | "Can't share its transaction" refuted by row 9; "only under `/api/auth/scim/v2`" and "native transactions for all of Better Auth" by rows 5 and 11. The choice can stand on other grounds (row 14) |

**Overall:** not met: the dependency facts and the replay hold, and both checks pass, but the decision's main evidence is refuted (AsyncLocalStorage joins the transaction; a SCIM-only instance at `/api/v1` gives the right routes without global transactions), and the SPEC's DELETE/re-create wording and the deprovisioned-create edge case are inconsistent.

### Re-check 1 (blind: rows 3, 4, 8, 13, 16, plus what the diff touches)

Witnessed: 2026-10-18 03:20 EDT, by a fresh agent (blind). Commit: cbbc6d6d + working-tree diff of 108's SPEC.md and PLAN.md. Machine: macOS 27.0.1, Node v24.0.0.

The witness read PLAN.md's Notes from the start, since they are the task's deliverable. Task 2's uncommitted files were ignored.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | Seven tables of its own, the same on all four databases (migrated on SQLite, compiled for PostgreSQL 15, MySQL 8.4, MariaDB 10.11) | yes | confirmed | `node 108-t1-adv/probe/ddl.mjs` against the running servers → each "scimConnectionBinding(13), scimIdentityTombstone(7), scimSubject(5), scimUser(21), scimProjectionGrant(11), scimGroup(10), scimGroupMember(5)"; `ddl-recheck.mjs` → MySQL/MariaDB "text+unique: none" |
| 4 | `managedConnections` adds three more tables | yes | confirmed | `index.mjs:3014,3064,3134`; `probe2.mjs` → "managed tables:" those three plus the seven |
| 8 | (Restated) The hooks' adapter knows only Better Auth's models; Ronne's work can still join the transaction by declaring its tables or by AsyncLocalStorage, a throw rolling back both | yes | confirmed | `probe.mjs` → `Model "access_tokens" not found in schema`; `probe2.mjs` → 201 with 1 user + 1 token, `FAIL=1` → 500 with 0 + 0; `als2.mjs` → "trx in hook? true", a throwing create → 500, only the first user and its audit row remain |
| 13 | The choice is named with its evidence; no dependency added | yes | confirmed | PLAN.md:134-144; reasons match rows 3, 4, 5, 8, 10; `git diff --name-only -- '*package.json' pnpm-lock.yaml` → empty |
| 16 | The DELETE row follows RFC 7644 §3.6 | yes | confirmed | SPEC.md:83 says 404 for everything after, left out of lists and filters, in no `uniqueness` check; `probe2.mjs` → delete 204, list 0, re-create 201; `als2.mjs` → old id 404, new id ≠ old |
| 18 | The restated Routes and Filters notes hold | yes | confirmed | `basepath.mjs` → 201, `meta.location …/api/v1/scim/v2/…`; `rewrite.mjs` → `…/api/auth/scim/v2/…`, and-filter 200, id-filter 200; `index.mjs:3508` (at most 10 `eq`) |
| 19 | SPEC's POST and GET rows and the "Create for a deprovisioned user" edge case agree with each other and §3.6 | yes | partly | They agree, but Decision 2 says signing in once through the provider (106) links a manual account, and the POST row's 409 for "an account this provider never provisioned" doesn't say whether such an account is adopted (201) or refused |
| 20 | The Groups "Members are SCIM user ids (live links)" sentence fits §3.6 | yes | partly | Silent on what a group's `members` shows after one member is DELETEd; §3.6 points to leaving it out |
| 21 | The rest of SPEC agrees with the new DELETE rule | yes | partly | Scope (SPEC.md:25-27): "`active: false`, or `DELETE` … A later `active: true` enables it again" reads as both paths coming back the same way; after DELETE the id is 404 and the account returns through a new create |
| 22 | The acceptance criterion, open question and PLAN tasks 1, 3, 4 say "the request shapes Entra and Okta publish" | yes | confirmed | SPEC.md:158, :200; PLAN.md:16, :27, :35-36; `grep -i recorded` → only the Notes line explaining the change |
| 23 | Decision 5 matches the Notes and no longer says "can't" | yes | confirmed | SPEC.md:186-194 = PLAN.md:134-139 and row 8 |
| 24 | `pnpm licenses:check` and `pnpm audit --audit-level high` pass | yes | confirmed | → "✓ 323 packages checked. All licenses are allowed by the policy."; "No known vulnerabilities found", exit 0 |

**Overall:** not met: rows 3, 4, 8, 13 and 16 hold now; three SPEC wording gaps remain (rows 19, 20, 21).

### Re-check 1 (adversarial: rows 3, 5, 9, 11, 12, 13, 14, 17, 18, 19, plus what the diff touches)

Witnessed: 2026-10-18 03:09 EDT, by a fresh agent (adversarial). Commit: cbbc6d6d + working-tree diff of 108's SPEC.md and PLAN.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | Seven tables on all four databases, plus three with `managedConnections` | yes | confirmed | `ddl.mjs` → PostgreSQL, MySQL, MariaDB each list the same 7; `index.mjs:3014,3064,3134` |
| 5 | Native transactions required, but a second SCIM-only instance with `transaction: true` works | yes | confirmed | `index.mjs:5499-5502`; `better-auth.ts:69`; probe → `make(undefined)` throws, `make(true)` serves the replay |
| 9 | Ronne's work can join the plugin's transaction, a throw rolling back both | yes | confirmed | `als2.mjs` → hook throws: 500, users [a only], one audit row. The ALS proxy also breaks `db.fn.count` (and-filter 500), backing the "how Better Auth opens transactions" cost |
| 11 | Routes under the base path; a rewrite leaves `/api/auth` locations; `basePath: "/api/v1"` fixes it at the stated cost | yes | partly | `rewrite.mjs`, `basepath.mjs` as stated. Overstated: "the disabled check repeated" is `databaseHooks.session.create.before` (`better-auth.ts:100-119`) and the plugin never makes a session. Not named: the second instance needs Ronne's `authSchema` mapping |
| 12 | Filters: `eq` on the listed attributes, up to 10 joined by `and`, 100 results | yes | confirmed | `index.mjs:3337-3343`, `:3507-3508`, `:3689`; `rewrite.mjs` → and-filter and id-filter 200; `als2.mjs` → `co` 400 |
| 13 | The bodies are "the request shapes Entra and Okta publish", not recorded | yes | confirmed | grep "recorded" in SPEC.md and PLAN.md tasks → none |
| 14 | The evidence: the replay's DELETE row and the weighed costs | yes | partly | `after-delete.mjs` → filter after DELETE 0, same-`externalId` create 201 with a new id; but `probe.mjs` itself stops at `get ann`. "Seven tables … copying what Ronne already keeps" overstated: task 2 adds counterparts to four of them |
| 17 | The DELETE row agrees with RFC 7644 §3.6 | yes | confirmed | SPEC.md:83, :80; task 4 "repeated delete (404)". The conflict rule is a SHOULD NOT in the RFC, not a requirement |
| 18 | Create for a deprovisioned user agrees with the POST row and the rest | yes | partly | Relinks on the tombstone's `userName` alone, which Decision 2's reason forbids; the plugin answers 409 for same email + new `externalId` (`after-delete.mjs`). A reused address would inherit the old account. `externalId` and `userName` pointing at different accounts unspecified |
| 19 | Decision 5's reasons are true and fairly weighed | yes | partly | Rows 5, 9, 11 hold; "copying what Ronne keeps" overstated (row 14); the plugin as test reference contradicts the edge case (row 18) |
| 20 | The SPEC agrees with itself on linking (POST row, Out, Decision 2, Reconciling, Scope) | no | partly | POST 409s "an account this provider never provisioned", yet Out and Decision 2 say that after a 106 sign-in "SCIM updates it": nothing creates the SCIM link. Reconciling's two-provider case is unreachable. Scope's "a later `active: true`" doesn't fit DELETE |
| 21 | Groups: "Members are SCIM user ids (live links)" fits the new id rule | no | partly | Silent on whether a group lists a DELETEd link's id, and on the person's groups after a re-create with a new id. The plugin's group GET shows no `members` (`after-delete.mjs`) |
| 22 | `pnpm licenses:check` and `pnpm audit --audit-level high` pass | yes | confirmed | → "323 packages checked. All licenses are allowed by the policy."; "No known vulnerabilities found" |

**Overall:** not met: the facts behind the choice hold, but the edge case relinks by `userName` alone (against Decision 2 and the plugin), two costs are overstated, the linking rules contradict each other (POST against Out, Decision 2, Reconciling), and groups after a DELETE are unspecified.

### Re-check 2 (blind: rows 19, 20, 21, plus what the diff touches)

Witnessed: 2026-10-18 03:17 EDT, by a fresh agent (blind). Commit: cbbc6d6d + working-tree diff of 108's SPEC.md and PLAN.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 19 | A create for a manual account the provider signs in to (106) has one answer, and the POST row, Out and Decision 2 agree | yes | confirmed | SPEC.md:81 adopted (201); :49-52 Out; :188-192 Decision 2. The plugin answers 409 by default (`index.mjs:4093`, :6457) |
| 20 | What a group lists after a member's DELETE is specified and fits §3.6 and the plugin | yes | confirmed | SPEC.md:85, :100-102; `FULL=1 node after-delete.mjs` → `"members":[]` after the DELETE |
| 21 | Scope's reactivation tells `active: false` from DELETE | yes | confirmed | SPEC.md:26-29 matches the edge case at :127-136 |
| 22 | The DELETE and POST rows and the edge case fit RFC 7644 §3.6 | yes | confirmed | SPEC.md:85; the reused-email 409 comes from the account, not the deleted resource; the plugin agrees (row 25). RFC text checked from memory |
| 23 | Adopting a sign-in-linked account agrees with the edge case's 409 for a tombstone's email with another `externalId` | no | partly | A SCIM-provisioned account with a 106 `account` row, then DELETE: the POST row adopts ("not by SCIM"), the edge case says 409. With SCIM and OIDC on one provider this is the usual case |
| 24 | DELETE's group removal agrees with the rest of the SPEC on memberships | no | not met | SPEC.md:85 drops group-given memberships on DELETE; the edge case :137-138, Decision 3 (:193) and the criterion (:170-171) still say memberships stay on deprovisioning |
| 25 | The Notes' after-DELETE replay row matches the probe | yes | confirmed | `node after-delete.mjs` → filter 0; same `externalId` 201, new id, same account; same email + new `externalId` 409. The probe ends with an unhandled rejection (exit 1) |
| 26 | Reconciling agrees with Scope's deprovisioning | yes | partly | Reconciling disables only when no SCIM link says active; Scope says `active: false` or DELETE "disables the account" unconditionally |
| 27 | Decision 5's costs (seven tables against four, `authSchema`) and no plugin left elsewhere | yes | confirmed | `grep createTable 0028_scim.ts` → 4; `better-auth.ts:122`; `grep -n plugin SPEC.md` → Decisions 2 and 5 only |
| 28 | `pnpm licenses:check` and `pnpm audit --audit-level high` pass | yes | confirmed | → "323 packages checked. All licenses are allowed by the policy."; "No known vulnerabilities found" |

**Overall:** not met: rows 19-21 hold, but DELETE's membership rule contradicts the deprovisioning edge case and Decision 3 (row 24), adoption conflicts with the tombstone 409 (row 23), and Scope doesn't reflect Reconciling (row 26).

### Re-check 2 (adversarial: rows 11, 14, 18, 19, 20, 21, plus what the diff touches)

Witnessed: 2026-10-18 03:18 EDT, by a fresh agent (adversarial). Commit: cbbc6d6d + working-tree diff of 108's SPEC.md and PLAN.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 11 | Routes under the base path; `basePath: "/api/v1"` fixes it at the stated cost | yes | confirmed | "Disabled check repeated" gone; cost reads "its other routes kept closed, Ronne's `authSchema` column mapping repeated" (`better-auth.ts:8,122`) |
| 14 | The replay's DELETE rows and the weighed costs | yes | confirmed | `node after-delete.mjs` → 204, 404, 404, filter 0, same-`externalId` 201 new id, recycled email 409; four tables match `0028_scim.ts` |
| 18 | Create for a deprovisioned user is one rule with the POST row and the rest | yes | partly | (a) conflicts with the POST row's adoption for a tombstoned account with a 106 link; (b) "`externalId`, the provider's stable id" is false for Entra by default: Microsoft maps `mailNickname → externalId` (learn.microsoft.com, use-scim-to-provision-users-and-groups), an alias that can be reused |
| 19 | Decision 5's reasons are true and fairly weighed | yes | confirmed | SPEC:196-206; the plugin's group also shows no members after DELETE |
| 20 | The SPEC agrees with itself on linking | no | not met | (a) Scope's "comes back only through a create with the same `externalId`" against adoption of a tombstoned account; (b) what adoption matches on isn't named, and 106's link is bound to an OIDC subject SCIM doesn't carry; (c) "not by SCIM" is unclear for another provider's link: two providers could then both manage name and email |
| 21 | Groups and DELETE agree with §3.6 and the "mapped group is deprovisioned" edge case | no | not met | §3.6 holds, but DELETE drops group memberships while the edge case (:137) and Decision 3 (:193) say they stay; no task's *Done when* covers DELETE leaving its groups |
| 23 | Adoption through 106's link "gives the provider nothing it didn't have" | yes | partly | A create defaults `active: true`, so adopting a hand-disabled account re-enables it (106 refuses its sign-in); the provider then manages name and email; 106 binds the link to a subject, but adoption by email lets a recycled address take the old account |
| 22 | `pnpm licenses:check` and `pnpm audit --audit-level high` pass | yes | confirmed | → "323 packages checked. All licenses are allowed by the policy."; "No known vulnerabilities found" |

**Overall:** not met: the facts and costs behind the choice hold, but adoption through 106's link contradicts the DELETE edge case and gives the provider more than sign-in does, DELETE's membership rule contradicts Decision 3, and Entra's default `externalId` (`mailNickname`) isn't stable.

### Re-check 3 (blind: rows 23, 24, 26, plus what the diff touches)

Witnessed: 2026-10-18 10:44 EDT, by a fresh agent (blind). Commit: cbbc6d6d + working-tree diff of 108's SPEC.md and PLAN.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 23 | Adopting a sign-in-linked account agrees with the tombstone-email 409 | yes | confirmed | SPEC.md:82 adopts only with "no SCIM link on any provider, live or deleted": a tombstoned account is never adopted, so 409, as the edge case :136-138 and Decision 2 :195-200 say |
| 24 | DELETE's group removal agrees with the rest of the SPEC on memberships | yes | confirmed | DELETE row :86, Groups :103, edge case :134-135, the `active: false` edge case :141-142, Decision 3 :201-202; the criterion :175-177 no longer mentions memberships |
| 26 | Scope's deprovisioning agrees with Reconciling's multi-provider rule | yes | partly | They agree with each other, but under the POST row :82 no account can get SCIM links on two providers, so the case they handle can't happen |
| 29 | Out's "matching an existing account" agrees with the POST row and Decision 2 | yes | partly | SPEC.md:50-53 says the next create "adopts the account" with no conditions; the POST row and Decision 2 require it to be enabled, non-root, with no SCIM link anywhere |
| 30 | Entra's Documentation step maps `objectId` to `externalId` | yes | confirmed | SPEC.md:159; the edge case :129-131; PLAN Notes |
| 31 | The PLAN Notes' decision line matches the owner's rule and the SPEC | yes | confirmed | PLAN.md:153-158 = SPEC.md:82 and Decision 2; Entra `objectId`; DELETE leaves groups, `active: false` keeps them |
| 32 | `pnpm licenses:check` and `pnpm audit --audit-level high` pass | yes | confirmed | → "323 packages checked. All licenses are allowed by the policy."; "No known vulnerabilities found" |

**Overall:** not met: rows 23 and 24 hold, but Reconciling's multi-provider rule describes a state the POST row makes impossible (row 26), and Out's bullet promises adoption without its conditions (row 29).

### Re-check 3 (adversarial: rows 18, 20, 21, 23, plus what the diff touches)

Witnessed: 2026-10-18 10:45 EDT, by a fresh agent (adversarial). Commit: cbbc6d6d + working-tree diff of 108's SPEC.md and PLAN.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 18 | A create for a deprovisioned user follows one rule; the Documentation asks Entra for an immutable `externalId` | yes | confirmed | SPEC.md:82 never adopts a tombstoned account; :128-140 and Decision 2 match `externalId` only; :129-131, :159 map `objectId`. A tombstone plus a 106 link → the `externalId` path, then 409 |
| 20 | The SPEC agrees with itself on linking: the email match, subject binding, a second SCIM provider | yes | partly | (a) "Byte for byte" (:82) doesn't say before or after lowercasing, and nothing refuses non-ASCII: `normalizeEmail` (`models/user.ts:59-66`) only trims and lowercases, so a Kelvin-sign `Kate@…` would adopt `kate@…`, which 106 refuses (106 SPEC:273-278); before lowercasing, Entra's capitalised UPNs never adopt. (b) A person whose email changed at the provider after a 106 link gets a second account; unmentioned. (c) The tombstone match never says "of this provider". (d) No account can get SCIM links from two providers, so Scope :27 and Reconciling :108-109 describe a state that can't happen |
| 21 | DELETE's group rule agrees with the edge case, Decision 3, the criteria and the tasks | yes | partly | The text agrees, but no *Done when* covers DELETE removing group-given memberships or a re-create starting in no group (PLAN.md:33-41); :99 says `POST /Groups` takes "user ids" where :102 says SCIM user ids |
| 23 | Adoption never enables an account, never changes 106's link, gives no more than sign-in | yes | partly | :82 and 106 SPEC:267-268 hold, but not while row 20(a) is open (a Kelvin-sign `userName` adopting after lowercasing) |
| 29 | The Notes' decision line matches the SPEC | yes | partly | Matches :82 and :86, with row 20(a)'s unclear point |

**Overall:** not met: tombstones, adoption, Entra's `objectId` and DELETE's group rule are consistent, but the email match isn't defined, a changed email gives an unmentioned duplicate account, tombstone matching isn't limited to its provider, the two-provider rule is unreachable, and no *Done when* covers DELETE's groups.

### Re-check 4 (blind: rows 26, 29, plus what the diff touches)

Witnessed: 2026-10-18 10:47 EDT, by a fresh agent (blind). Commit: cbbc6d6d + working-tree diff of 108's SPEC.md and PLAN.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 26 | Scope's deprovisioning and Reconciling describe a state the POST row allows | yes | confirmed | Scope SPEC.md:26-31 disables without conditions; Reconciling :111-116 "at most one SCIM link … one provider decides `active`", matching POST :82 |
| 29 | Out's adoption bullet carries the POST row's and Decision 2's conditions | yes | confirmed | SPEC.md:49-53 "if it is enabled, not a root, and has no SCIM link on any provider" = :82 and Decision 2 :204-211 |
| 33 | The email match is defined and agrees with 106 and the code | yes | confirmed | SPEC.md:88-92; 106 SPEC:273-276 and `sso-sign-in.ts:85-87` refuse code points above 0x7f; `normalizeEmail` (`models/user.ts:59-66`) only trims and lowercases, so task 4 adds the ASCII check, as its *Done when* asks |
| 34 | Tombstone matching is limited to this provider | yes | confirmed | :82 "another provider's tombstones are never matched"; edge case :139 |
| 35 | The changed-email edge case is specified, and the Documentation section covers it | yes | partly | :147-151 promises a Documentation step (check Ronne emails before turning SCIM on); the Documentation section :168-176 doesn't list it |
| 36 | The tombstone re-create edge case agrees with the create paragraph on `active` | yes | partly | :139 "reactivates it (201)" unconditionally; :93-94 "`active: false` on create makes a disabled account"; which wins is unsaid |
| 37 | Groups take "SCIM user ids" everywhere | yes | confirmed | :103, :106-109, the DELETE row :86 |
| 38 | DELETE, Decision 3 and the `active: false` edge case agree on memberships | yes | confirmed | :86, :152, Decision 3 :212-213, edge case :140-141 |
| 39 | PLAN tasks 4 and 5's *Done when* cover the new rules | yes | confirmed | PLAN.md:32-45; task 3 :27 "our handlers (task 1)" |
| 40 | Licences and audit | yes | confirmed | The diff changes no dependency (SPEC.md and PLAN.md only); earlier passes: "323 packages checked. All licenses are allowed by the policy.", "No known vulnerabilities found" |

**Overall:** not met: rows 26 and 29 hold; two wording gaps: the Documentation section doesn't list the email check the new edge case promises (row 35), and the tombstone re-create doesn't say what `active: false` does (row 36).

### Re-check 4 (adversarial: rows 20, 21, 23, 29, plus what the diff touches)

Witnessed: 2026-10-18 10:48 EDT, by a fresh agent (adversarial). Commit: cbbc6d6d + working-tree diff of 108's SPEC.md and PLAN.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 20 | The SPEC agrees with itself on linking: the email match, subject binding, a second SCIM provider | yes | partly | Fixed: the ASCII check and lowercased match (:88-92, = 106 SPEC:273-278), "this provider's tombstone" (:82, :139), one SCIM link per account (:112-114). Open: (e) a recycled address adopts the old owner's 106-linked account if it's still enabled (Bob's create meets every condition on :82; Alice's name, groups and `active` become his), against Decision 2's reason; (f) the changed-email second account leaves the real one outside deprovisioning, unstated; (g) the ASCII and lowercasing rule covers a create only, not `PUT`/`PATCH` or the `userName eq` filter |
| 21 | DELETE's group rule agrees with the edge case, Decision 3, the criteria and the tasks | yes | confirmed | PLAN.md:42-44; SPEC.md:103, :106, :86, :107, :141, Decision 3 :212-213 |
| 23 | Adoption never enables an account, never changes 106's link, gives no more than sign-in | yes | confirmed | :82; the 400 closes the Kelvin sign; disabled → 409; tombstoned → `externalId` only; root refused. Row 20(e) is another account taken over, not more than sign-in |
| 29 | Out's bullet and the Notes' decision line match the SPEC | yes | confirmed | SPEC.md:49-53; PLAN.md:157-160; consistent with :82, :91 |
| 33 | The changed-email edge case's fix reaches the Documentation section | yes | partly | :149-151 promises the step; the Documentation section :169-172 doesn't list it |
| 34 | PLAN task 4's *Done when* covers the changed text | yes | confirmed | PLAN.md:35-38 |

**Overall:** not met: adoption can hand a recycled address the old owner's account (20e), the changed-email case leaves the real account active unstated (20f), the email rule covers only a create (20g), and the Documentation section lacks the email check (33).

The owner decided row 20(e) (2026-10-18): adoption also needs a sign-in through the provider within 30 days, is audited (`user.scim_adopted`) and shows *Adopted by* in Admin › Users.

### Re-check 5 (blind: rows 35, 36, plus what the diff touches)

Witnessed: 2026-10-18 10:53 EDT, by a fresh agent (blind). Commit: cbbc6d6d + working-tree diff of 108's SPEC.md and PLAN.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 35 | The changed-email edge case is specified and the Documentation section covers it | yes | confirmed | SPEC.md:156-159; Documentation :178-180 |
| 36 | The tombstone re-create agrees with the create paragraph on `active` | yes | confirmed | :143-144; :97; PLAN.md:37 |
| 41 | The adoption rule is stated in full in the Users table and can be built | yes | confirmed | SPEC.md:83; `git show cbbc6d6d:…/actions/sso.ts:327-333` records `auth.sso_signed_in` with the user and `metadata.provider` |
| 42 | Scope lists `user.scim_adopted { provider }` | yes | confirmed | SPEC.md:38 |
| 43 | Out's adoption bullet agrees with the rule | yes | partly | :50-54 lists the conditions as if complete but leaves out the 30 days and the exact email |
| 44 | The email rule covers create, `PUT`/`PATCH`, and the `userName eq` filter | yes | confirmed | :89-95 |
| 45 | Admin › Users and the Documentation show *Adopted by* | yes | confirmed | :123-124; :184 |
| 46 | The changed-email case's remedy works | yes | partly | "Root erases it (103) before changing the first's" (:159): 103 keeps the row, and nothing says erasing ends the SCIM link, so the provider keeps updating it (409 against the first) and never sends the create that would adopt the first; the 30 days unmentioned there |
| 47 | Decisions 2 and 3 and Reconciling agree with the rule | yes | confirmed | :215-225; :115-117 |
| 48 | PLAN task 4's *Done when* covers the new rules | yes | partly | PLAN.md:35-38 doesn't name the lowercased match on `PUT`/`PATCH` and the filter |
| 49 | PLAN task 5 and the Notes' decision line agree | yes | confirmed | PLAN.md:40-45; Notes :157-163 |
| 50 | Licences and audit | yes | confirmed | Only SPEC.md and PLAN.md changed; earlier passes: "323 packages checked…", "No known vulnerabilities found" |

**Overall:** not met: rows 35 and 36 hold; Out leaves out the 30 days (43), the changed-email remedy depends on erasing ending a SCIM link, which nothing specifies (46), and task 4 doesn't test the email rule on updates and the filter (48).

### Re-check 5 (adversarial: rows 20, 33, plus what the diff touches)

Witnessed: 2026-10-18 10:53 EDT, by a fresh agent (adversarial). Commit: cbbc6d6d + working-tree diff of 108's SPEC.md and PLAN.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 20e | Adoption needs a sign-in within 30 days, "so a leaver's account whose address went to someone new isn't taken over" | yes | partly | It narrows the case without closing it: a leaver who signed in within the 30 days, still enabled, whose address goes to a new hire inside the window, is adopted; the new hire can't sign in (`sso-sign-in.ts:105-107`), but the leaver's sessions and `rmk_` tokens gain the new hire's group roles. Audit retention isn't a hole: `audit_log` is insert-only (`schema.ts:122`), no `deleteFrom`/`updateTable("audit_log")` outside tests. The provider is inside `metadata` JSON (`sso.ts:327-335`), for task 4 to parse |
| 20f | The changed-email case's remedy (erase the second, change the first's email) | yes | partly | Needs 103, still `planned` (`README.md:297`), without saying the only remedy until then is disabling the first; and Erase's effect on SCIM links is undefined: a surviving link or tombstone would let the provider's next create relink and re-enable an erased account, undoing its pseudonym |
| 20g | The ASCII/lowercase rule covers create, `PUT`/`PATCH` and the filter | yes | confirmed | SPEC 238-244; stored emails are lowercase on write (`models/user.ts:60`, `session.ts:54`) |
| 33 | The Documentation section lists the pre-checks and the Admin › Users states | yes | confirmed | SPEC 176-183 |

**Overall:** not met: the 30-day rule is described as closing the recycled-address case when it only narrows it (20e), and the changed-email remedy depends on an Erase whose effect on SCIM links isn't defined (20f); no acceptance criterion covers adoption.

### Re-check 6 (blind: rows 43, 46, 48, plus what the diff touches)

Witnessed: 2026-10-18 10:56 EDT, by a fresh agent (blind). Commit: cbbc6d6d + working-tree diff of SPEC.md, PLAN.md and docs/features/README.md. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 43 | Out's adoption bullet agrees with the rule | yes | confirmed | Out points to "the conditions of the Users table's `POST /Users` row (Decision 2)" |
| 46 | The changed-email remedy works | yes | partly | SPEC:150-162: after disabling the first by hand, the create can't adopt it (adoption needs it enabled and signed in within 30 days), and nothing says to re-enable it; "no remedy beyond disabling … :" is followed by a remedy |
| 48 | Task 4's *Done when* covers the new rules | yes | partly | PLAN.md:31-36 names `userName` and the filter, not `emails` (SPEC:252-253) |
| 49 | The POST row and Decision 2 say the 30 days narrow, not close, the case, and what covers it | yes | confirmed | SPEC:83; Decision 2; Documentation :181-183 |
| 50 | The adoption acceptance criterion matches the POST row | yes | confirmed | Same conditions; `user.scim_adopted { provider }` in the audit events |
| 51 | The "For task 4" note is accurate | yes | confirmed | `sso.ts:327-333`; `audit-log.guard.test.ts:6` "insert-only" |
| 52 | Reconciling's "at most one SCIM link" agrees with relinking a tombstone | yes | confirmed | Task 2's Notes: the tombstone is deleted and the new link inserted in one transaction |
| 53 | "Request shapes … publish" everywhere; task 3 "our handlers (task 1)" | yes | confirmed | `grep recorded` over the diff → removed lines only |

**Overall:** not met: the changed-email remedy expects adoption of an account it just told root to disable (46), and task 4 doesn't test the `emails` path (48).

### Re-check 6 (adversarial: rows 20e, 20f, plus what the diff touches)

Witnessed: 2026-10-18 10:58 EDT, by a fresh agent (adversarial). Commit: cbbc6d6d + working-tree diff of SPEC.md, PLAN.md and docs/features/README.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 20e | The 30-day rule is described truthfully as narrowing the case, with the window and what covers it | yes | partly | The window holds against 106 (a new subject is refused). Missing: (a) the leaver's password, if the account has one, also still works; (b) the window stays open after turn-on for any enabled, 106-linked account with no SCIM link (people outside the provisioning scope), so leavers must be disabled by hand then too |
| 20f | The changed-email remedy and the 103 route are defined and work | yes | partly | (a) The route's final adoption needs the first enabled and signed in within 30 days, unsaid; (b) "ended, tombstones included" for 103 is ambiguous: a tombstone left with its `external_id` would relink the erased account |
| 21 | The adoption criterion matches the POST row | yes | confirmed | SPEC:200-203 = :83; `user.scim_adopted` in Scope :38 |
| 22 | The "For task 4" note | yes | confirmed | `sso.ts:327-334`; `grep -rn 'deleteFrom("audit_log")'` → none |

**Overall:** not met: 20e leaves out the leaver's password and the window after turn-on; 20f's route leaves out adoption's conditions, and "ended" tombstones could relink an erased account.

### Re-check 7 (adversarial: rows 20e, 20f, plus what the diff touches)

Witnessed: 2026-10-18 10:59 EDT, by a fresh agent (adversarial). Commit: cbbc6d6d + working-tree diff of SPEC.md, PLAN.md and docs/features/README.md. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 20e | Decision 2 states the remaining reused-address risk in full (sessions, tokens and password still work; the window open after turn-on for enabled, 106-linked accounts with no SCIM link; root disabling leavers before and after turn-on as the cover), and the Documentation checklist says the same | no | confirmed | SPEC.md:225-238; :183-185. Tried: a disabled leaver can't be adopted (:83, enabled required, never enabled); an account inside the provisioning scope closes its window at its first create; "someone outside SCIM" covers the changed-email first account (:154). No gap |
| 20f | The 103 route meets every adoption condition, and 103 deletes tombstones too | no | confirmed | SPEC.md:152-162 against :83: exact email after the change, the 106 link, a sign-in within 30 days (required), no SCIM link, not root, enabled (required). README.md:297 and PLAN.md:196-199: links deleted, tombstones included. Tried: the re-create can't match the deleted tombstone; the address is free once 103 renames the second; the order enables before the sign-in. No gap |

**Overall:** met: the leaver window and the changed-email route through 103 are described fully and agree across the SPEC, the PLAN and the index.

### Re-check 7 (blind: rows 46, 48, plus what the diff touches)

Witnessed: 2026-10-18 10:59 EDT, by a fresh agent (blind). Commit: cbbc6d6d + working-tree diff of SPEC.md, PLAN.md and docs/features/README.md. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 46 | The changed-email remedy works | yes | confirmed | SPEC:152-163: disabling is "the only stopgap"; the way back meets every condition of the POST row (:83): the second erased (link and tombstone deleted, email anonymised), the first's email changed, its 106 row and no SCIM link, re-enabled if disabled, a sign-in within 30 days landing on the first by subject (106 SPEC:159, :279) |
| 48 | Task 4's *Done when* covers the new rules | yes | confirmed | PLAN.md:37 "a `PUT` or `PATCH` of `userName` or `emails` …", with the create, the filter, adoption and the tombstone; matches SPEC:89-95 |
| 50 | Decision 2 names the leaver's password and the window after SCIM is on | yes | confirmed | SPEC:223-240 |
| 51 | The Documentation checklist agrees with Decision 2 | yes | confirmed | SPEC:181-186 = Decision 2:236-238 |
| 52 | 103's index row and PLAN's "For 103" say links are deleted, tombstones included, and agree with the edge case | yes | confirmed | README.md:297; PLAN.md:196-199; SPEC:160; 103 has no folder yet, so its index row is its only text |
| 53 | The changed text reads correctly and the witness records check | yes | confirmed | `pnpm witness:check` → no error. Remark: "within 30 days of the first create" (SPEC:158-159) reads clearer as "in the 30 days before the first create" |

**Overall:** met: rows 46 and 48 hold, and the changed text agrees with the POST row, Decision 2, the Documentation checklist, 103's index row and PLAN's notes.

The remark in row 53 was applied ("in the 30 days before the first create"; wording, no re-check).

## Task 2 — Tables and tokens

Witnessed: 2026-10-18 03:20 EDT, by a fresh agent (blind). Commit: cbbc6d6d + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration 0028 adds `identity_providers.scim_enabled_at` (off by default) and `scim_tokens`, `scim_users`, `scim_groups`, `scim_group_members`, with their foreign keys, and is registered | no | confirmed | `0028_scim.ts:29-153`; `migrations/index.ts` `"0028_scim": scim`; "declares its foreign keys" (7) and "leaves SCIM off" pass |
| 2 | The migration's and the service's tests pass on SQLite, PostgreSQL, MySQL and MariaDB | no | confirmed | vitest `--project db` → 2 files, 19 passed; `pnpm test:db:postgres\|mysql\|mariadb -- <both files>` → 19 passed on each |
| 3 | Token hashes unique; links unique per provider by account, `user_name` and `external_id`, byte for byte; null external ids don't collide; another provider may link the same account | no | confirmed | "links an account once per provider…" passes on all 4 (`ånn@`/`e-1` accepted; `exactString` at `0028_scim.ts:77-80`) |
| 4 | Deleting a provider removes its tokens, links and groups and keeps the accounts; deleting a user removes its links and memberships | no | confirmed | The last migration test, on all 4 |
| 5 | The tables support DELETE tombstones and SCIM ids, a tombstone counting in no `uniqueness` check | no | partly | `scim_users.id`, `deleted_at` exist (`0028_scim.ts:64,85`), but no test uses a tombstone, and `(provider_id,user_name)`/`(provider_id,external_id)` (`:86-88`) include tombstoned rows |
| 6 | `scim_` + 32 random bytes base64url (48 characters), shown once, only its SHA-256 stored, with date and creator | no | confirmed | `models/scim-token.ts:25-30`; "only its hash is stored"; mutation M2 (store the plain token) → 7 tests fail |
| 7 | One token per provider; create and rotate refused while SCIM is off | no | confirmed | `services/scim-tokens.ts:113-115,141-144`; the `ScimTokenExistsError`, `ScimOffError`, `NoScimTokenError` tests pass |
| 8 | Rotation: the old token works exactly 24 hours, the new one at once; a second rotation within the 24 hours ends the earlier one, so at most two work | no | confirmed | 24h−1 ms works, 24h `expired`. M1 (no expiry), M8 (`>` → `>=`), M5 (don't revoke earlier ones) each fail a test. Probe: 3 concurrent creates → 1 succeeds; 4 concurrent rotates → exactly 2 working, 1 current, on all 4 |
| 9 | Revoke stops every token at once, the one in its overlap too; a new one can be made after | no | confirmed | `{revoked: 2}`, both `revoked`; M4 (revoke only the current) → 2 tests fail |
| 10 | A bad, revoked, rotated-out or other provider's token is refused; SCIM off refuses every token; on again restores the kept one | no | confirmed | `checkScimToken` (`scim-tokens.ts:209-222`); M6 (drop the scim_off check) → a test fails. Probe: a deleted provider's token → `unknown`; 43×`é`, trailing `\n`, 100k characters → `format` (all 4) |
| 11 | `last_used_at` recorded, at most once a minute | no | confirmed | 30 s no write, 61 s write; M3 (cutoff = now) → the test fails |
| 12 | The five `instance.scim_*` events with actor and IP, a summary each, root only | no | confirmed | `audit-event.ts`, `summary.ts`; `summary.test.ts` → 5 passed; `tsc --noEmit` → 0; `ForbiddenError` for a global admin and for no user |
| 13 | No plain token in the database, the audit rows or a log line | no | confirmed | `audit_log` JSON has neither token nor hash; stdout/stderr captured at debug/json. M7 (token in metadata), M10 (hash in metadata) → "audits … never the token" fails; M9 (`logger.warn` with the token) → "is never in a log line" fails |

**Overall:** not met: tokens, the overlap, revoke, audit and no-plaintext hold on all four databases and their tests catch the mutations, but tombstones have no test and their unique constraints count them (row 5).

Witnessed: 2026-10-18 03:35 EDT, by a fresh agent (adversarial). Commit: cbbc6d6d + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration 0028 is registered and runs on all four dialects, with its foreign keys and cascades | no | confirmed | `migrations/index.ts:63`; `0028_scim`, `scim-tokens` and `backup/restore` db tests → SQLite 33 passed, 1 skipped; PostgreSQL, MySQL, MariaDB 34/34 each |
| 2 | Live links unique per provider by user, `userName`, `externalId`, byte for byte; null external ids don't collide; another provider may reuse them | no | confirmed | `0028_scim.ts:86-88`, `exactString`; `ånn@`/`e-1` on MySQL 8.4 and MariaDB; an emoji `user_name` round-trips on all four |
| 3 | The schema supports tombstones that stop counting once the service replaces them | no | confirmed | Probe: a second row next to a tombstone is refused on all 4, so the service must replace it; deleting the tombstone and inserting a new link in one transaction works on all 4. No test in the task covers tombstones |
| 4 | Timestamp columns, and only those, end in `_at` | no | confirmed | `restore.db.test.ts` "keeps the naming restore relies on" passes on PostgreSQL, MySQL, MariaDB |
| 5 | `scim_` + 32 random bytes base64url, returned only by create and rotate | no | confirmed | `scim-token.ts:24-25`; the test's regex; `ScimTokenSummary` has no token field |
| 6 | Only the SHA-256 hash stored, with date and creator | no | confirmed | "only its hash is stored"; M4 (`tokenHash: token`) → 6 tests fail |
| 7 | Rotation keeps the old token exactly 24 hours, then `expired`; the new one works at once | no | confirmed | +24h−1 ms works, +24h `expired`; M3 (`>=` in `scimTokenWorks`), M3b (`>=` in `listWorking`) each fail it; a .123 ms clock on MySQL `datetime(3)` holds on all 4 |
| 8 | A second rotation within the overlap ends the earlier one | no | confirmed | "ends the one before at once…"; M2 (skip `repo.revoke`) → fails |
| 9 | Revoke stops every token, the one in its overlap too, as `revoked` | no | confirmed | `{ revoked: 2 }`; M8 (revoke only the current) → 2 tests fail |
| 10 | SCIM off refuses every token and keeps it; nothing made or rotated while off | no | confirmed | M9 (drop the `scimEnabledAt` check) → a test fails |
| 11 | Last used recorded, at most once a minute | no | confirmed | M7 (no throttle) → the test fails |
| 12 | A deleted provider's token no longer works | no | confirmed | Probe → `{ok:false, reason:"unknown"}` after `DELETE identity_providers`, on all 4 |
| 13 | The five audit events in the same transaction, without the token or its hash, with summaries | no | confirmed | "audits each change…"; `summary.test.ts` → 17 passed; `tsc --noEmit -p apps/web` → 0 |
| 14 | The plain token is in no log line | no | confirmed | A `logger.info` with the token in free text → the test fails. `log/redact.ts:52` redacts `rmk_` runs in free text but has no `scim_` pattern |
| 15 | Only root manages SCIM; an unknown provider is refused | no | confirmed | "is root's alone, and needs a provider" |
| 16 | Concurrent create, rotate and revoke for one provider can't interleave, and tests cover the lock on all dialects | no | partly | Behaviour holds (probe with slowed reads: 3 creates → 1 ok; 3 rotations → 1 current + 1 overlap; rotate racing revoke → 0 working; all 4). But M1 (remove `forUpdate` in `lockProvider`) on PostgreSQL leaves the task's 12 tests green |

**Overall:** not met: tables, hashing, overlap, revoke, audit and logging hold and their tests catch each mutation, but no test covers the provider lock (row 16).

### Re-check 1 (blind: row 5, plus what the diff touches)

Witnessed: 2026-10-18 10:46 EDT, by a fresh agent (blind). Commit: cbbc6d6d + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | The migration's and the service's tests pass on SQLite, PostgreSQL, MySQL and MariaDB | no | confirmed | vitest `--project db` on both files → 22 passed; `pnpm test:db:postgres\|mysql\|mariadb -- <both files>` → 22 passed on each |
| 5 | The tables support tombstones and SCIM ids; a tombstone keeps only its `external_id`, so its email counts in no uniqueness check | yes | confirmed | `0028_scim.ts`: `user_name` nullable `exactString(255)`, "Null on a tombstone"; "lets a tombstone hold only its external id…" passes on all 4. M11 (`user_name` notNull) → it fails; M12 (drop `scim_users_provider_external_id_uq`) → it and "links an account once per provider…" fail. Probe: two tombstones with null `user_name` insert on all 4 |
| 14 | `ScimUserTable` matches the migration | yes | confirmed | `schema.ts:228-243` = `0028_scim.ts:64-88`; the tombstone test writes `user_name: null` through typed Kysely |
| 15 | The provider lock makes concurrent creates and rotates safe, and "two changes at once" proves it | yes | confirmed | `scim-tokens.db.test.ts:303-338`; M14 (`lockProvider` without `forUpdate`) → passes on SQLite (one writer at a time) but both tests fail on PostgreSQL; unmutated → 14 passed |
| 16 | `redactString` hides `scim_…` runs in free text | yes | confirmed | `log/redact.ts:54-55,259-264`; `redact.test.ts` → 43 passed; M13 (drop the replace) → "takes out every access token" fails |

**Overall:** met: tombstones hold only `external_id` with a test that fails without the change on all four databases, and the concurrency and redaction tests catch their mutations (the lock on a server).

The tombstone test's comment claimed two tombstones never collide, which only the witness's probe showed; the comment was narrowed (wording, no re-check).

### Re-check 1 (adversarial: row 16, plus what the diff touches)

Witnessed: 2026-10-18 10:44 EDT, by a fresh agent (adversarial). Commit: cbbc6d6d + working tree. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 16 | Every change locks the provider's row, and a test proves it | yes | confirmed | `run.sh base` → 22/22 on all four. `lockProvider` without `forUpdate` → both "two changes at once" tests fail on PostgreSQL, MySQL and MariaDB, twice each (`length of 1 but got 3`, `length of 2 but got 4`). Unmutated, 3 runs × 4 dialects → 22/22 each. SQLite can't tell (writes serialised) |
| 17 | `redactString` hides a `scim_…` token in free text | yes | confirmed | Probe (300 tokens × 11 shapes through `cleanFields`, `errorFields`, `redactString`): no leak in an `authorization` header, an `x-scim` header, a field, an `Error` message and stack, glued text, JSON, a URL query, CRLF, URL-encoded, an object key. Only an uppercase `SCIM_…` passes, which `generateScimToken` never makes. The replace as a no-op → `redact.test.ts` fails |
| 18 | The SCIM regex can't be made slow (`docs/knowledge/codeql-regex.md`) | yes | confirmed | `redact.ts:55` `/scim_[A-Za-z0-9_-]{43,}/g`, the `rmk_` shape: one class, a lower bound, nothing nested or anchored; 65,000-character adversarial inputs → 0–1 ms |
| 19 | `user_name` nullable and cleared on a tombstone; the email is free, the external id held | yes | confirmed | `0028_scim.ts:82`; `0028_scim.db.test.ts:185` on all four; `notNull()` → it fails on SQLite and PostgreSQL |
| 20 | Nothing accepts a null `user_name` on a live link | no | confirmed | No task 2 code writes `scim_users` (`grep -rln scim_users apps/web/src` → schema, migration, its test). The database itself accepts it (probe: two live links with null `user_name` on all four), so task 4's repository must refuse it |

**Overall:** met: the lock is proven on all three servers without flakes, SCIM tokens are redacted with a fast regex, and the tombstone clears `user_name`; a live link without `user_name` is task 4's to refuse.

## Task 3 — The guard and the routes' frame

Witnessed: 2026-10-18 11:09 EDT, by a fresh agent (blind). Commit: ad04c062 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `/api/v1/scim/v2/[...path]` sends GET, POST, PUT, PATCH and DELETE through `apiRoute` to one dispatcher, after the setup check | yes | confirmed | `route.ts` exports all five as `apiRoute("/api/v1/scim/v2/[...path]", …handleScim)`; `api-route.test.ts route-segments.test.ts` → 37 passed. Not run through a live Next server |
| 2 | Discovery is public and correct (ServiceProviderConfig, ResourceTypes, Schemas, each by id, GET only) | yes | confirmed | "discovery" tests with no token and a bad one, no audit row; mutation `disc-405` → "only answers GET" fails |
| 3 | No header, another scheme, an `rmk_` token, an unknown token and a SCIM-off provider's token get the same 401, SCIM body, `WWW-Authenticate: Bearer`, one detail | yes | confirmed | "refuses every bad token the same way"; mutations `no-challenge`, `no-scim-off` fail it |
| 4 | A revoked token and a rotated-out one get 401; the rotated one works right after rotation | yes | confirmed | "refuses a revoked token, and a rotated one…"; mutations `no-revoked`, `no-expiry` fail it; the boundary checked at exactly +24 h |
| 5 | Another provider's token gets 401 | no | can't check here | The guard passes `caller.providerId` on; another provider's working token meets no resource until tasks 4 and 5 |
| 6 | `scim.request_refused { reason }` (audit and log) with the provider when the token was found | yes | confirmed | `actions/scim.ts` `refuse()`; tests expect `scim_off`/`other`, `expired` and `revoked`/`acme`; `log/events.ts`, `audit-event.ts`, `summary.ts` |
| 7 | 600 a minute per token; 20 refusals a minute per trusted address; 100 for the instance without one; 429 with `Retry-After`; no audit past the limit | yes | confirmed | Three limit tests; mutations `no-token-limit`, `no-refusal-limit`, `no-shared-limit`, `audit-past-limit` each fail theirs |
| 8 | Cookies are ignored | no | confirmed | `bearer()` reads only `authorization`; mutation `cookie-lets-in` → "ignores cookies" fails |
| 9 | Unknown path 404, wrong method 405 with `Allow`, both before a token; `Bulk`/`Me` 501; `no-store` everywhere | no | confirmed | "paths and methods"; mutations `no-405`, `case-404`, `no-store` fail tests. The setup 503 and `apiRoute`'s 500 come back in the API's shape, not SCIM's |
| 10 | No SCIM token in an audit row or a log line | yes | confirmed | "never writes a token…" at debug/JSON; mutation `token-in-audit` → it fails |
| 11 | `scim`, `v2`, `[...path]` are route segments, and the privacy scenario sends a SCIM token and a filter email without leaking them | yes | partly | `privacy.db.test.ts` passes on SQLite and PostgreSQL; on MySQL and MariaDB `Incorrect datetime value` at `privacy-scenario.ts:317` (the provider insert's ISO string) |
| 12 | The task's tests pass on SQLite, PostgreSQL, MySQL and MariaDB | no | partly | 30 passed on SQLite and PostgreSQL; on MySQL and MariaDB 29 passed, `privacy.db.test.ts` failed (row 11) |
| 13 | The touched files pass lint | no | not met | `biome check …/actions/scim.ts` → "Formatter would have printed the following content" |

**Overall:** not met: the guard, formats and discovery hold with tests that mutations break, but the privacy scenario fails on MySQL and MariaDB, `actions/scim.ts` isn't formatted, and the other-provider case waits for tasks 4 and 5.

Fixed since: the scenario's dates go through `toDbDate` (`pnpm test:db:mysql|mariadb -- src/server/telemetry/privacy.db.test.ts` → 1 passed each); `actions/scim.ts` formatted (`pnpm lint` → no error); the setup check answers 503 in SCIM's format; the `SSO_REASONS` comment back above its constant; tasks 4's and 5's *Done when* now name another provider's token (row 5).

Witnessed: 2026-10-18 11:09 EDT, by a fresh agent (adversarial). Commit: ad04c062 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | One route sends every method to one handler through `apiRoute`, outside `/api/v1`'s bearer guard and the proxy | yes | confirmed | `route.ts:8-14` never calls `requireToken`; `proxy.ts`'s matcher skips `api/`; `api-route.test.ts` passed |
| 2 | Only `Authorization: Bearer scim_…`, found by its hash | yes | confirmed | Probe: `bearer`/`BEARER`/extra spaces/trailing `\n` → 204; a tab, the token uppercased or twice, two headers, a 100 KB value → 401; `scim-tokens.ts:206` |
| 3 | Every refusal is the same 401 in SCIM format with `WWW-Authenticate: Bearer` | yes | confirmed | 29/29 on all four databases; a deleted provider's token → 401 `{reason:"unknown"}`; mutations M1, M4, M6, M11 each fail the suite |
| 4 | Cookies and the query string never authenticate | yes | confirmed | Probe: `?access_token=<good>` → 401; cookies with the token → 401 |
| 5 | The reason is audited and logged as `scim.request_refused`, with the provider when found | yes | confirmed | The test's five refusals; `events.ts` |
| 6 | The new audit action fits the audit log's model, and the existing suites stay green | no | not met | `audit-event.test.ts` "cover every action" fails: `scim.request_refused` is in no `AUDIT_ACTION_GROUPS` (`audit-event.ts:93-104`), so `pnpm test` is red and Admin › Audit can't filter it |
| 7 | 600 a minute per token, then 429 with `Retry-After` | yes | confirmed | The 601st → 429, `retry-after: 60`; M7 (6000) fails it |
| 8 | 20 refusals a minute per trusted address, 100 without one; 429 past it, not audited | yes | confirmed | Probe: 42 audit rows for 47 refusals over the limits; 30 s later still 429, `retry-after: 30`; M2, M9, M13 each fail the suite |
| 9 | A working token and discovery aren't held up by an address's refusal limit | no | confirmed | Probe: the limited address's good token → 204, `/ServiceProviderConfig` → 200, no header → 429 |
| 10 | `no-store` everywhere; unknown path 404, wrong method 405 with `Allow`, before a token; `Bulk`/`Me` 501 | yes | partly | Holds through `handleScim` (M5, M14 fail the suite), but `route.ts` doesn't export OPTIONS, so Next answers it itself (`auto-implement-methods.js:66-70`): 204, its own `Allow`, no body, no `no-store`, on any path (read from Next's source) |
| 11 | Path tricks don't get past routing | no | confirmed | `/Users%2Fabc`, a bad escape, `/USERS`, `/Users%00`, `/ResourceTypes/User/x` → 404. `segmentsOf` matches `startsWith(SCIM_PATH)` with no `/` boundary (`/api/v1/scim/v2Users` → Users when called directly; Next doesn't route it here) |
| 12 | `ServiceProviderConfig`'s values, public | yes | confirmed | `toMatchObject` on each; a bad token → 200, no refusal; RFC 7643 §5's fields (`scim-discovery.ts:12-30`); M12 fails 3 tests |
| 13 | `ResourceTypes` and `Schemas` describe User and Group, listed and by id | yes | confirmed | The tests; the encoded Group URN → 200; the RFC 7643 §6-7 shape (`scim-discovery.ts:31-155`) |
| 14 | No SCIM token in a log line or audit row | yes | confirmed | "never writes a token…"; M10 fails 3 tests |
| 15 | Telemetry segments and the privacy scenario | yes | confirmed | `privacy.db.test.ts`, `no-secrets.db.test.ts` → 2 passed; removing `[...path]` fails `route-segments.test.ts`; two tries to put the token in a span attribute were stripped by the sanitiser |
| 16 | The refusal reads well in Admin › Audit | yes | confirmed | `summary.test.ts` passes; the `SSO_REASONS` comment sat above `SCIM_REFUSALS` |

**Overall:** not met: the guard, the limits, the format and discovery hold under every attempt and mutation, but `scim.request_refused` is in no audit action group (the existing suite fails), and OPTIONS gets Next's own 204.

Fixed since: a `scim` group in `AUDIT_ACTION_GROUPS` (`vitest run src/server/domains/audit src/features/admin-audit src/server/http/api-route.test.ts` → 70 passed); the route exports `HEAD` and `OPTIONS` too, answered as SCIM 405s (a test); `segmentsOf` reads only `/api/v1/scim/v2` or below it (a test); the comment moved back (blind pass). Not changed: a request refused by the per-token limit still updates *last used* (the token is the provider's, and it was used).

### Re-check 1 (blind: rows 5, 11, 12, 13, plus what the diff touches)

Witnessed: 2026-10-18 11:16 EDT, by a fresh agent (blind). Commit: ad04c062 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | The guard passes each token on as its own provider, never another; one provider's SCIM off leaves the other's working; the 401 at another provider's resources is in tasks 4's and 5's *Done when* | no | confirmed | "passes each provider's token on as that provider, never another"; mutations `fixed-provider`, `other-as-acme` each fail it; PLAN.md tasks 4 and 5 |
| 11 | Route segments, and the privacy scenario without leaks | yes | confirmed | `toDbDate` in `privacy-scenario.ts`; `pnpm test:db:mysql` and `:mariadb -- … privacy.db.test.ts` → passed |
| 12 | The task's tests pass on all four databases | no | confirmed | `scim-api.db.test.ts privacy.db.test.ts` → 19 passed on SQLite, PostgreSQL, MySQL, MariaDB |
| 13 | The touched files pass lint | no | confirmed | `pnpm lint` → 0 errors; `biome check` on 37 touched files → nothing |
| 14 | `segmentsOf` reads only `/api/v1/scim/v2` or below | no | confirmed | "reads only paths under the base…" → 404; `no-boundary` fails it |
| 15 | `scim.request_refused` is in a `scim` audit group | no | confirmed | `audit-event.ts:104`; audit, admin-audit, api-route and telemetry tests → 106 passed; removing `"scim"` fails "cover every action…" |
| 16 | The route answers not-set-up as a SCIM 503 and exports HEAD and OPTIONS; tests cover it | no | partly | A probe with mocked setup → all seven exports, 503 `application/scim+json`, `no-store`; but no test imports `route.ts`, so removing either fails nothing, and the "(the route exports both)" test name says more than it checks |

**Overall:** not met: rows 5, 11, 12 and 13 hold with tests mutations break, but the route-level 503 and HEAD/OPTIONS exports have no test.

Fixed since: `app/api/v1/scim/v2/[...path]/route.test.ts` (2 tests: every export dispatches, and each answers a SCIM 503 before setup) → 2 passed; the dispatcher test renamed "answers HEAD and OPTIONS as SCIM 405s".

### Re-check 1 (adversarial: rows 6, 10, 11, plus what the diff touches)

Witnessed: 2026-10-18 11:16 EDT, by a fresh agent (adversarial). Commit: ad04c062 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | `scim.request_refused` is in an audit group, and the existing suites pass | yes | confirmed | `audit-event.ts:104`; http, audit, admin-audit, api and route-segment tests → 294 passed; M18 (drop `"scim"`) fails "cover every action…" |
| 6a | Admin › Audit's filter handles the `scim` group | no | confirmed | `list.ts:66` builds the options from `AUDIT_ACTION_GROUPS`; `groupOf` and `kysely-audit-repository.ts:73` filter by `actionsInGroup("scim")`. The `instance.scim_token_*` events stay under `instance` |
| 6b | The refusal's summary names the reason and the provider | no | confirmed | `SCIM_REFUSALS` covers all six; no test checks the text (M20, dropping the provider → 88 passed) |
| 10 | `no-store` everywhere; 405 with `Allow`; Next doesn't answer for the route | yes | partly | OPTIONS is now a SCIM 405, but HEAD regressed: Next used to run GET for it (`auto-implement-methods.js:39-44`); now it reaches the dispatcher and gets 405 `Allow: GET` where GET works (`scim-api.db.test.ts:321-326` asserts it). No test goes through `route.ts` (M16 → 88 passed) |
| 10a | Exporting HEAD/OPTIONS keeps the `apiRoute` guard test green | no | confirmed | `api-route.test.ts:169`, `:187` |
| 10b | A not-set-up instance gets a 503 in SCIM's format | yes | partly | `route.ts:10-11`; no test (M17 → 88 passed) |
| 11 | `segmentsOf` reads only `/api/v1/scim/v2` or below | yes | confirmed | `scim-api.ts:47`; M15 fails "reads only paths under the base…" |
| 5 | Each provider's token reaches the resources as its own provider | yes | confirmed | M19 (hard-code `"acme"`) fails it |
| 15 | The privacy scenario and SCIM tests pass on MySQL and MariaDB | yes | confirmed | `pnpm test:db:mysql|mariadb -- …privacy.db.test.ts …scim-api.db.test.ts` → 19 passed each |
| 3-14 | Earlier rows still hold | no | confirmed | `mutate.py` M1-M14 on the resynced copy: each fails at least one test |

**Overall:** not met: rows 6 and 11 fixed and every guard mutation still caught, but HEAD is now refused where GET works, and the route file has no test.

Fixed since: the route no longer exports `HEAD` (Next answers it from `GET` again) and keeps `OPTIONS`; `route.test.ts` checks the exports (HEAD absent) and the SCIM 503 before setup; the dispatcher test covers OPTIONS only; `summary.test.ts` checks the refusal's text with and without a provider (→ 44 passed with the route and api-route tests).

### Re-check 2 (blind: row 16, plus what the diff touches)

Witnessed: 2026-10-18 11:20 EDT, by a fresh agent (blind). Commit: ad04c062 + working tree. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 16 | The route answers not-set-up as a SCIM 503 and exports OPTIONS, not HEAD; tests cover it | yes | confirmed | `route.test.ts api-route.test.ts summary.test.ts` → 44 passed. M1 (drop `OPTIONS`) → 2 failed; M2 (a bare 503) → 1 failed (`expected null to be 'application/scim+json'`); M3 (re-add `HEAD`) → 1 failed; `route.ts` restored |
| 16a | With HEAD not exported, Next answers HEAD by running GET | yes | confirmed | `next/…/auto-implement-methods.js:39-44` `methods.HEAD = handlers.GET`; read, not run against a live server |
| 16b | The dispatcher's tests still pass | yes | confirmed | `scim-api.db.test.ts` → 18 passed |
| 16c | Admin › Audit shows the refusal reason and the provider | yes | confirmed | `summary.test.ts`: "Refused a SCIM request: a revoked token (acme)", "…: no bearer token" |

**Overall:** met: `route.test.ts` checks the exports and the SCIM 503 before setup, and each route mutation fails it.

### Re-check 2 (adversarial: rows 6b, 10, 10b, plus what the diff touches)

Witnessed: 2026-10-18 11:20 EDT, by a fresh agent (adversarial). Commit: ad04c062 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6b | The refusal's summary names the reason and the provider | yes | confirmed | `summary.test.ts` (revoked + acme; missing); M20 fails it; the other four texts read at `summary.ts:97-104` |
| 10 | HEAD works wherever GET does, because Next runs GET for it | yes | not met | Next sets `methods.HEAD = handlers.GET` but passes the original request (`module.js:539`), so `request.method` is `"HEAD"` and the dispatcher refuses it (`scim-api.ts:87`, `:95-96`). Probe: `HEAD /ServiceProviderConfig` → 405 `Allow: GET` (GET → 200); `HEAD /Users` with a token → 405 |
| 10c | OPTIONS answers a SCIM 405 with a correct `Allow`, acceptable under RFC 9110 | yes | confirmed | §9.1 requires only GET and HEAD; §15.5.6's `Allow`; probe `OPTIONS /Users` → 405 `Allow: GET, POST`, SCIM, `no-store`. `Allow` never lists HEAD, which matches only because of row 10 |
| 10a | The route exports exactly DELETE, GET, OPTIONS, PATCH, POST, PUT, pinned by a test | yes | confirmed | `route.test.ts`; M16 (drop OPTIONS), M16b (add HEAD) fail it |
| 10b | A not-set-up instance gets a SCIM 503, never cached, for every method | yes | confirmed | `route.test.ts`; M17 (plain 503), M17b (no setup check) fail it |
| 11 | `segmentsOf` reads only `/api/v1/scim/v2` or below | no | confirmed | M15 fails its test |
| 6 | `scim.request_refused` in the `scim` group | no | confirmed | M18 fails "cover every action…" |
| 5 | Each provider's token reaches resources as its own provider | no | confirmed | M19 fails its test |
| 12 | The task's tests pass after the resync | no | confirmed | 8 files, 91 passed on SQLite |

**Overall:** not met: the route's exports, its 503 and the refusal text are tested, but HEAD is refused with 405 wherever GET works, because Next calls GET's handler with `method: "HEAD"`.

Fixed since: `handleScim` treats `HEAD` as `GET` (handlers receive `method`, never `HEAD`) and lists `HEAD` in every `Allow` with `GET`; a test sends HEAD as Next does to discovery (200), Users and Groups (reached as `GET`) and without a token (401) → `scim-api.db.test.ts` 19 passed; the route test's name says only what it checks.

### Re-check 3 (blind: HEAD, plus what the diff touches)

Witnessed: 2026-10-18 11:26 EDT, by a fresh agent (blind). Commit: ad04c062 + working tree. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

The owner allowed this third round, scoped to HEAD.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | HEAD is handled as GET: discovery answers 200 on HEAD with no token | no | confirmed | `scim-api.ts:92` maps HEAD to GET; test `scim-api.db.test.ts:327-331` → 200 `application/scim+json` for `/ServiceProviderConfig` and `/Schemas` |
| 2 | HEAD on Users and Groups reaches the handler as GET | no | confirmed | `scim-api.ts:115`; `reached` = `[["Users","GET"],["Groups","GET"]]`; mutation `method: request.method` → the test fails |
| 3 | HEAD on Users and Groups stays behind the guard | no | confirmed | The method check (`:107`) before `authenticateScim` (`:109`); HEAD `/Users` without a token → SCIM 401 |
| 4 | Every `Allow` with GET also lists HEAD | no | confirmed | `"GET, HEAD"`, `"GET, HEAD, POST"`, `"DELETE, GET, HEAD, PATCH, PUT"` (tests `:202`, `:370`, `:373`); dropping HEAD from either fails a test |
| 5 | The tests fail without the HEAD mapping | no | confirmed | `mutate.sh` → "answers HEAD as GET…" fails, 1 failed / 18 passed |
| 6 | The task's tests pass on SQLite and PostgreSQL, and the route tests pass | no | confirmed | 19/19 on SQLite and `pnpm test:db:postgres`; the route tests → 43/43 with their neighbours |
| 7 | Next sends HEAD to GET's handler with the method still "HEAD" | no | can't check here | Not run against a live Next server; `route.ts:18` exports no HEAD; the handler tests simulate the request |

**Overall:** not met: rows 1-6 hold; row 7, how Next itself sends HEAD, wasn't run against a live server.

### Re-check 3 (adversarial: row 10, plus what the diff touches)

Witnessed: 2026-10-18 11:24 EDT, by a fresh agent (adversarial). Commit: ad04c062 + working tree. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | HEAD is answered wherever GET is (as Next sends it), stays behind the guard, and every `Allow` with GET lists HEAD | yes | confirmed | Probe `PROBE3` → HEAD `/ServiceProviderConfig` 200, `/ResourceTypes/User` 200, `/Schemas/nope` 404, `/Users` and `/Users/abc` with a token 204, handlers got `GET` every time; HEAD `/Users` without a token → 401 `Bearer`; `/Users/a/b` 404, `/Bulk` 501. `Allow`: `GET, HEAD`; `GET, HEAD, POST`; `DELETE, GET, HEAD, PATCH, PUT`. `route.ts:18` exports no HEAD. Dropping the mapping, or HEAD from `Allow`, each fails a test; 19/19 restored |

**Overall:** met: HEAD behaves like GET on every path and stays guarded, every `Allow` lists HEAD next to GET, OPTIONS gets a SCIM 405 with the right `Allow`, and removing either part of the fix fails a test.

The OPTIONS test doesn't assert its `Allow` header (the probe showed it right); the 405 comes before the token check, so a caller learns the methods, which is deliberate.

### Re-check 4 (blind: row 7, against the running server)

Witnessed: 2026-10-18 11:27 EDT, by the same fresh agent (blind), continued. Commit: ad04c062 + working tree. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

Against the Next dev server already running at http://localhost:3000 (pid 51519, `next-server (v16.4.0)`; requests only, nothing started or stopped).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | Next sends a HEAD request to GET's handler with the method still "HEAD", and the route answers it as GET | no | confirmed | `curl -I …/ServiceProviderConfig` → 200, `application/scim+json`, no body; `curl -I …/Users` (no token) → 401 `www-authenticate: Bearer`, the same as GET; `curl -X OPTIONS …/Users` → 405 `allow: GET, HEAD, POST`; `curl -I …/Nope` → 404 `application/scim+json`. `route.ts:18` exports no HEAD, so this is Next's GET fallback carrying HEAD into `handleScim`, which maps it (`scim-api.ts:92`) |

**Overall:** met: rows 1-7 all hold.

## Task 4 — Users

Witnessed: 2026-10-18 11:50 EDT, by a fresh agent (blind). Commit: b0b870aa + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `POST /Users` creates through the Create user service: `user` in `global`, personal workspace, no password, `user.created { via: "scim", provider }` | yes | confirmed | `scim-users-api.db.test.ts` → 24 passed; "makes an account from Entra's body" asserts each; `kysely-scim-user-repository.ts:217` → `createUserWithoutPassword` |
| 2 | Entra's and Okta's bodies are taken (extension, `roles`, `password`, `groups` ignored); the same request twice is 409 on `userName` and on `externalId` | yes | confirmed | `.db.test.ts:164,210,217`; `scim-user.test.ts` → 15 passed |
| 3 | `active: false` on create (`"False"` too) makes a disabled account, with `user.disabled { via, sessionsEnded, tokensRevoked }` | yes | confirmed | `.db.test.ts:232`; M5 (tokens not revoked) → 2 tests fail |
| 4 | A non-ASCII `userName` is 400 `invalidValue` on create and PATCH | yes | confirmed | `:242`, `:602`; M3 (drop the check) → 2 tests fail; `scim-user.ts:62-73` |
| 5 | Every match lowercases the address byte for byte | yes | confirmed | M6 (keep raw case) → 11 tests fail |
| 6 | Another account's email is 409; a root's is 403, audited `scim.request_refused { reason: "root" }` after the rollback | yes | confirmed | `:261`; `scim-users.ts:60-76` writes the event outside the transaction |
| 7 | Adoption only on every condition (exact email, 106 row, sign-in within 30 days, no SCIM link anywhere, enabled, not root); 106's link kept; `user.scim_adopted`; `active: false` disables | yes | confirmed | `:314,345,363,378,426`; M1 (window ignored) → "older than 30 days…" fails; `scim-users.ts:156-166` |
| 8 | GET one; the list paged (100 max), creation then id order; `eq` on `userName` (lowercased; non-ASCII matches nothing), `externalId`, `id`; others 400 `invalidFilter` | yes | confirmed | `:440,466`; `scim-user.ts:245-273`; `scim-users.ts:208-215` |
| 9 | Another provider's token never reaches this provider's users | yes | confirmed | `:507`; every lookup through `live(providerId)` (`kysely-scim-user-repository.ts:38-43`) |
| 10 | PATCH's path form (Entra) and value-object form (Okta); PUT replaces every managed field | yes | confirmed | `:542,574`; unit tests `scim-user.test.ts:145,166,192,213` |
| 11 | PUT/PATCH of `userName` or `emails[…].value` is lowercased and 409 against another account's email | yes | partly | Holds (`:602`; probe P1 with a manual account → 409 on SQLite and MySQL), but the suite's 409 comes from a same-provider link: M4 (remove `owner.id !== account.id` at `scim-users.ts:258`) → 24 passed |
| 12 | After root's hand edits, the provider's update puts email and name back | yes | confirmed | `:633`; `scim-users.ts:283-293` |
| 13 | A root is 403 on DELETE/PATCH/PUT and audited; the last enabled root too, staying enabled | yes | confirmed | `:649`; M7 (remove the root check) → it fails; probe P2 (Ann the only enabled root) → 403 ×3, `disabled_at` null. The suite's last-root case is only the create at `:261` |
| 14 | Deprovisioning goes through `disableAccount` in one transaction | yes | confirmed | `:680` (a token revoked); probe P3 (a `session` row gone); `scim-users.ts:56-66,93`; `user-admin.ts:107-119` |
| 15 | After DELETE the id is 404 everywhere, out of lists and filters, in no uniqueness check; the tombstone keeps only `externalId` | yes | confirmed | `:680`; probe P3 repeated DELETE → 404 |
| 16 | A create with this provider's tombstone `externalId` relinks with a new id; `active: false` keeps it disabled; another `externalId` or none → 409; another provider's tombstone never matches | yes | confirmed | `:733,761,771`; M2 (tombstone lookup without the provider) → a test fails |
| 17 | Reactivation clears `disabled_at`, writes `user.enabled`, creates no session | yes | confirmed | `:542`; probe P3 → `session` empty |
| 18 | The db tests pass on all four databases | yes | confirmed | `pnpm test:db:postgres\|mysql\|mariadb -- <2 files>` → 43 passed each |
| 19 | The new audit actions and summaries; types and lint hold | yes | confirmed | `audit-event.ts:43-44`; `summary.ts:71-76,109,226-238`; admin-audit → 18 passed; typecheck and lint exit 0 |
| 20 | Transactions: every write is one transaction with the user rows locked in id order (spec) | yes | partly | The code locks the provider's row only (`kysely-scim-user-repository.ts:51-57`, `scim-users.ts:63`); SPEC.md:134-136 still says user rows in id order |
| 21 | MySQL look-alike: `kåte@` for `kate@` is another account's, never adopted | yes | confirmed | Probe P5 on MySQL; `scim-users.ts:135` |

**Overall:** not met: the other-account 409 on PUT/PATCH is pinned only through a same-provider link (row 11), and the spec's lock rule doesn't match the provider-row lock the code takes (row 20).

Fixed since: a test takes a manual account's email through PATCH and PUT (409, both accounts untouched), and one disables the last enabled root through DELETE, PATCH and PUT (403, still enabled); SPEC's *Transactions* now says the provider's row is locked, the same lock 106's sign-in takes, so a change racing a sign-in runs after it.

Witnessed: 2026-10-18 11:52 EDT, by a fresh agent (adversarial). Commit: b0b870aa + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Entra's and Okta's creates make a `user` in `global` with a personal workspace, no password; `active: false` (boolean or `"False"`) makes a disabled account | yes | confirmed | 24 passed on SQLite, PostgreSQL 15, MySQL 8.4, MariaDB 10.11; M12 (ignore `active: false`) → 1 fails |
| 2 | 409 `uniqueness` on a live link's `userName`/`externalId` and on any other account's email | yes | confirmed | `:217,261`; M14 → 6 fail. Probe N: 3 concurrent identical creates on one provider → `[201, 409, 409]` on the three servers |
| 3 | A non-ASCII `userName` is 400; `userName`/`emails` lowercased on create, PUT, PATCH and in the filter | yes | confirmed | M11 → 16 fail; M7 → 3 fail. Probe K: the Kelvin sign through PATCH `emails`, the value-object form and PUT → 400, email unchanged; in a filter → 0; `"\r\n Carl@Example.com \r\n"` → `carl@example.com` |
| 4 | PUT/PATCH of `userName`/`emails` to another account's email is 409 | yes | partly | Holds (probe O: a plain account's email, and root's → 409 on all four), but the only test uses a same-provider link: M15 (drop `owner.id !== account.id`) → 24 passed |
| 5 | Adoption only on every condition; `user.scim_adopted`; 106's link untouched | yes | confirmed | `:314-437`; M1, M2, M3 each kill a test. Probe J: exactly 30 days → adopted; another provider's event → 409; `sso.ts:331-332` writes the event as the lookup reads it |
| 6 | Adoption never enables; `active: false` adopts and disables | yes | confirmed | `:363,426` on 4 databases |
| 7 | The list: creation order, `eq` on three attributes, others 400, 100 max | yes | confirmed | Probe H: `or`, `co`, `OR 1=1 --` → 400; `%` wildcards → 0 (parameters) |
| 8 | `startIndex`/`count` edge values never break the request | yes | partly | `startIndex=1e21` or `99999999999999999999` → **500** on all four (SQLite `datatype mismatch`, PostgreSQL bigint out of range, MySQL/MariaDB syntax error): `integer()` takes any `Number.isInteger`, unsafe ones included |
| 9 | Another provider's token never reaches this provider's users | yes | confirmed | `:507-539` on 4 databases |
| 10 | PATCH path and value-object forms, string booleans, `remove`; PUT a full replace | yes | confirmed | Probe E: PUT with only `userName` drops `externalId` (free again) and the name falls back to the email; probe F: hand-disabled account, PATCH `"False"` → no event, `"True"` → one `user.enabled`; probe D: 150-char names cut to 100 |
| 11 | DELETE and `active: false` go through the shared Disable user steps in one transaction; root's service unchanged | yes | confirmed | Probe G: sessions gone; probe L: a throw after the disable rolls back `disabled_at`, the token, the tombstone and the event; M9 → 2 fail; `user-admin.db.test.ts` → 25 passed. The write locks the provider row, not the user's (the spec names user rows) |
| 12 | After DELETE: 404 everywhere, out of lists, in no uniqueness check; the tombstone keeps only `externalId` | yes | confirmed | `:680-731`; M8 → 3 fail |
| 13 | Relink by this provider's tombstone `externalId`, new id, `active` honoured; another provider's never; other `externalId` → 409 | yes | confirmed | `:733,761,771`; M6, M13 each kill a test |
| 14 | Reactivation clears `disabled_at` and makes no session | yes | confirmed | Probe F; `kysely-identity-repository.ts:462-468` |
| 15 | A root is 403, audited after rollback | yes | confirmed | `:261,649`; M4, M16 → tests fail; admin-audit 35 passed |
| 16 | The last enabled root can't be disabled or changed, with a test | no | partly | Probe A (the SCIM account the only enabled root) → DELETE, PATCH, PUT 403, still enabled; no test in the suite |
| 17 | Two providers racing to create one email: one 201, the other 409 | no | partly | Probe N: one 201, the other an unhandled unique violation (500: `user_email_key` / `user.email`) on the three servers; the data is right (one account) |
| 18 | `externalId` of 1 and 255 characters (multibyte too) accepted and found; 256 is 400 | no | confirmed | Probe C on 4 databases |
| 19 | A MySQL look-alike email is never this person's | yes | confirmed | Probe M: MySQL → 409; SQLite and PostgreSQL → a separate account |
| 20 | The audit events name the provider with `via: "scim"` | yes | confirmed | `:164-208,314,680`; audit tests 35 passed |
| 21 | Tests pass on all four databases; Biome clean | yes | confirmed | 24/24 each; `biome check` → nothing |

**Overall:** not met: `startIndex=1e21` is a 500 everywhere (8); two providers racing for one email ends in a raw unique violation (17); the last root (16) and the PUT/PATCH 409 against a non-SCIM account's email (4) hold but had no test.

Fixed since: `startIndex` is clamped to 1…2³¹−1 and `count` to 0…100, so any integer is a safe offset (a test sends `1e21`, `99999999999999999999`, `-5`, `abc`, `0x10`); a unique violation inside a SCIM write answers 409 `uniqueness` (a test races two providers for one email: `[201, 409]`, one account); a write now locks the account's row after the provider's (`lockUser`), and SPEC's *Transactions* says so; the last-root and non-SCIM-email tests were added after the blind pass.

### Re-check 1 (blind: rows 11, 20, plus what the diff touches)

Witnessed: 2026-10-18 12:09 EDT, by a fresh agent (blind). Commit: b0b870aa + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 11 | PUT/PATCH of `userName` or `emails[…].value` to a non-SCIM account's email is 409 `uniqueness`, lowercased, both accounts untouched, with a test | no | confirmed | `scim-users-api.db.test.ts:651`; M4 alone (drop `owner.id !== account.id`) → 28 passed: the `user.email` unique index and the 409 mapping backstop it; M4+M8 (also drop the mapping) → the test fails |
| 20 | SPEC's *Transactions* matches the code: provider's row, then the account's, deadlocks retried, a unique violation → 409 | yes | confirmed | SPEC.md:134-139; `scim-users.ts:65,67,88,123,147,153`; `kysely-sso-repository.ts:67-68` takes the same provider lock |
| 22 | `lockUser` is `SELECT … FOR UPDATE` on the servers and a no-op on SQLite | yes | confirmed | `kysely-scim-user-repository.ts:61-66` through `forUpdate` (`db/locks.ts:9-12`); a compile probe → `for update` on postgres, mysql, mariadb, absent on sqlite. M10 (no-op) → 28 passed: no test can see a lock, as expected |
| 23 | Any `startIndex`/`count` is a 200; a huge index is an empty page | yes | confirmed | `:507`; `scim-users.ts:32,225-243`; M9 (no clamp) → it fails |
| 24 | Two providers creating one email at once: `[201, 409]`, one account | yes | confirmed | `:893`; M8 on PostgreSQL → it fails (on SQLite the writers serialise) |
| 25 | The last enabled root is 403 on DELETE, PATCH and PUT, stays enabled, with a test | no | confirmed | `:690`; M7 (drop the root check in `load()`) → it fails |
| 26 | The users suite passes on SQLite and PostgreSQL | no | confirmed | 28 passed on each |
| 27 | After `lockUser`, the state read is the state written against | yes | partly | True in `load()` and the tombstone path; in the create's adoption path `owner` is read at `:145`, locked at `:147`, and its pre-lock `disabledAt`, `role`, `name` drive the checks with no re-read (code reading, not raced) |

**Overall:** not met: rows 11 and 20 hold and every touched claim is pinned by a test, but the create path doesn't re-read the owner after locking it (27).

Fixed since: the create locks the account found by email and reads it again (`findUser`) before any check, as `load()` does; the adversarial pass's "Fixed since" wording corrected (clamped, not refused).

### Re-check 1 (adversarial: rows 4, 8, 16, 17, plus what the diff touches)

Witnessed: 2026-10-18 12:12 EDT, by a fresh agent (adversarial). Commit: b0b870aa + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | (row 4) PUT/PATCH of `userName` to a non-SCIM account's email is 409, both untouched, with a test | yes | confirmed | `:651`; M15 alone → 28 passed (the unique-violation catch gives the same 409); M15+M17 → it fails |
| 2 | (row 8) `startIndex`/`count` never 500: clamped to 1…2³¹−1 and 0…100 | yes | confirmed | Probe B on all four: `1e21`, `99999999999999999999` → 200, `startIndex: 2147483647`, 0 rows; odd values → 200. M18, M18b → `:507` fails |
| 3 | (row 16) The last enabled root can't be disabled by DELETE, PATCH or PUT, with a test | no | confirmed | `:690`; 28 passed on all four |
| 4 | (row 17) Two providers racing for one email: `[201, 409]`, one account, not flaky | yes | confirmed | `:893`; M17 → it fails on PostgreSQL and MySQL; 3 runs each → passed every time |
| 5 | A write locks the account's row after the provider's, so the state read is the state written against | yes | not met | `createScimUser` reads `owner` before `lockUser` and never re-reads it. Probe P (PostgreSQL, MySQL): a transaction holds X's row and promotes it to root while a create for X's email with `active: false` runs → 201, a root adopted and disabled. `load()` is right (probe Q waited 559 ms → 403). M19 (`lockUser` a no-op) → 28 passed: no test pins the lock |
| 6 | The lock order can't deadlock with 106's sign-in or root's Disable user; `retryOnDeadlock` covers the rest | no | confirmed | By reading: sign-in and SCIM both take the provider then the user; `lockAndRecheckActor` never takes the provider row; two providers locking owner and tombstone users in opposite orders could deadlock, and `retryOnDeadlock` wraps the whole transaction |
| 7 | The task's tests pass on all four; Biome clean | yes | confirmed | 28 passed each; `biome check` → no fixes |

**Overall:** not met: the create path's account lock came after the read it should protect (5); rows 4, 8, 16 and 17 are fixed and pinned by tests.

Fixed since (with the blind re-check's row 27): the create locks the account found by email and reads it again before any check; two tests (servers only: SQLite runs one writer at a time) hold the account's row, promote it to root and commit, while a create and a PATCH run: both wait and answer 403 → 30 passed on PostgreSQL, MySQL and MariaDB; with `lockUser` a no-op both fail on PostgreSQL (2 failed, restored with `cmp`).

### Re-check 2 (blind: row 27, plus what the diff touches)

Witnessed: 2026-10-18 12:06 EDT, by a fresh agent (blind). Commit: b0b870aa + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 27 | A SCIM write (create, PATCH) locks the account's row and reads it again before any check, so a promotion to root committed meanwhile is what the checks see (403, nothing changed) | no | confirmed | `scim-users.ts:148-149` (create), `:155-156` (tombstone), `:123-124` (`load`). Lock tests `scim-users-api.db.test.ts:893-951` → SQLite 28 passed, 2 skipped (servers only); PostgreSQL, MySQL, MariaDB → 30 passed each. On PostgreSQL in a scratch copy: `lockUser` a no-op → both fail; the create's re-read removed → "makes a create wait…" fails; `load` reading before locking → "makes a PATCH wait…" fails; restored with `cmp` |

**Overall:** met: create and PATCH lock the account's row and read it again before checking the role, and the server-only tests fail when the lock or the re-read is taken out.

Its note (the tombstone path's lock untested) was closed: a third lock test brings a deleted user back under a new email while the account is promoted → 403, still a tombstone, still disabled; 31 passed on PostgreSQL, MySQL and MariaDB, and removing the tombstone path's `lockUser` fails it on PostgreSQL (restored with `cmp`).

### Re-check 2 (adversarial: row 5, plus what the diff touches)

Witnessed: 2026-10-18 12:11 EDT, by a fresh agent (adversarial). Commit: b0b870aa + working tree (snapshot 12:09:33). Machine: macOS 27.0.1, Node v24.0.0.

The implementer mutated `scim-users.ts` and `kysely-scim-user-repository.ts` in the repository itself (to check the lock tests, backups `scratchpad/svc-bak.ts` and `lock-bak.ts`) while this pass ran, against the rule that mutations go in a scratch copy. The witness snapshotted the restored tree at 12:09:33 after checking it byte for byte against those backups, and reran every result against the snapshot.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | (row 5) A create locks the account found by email, reads it again, then checks; a promotion to root committed meanwhile → 403, nothing adopted or disabled | yes | confirmed | `scim-users.ts:148-150`; probe P → `STALE postgres -> 403 role=root disabled_at=null adopted=0 disabledEvents=0`, MySQL the same |
| 2 | (row 5) A PATCH waits for the held row and sees the new state | yes | confirmed | `load` `:122-127`; probe Q → 403, `waited=558ms` on PostgreSQL and MySQL |
| 3 | (row 5) The tombstone path locks, then reads again before its root check | yes | confirmed | `:155-160`; probe T (deleted user, re-enabled and promoted under a held row, back by `externalId` under a new email) → 403, untouched, PostgreSQL and MySQL |
| 4 | Tests pin the lock | yes | confirmed | M19 (`lockUser` does nothing) → the three lock tests fail on PostgreSQL and MySQL |
| 5 | Tests pin the create's re-read | yes | confirmed | M20 (`const owner = found;`) → `:909` fails on both |
| 6 | Tests pin the tombstone path's read-after-lock | yes | confirmed | M21 (read above the lock) → `:940` fails on both; probe T → 201, a root relinked |
| 7 | The new tests aren't timing-flaky | yes | confirmed | The file 3 runs each on PostgreSQL and MySQL → 31 passed every time; SQLite → 28 passed, 3 skipped; a slow runner can't pass falsely (the 403 assertion) |

**Overall:** met: the create's email and tombstone paths and the PATCH lock the account and read it again; probes P, Q and T give 403 on PostgreSQL and MySQL; M19, M20 and M21 each fail a test; the tests passed 3 out of 3 on each server.

Observation, not a failed row: after the lock the create reads the owner again by id but doesn't check its email again, so an email root changes while a create for the old one is in flight could still be adopted (it needs the account's own recent sign-in through the provider). Noted for a follow-up in PLAN.md.

## Task 5 — Groups

Witnessed: 2026-10-18 12:27 EDT, by a fresh agent (blind). Commit: 51f8b62d + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass on SQLite | no | confirmed | scim-groups-api, scim-api, sso-groups `.db.test.ts` → 46 passed; `summary.test.ts` → 6 passed |
| 2 | The same pass on PostgreSQL, MySQL and MariaDB | no | confirmed | `pnpm test:db:{postgres,mysql,mariadb} -- <3 files>` → 46/46 each (a first parallel run failed, likely another witness on the servers; sequential reruns green) |
| 3 | Adding a member gives the mapped role, marked with the provider; removing takes it away (path and value forms, string members) | yes | confirmed | `scim-groups-api.db.test.ts:341`; M7 (no sync after a group delete) → 3 tests fail |
| 4 | A rename re-applies the mappings for every member | no | confirmed | `:500`; M6 (only changed members synced) → it fails |
| 5 | Deleting a group removes it and the memberships it gave; its id is 404 after | no | confirmed | `:552`; `scim-groups.ts:322-329`; M7 → fails |
| 6 | Two groups mapping one workspace give the higher role, then the remaining one's | yes | confirmed | `:414` |
| 7 | Hand-set memberships never change; nobody leaves `global` | yes | confirmed | `:446`; `:649` (another provider's row kept) |
| 8 | Unmapped groups grant nothing; a mapping also matches a group's `externalId` | yes | confirmed | `:251`, `:235`; M3 (`groupNames` drops externalId) → `:235` fails |
| 9 | A root named as a member is left out and audited `root_member`; a later change never touches a root | yes | confirmed | `:480`; M4 → fails; probe: member made root, group deleted → keeps eng; `summary.ts` tested |
| 10 | Another provider's token never reaches this provider's groups | no | confirmed | `:607`; probe: another provider's PUT → 404, nothing changed; M5 (`findGroup` unscoped) → fails |
| 11 | A user's DELETE takes them out of every group and the memberships those gave; `active: false` keeps them | yes | confirmed | `:569`; M1 (no `syncMemberships` in `deleteScimUser`) → fails |
| 12 | A re-created user starts in no group, and can be added again | no | confirmed | `:569`; probe: the tombstoned id as a member → 400, the new link → eng again |
| 13 | While SCIM is on, sign-in doesn't apply the groups claim; it does again once SCIM is off | yes | confirmed | `sso-groups.db.test.ts:329`; M2 (drop the `scimEnabled` check) → fails |
| 14 | A PUT without `members` empties the group | yes | confirmed | `:531` |
| 15 | Removing a member who isn't there is no error | yes | confirmed | `:341` |
| 16 | `excludedAttributes=members` is honoured on get and list | yes | confirmed | `:264` (lines 290, 293); `scim-groups-api.ts:23` |
| 17 | The create checks the account's email again after locking it: an address root changed meanwhile → 409 | yes | partly | Holds (probe on PostgreSQL: a held row's email changed while a create for the old address waits → 409; without `scim-users.ts:152` → 201, adopted at the new address), but no repository test fails without the line (31/31) |

**Overall:** not met: rows 1-16 hold on all four databases and each of 7 mutations fails its test; row 17 behaves as claimed but has no test.

Witnessed: 2026-10-18 12:27 EDT, by a fresh agent (adversarial). Commit: 51f8b62d + working tree. Machine: macOS (Darwin 27), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Groups CRUD answers correctly | yes | confirmed | SQLite 46/46; with `scim-users-api.db.test.ts`, PostgreSQL, MySQL, MariaDB 77/77 each |
| 2 | PATCH add/remove on `members` in every form, Entra's older ones too, each change applied | no | confirmed | P1: string members, `Add`/`ADD`, a single `{value}`, the URN-prefixed path, a prefixed remove filter → 200, applied; P2: `members[display eq "x"]` → 400 `invalidPath`; an escaped quote → nothing removed. M1 (removals not re-synced) → 3 fail |
| 3 | The same member twice counts once | no | confirmed | P3: one member, one `member_added` |
| 4 | Rename and re-id re-apply the mappings; a mapping matches `displayName` or `externalId` byte for byte | yes | confirmed | M2, M8 → their tests fail; P4: two groups matching "X" both give eng; removing the externalId drops it |
| 5 | Delete removes the group and the memberships it gave | yes | confirmed | Passes on 4 databases |
| 6 | Two groups mapping one workspace give the higher role | yes | confirmed | `:414` |
| 7 | Hand-set, `global` and other providers' memberships untouched | yes | confirmed | `:446`, `:649`; `planGroupChanges` unchanged from 106 but `via` |
| 8 | A root member is left out and audited `root_member` | yes | confirmed | M9 → fails; summary tested |
| 9 | Root is never changed by a sync, a root promoted after joining included | yes | partly | Holds (P5 on all four), but M3 (drop the root skip in `syncMemberships`) → all 56 pass |
| 10 | Another provider's token never reaches this provider's groups or users | no | confirmed | M5, M11 → "keeps each provider's groups to itself" fails; P7 |
| 11 | A user's DELETE takes them out of every group and the memberships those gave; `active: false` keeps them | yes | confirmed | M7, M10 → tests fail |
| 12 | A re-created user starts in none | no | partly | P12 on all four: Ann with eng admin `source: "acme"` (106's sign-in before SCIM), in no SCIM group: DELETE keeps it, the re-create comes back enabled with it. `deleteScimUser` re-synced only when `removeFromGroups` returned groups |
| 13 | Sign-in skips the groups claim while SCIM is on; 106 unchanged with it off | yes | confirmed | M6 → the new test fails; `sso-groups.db.test.ts` passes on 4 |
| 14 | Unmapped groups grant nothing | no | confirmed | `:251`; P6 |
| 15 | Duplicate `externalId` → 409, atomic; names may repeat | no | confirmed | P4 (PATCH and PUT → 409, nothing changed); P14: 3 concurrent → `201,409,409` on 4 |
| 16 | Filters byte for byte (MySQL/MariaDB) | no | confirmed | P15, P4: case and accents → 0 on 4 |
| 17 | `excludedAttributes=members` on get and list | yes | confirmed | `:264`; P9 |
| 18 | Unknown or deleted member → 400; removing an absent one is no error | yes | confirmed | P7, P10, P11 (5000 unknown → 400) |
| 19 | PUT sets name, externalId and members exactly; none when left out | yes | confirmed | `:531`; M1 fails it |
| 20 | Parallel PATCH adds and a racing user DELETE stay consistent | no | confirmed | P13 on 4: 200×6, 204×2, consistent memberships |
| 21 | A mapping whose workspace was deleted is skipped | no | confirmed | P8 |
| 22 | Audit events carry `via: "scim"` and read well | yes | confirmed | P9; "Added ann@example.com to eng as user, through the SCIM groups of acme" |
| 23 | Writes refuse once SCIM is off (the gate in `write`) | no | partly | The guard refuses first, so the gate only matters in a race; M4 (`!provider`) → all 56 pass |
| 24 | Tests run on all four databases | no | confirmed | Row 1; probes 15/15 each |
| 25 | (notes) The create re-checks the email after its lock | yes | partly | M12 (line removed) → every suite passes |

**Overall:** not met: CRUD, the PATCH forms, mappings, isolation, uniqueness, filters and concurrency hold on four databases, but a user deleted in no SCIM group kept the provider's sign-in memberships through a re-create (12), and rows 9, 23, 25 had no test.

Fixed since: `deleteScimUser` always re-applies the mappings (in no group too), so every membership marked as the provider's goes; SPEC's DELETE row says so. Tests added: a deleted user with a pre-SCIM sign-in membership → only `global`, before and after the re-create; an account promoted to root after joining keeps its memberships through a rename and a delete; a write past the guard after SCIM is turned off → 401, nothing written; a create waiting on a held row whose email root changes → 409 (servers only) → 63 passed on PostgreSQL, MySQL and MariaDB with the users and sign-in suites.

### Re-check 1 (blind: row 17, plus what the diff touches)

Witnessed: 2026-10-18 12:36 EDT, by a fresh agent (blind). Commit: 51f8b62d + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The three suites pass on SQLite, PostgreSQL and MySQL | no | confirmed | SQLite → 59 passed, 4 skipped (server-only lock tests); `pnpm test:db:postgres` and `:mysql -- <3 files>` → 63/63 each |
| 17 | The create checks the account's email again after locking it: an address root changed meanwhile → 409 | yes | confirmed | `scim-users.ts:152`; `scim-users-api.db.test.ts:959`; the line removed in a scratch copy, on PostgreSQL → that test fails (`expected 201 to be 409`) |
| 18 | A user's DELETE always re-applies the mappings, so a pre-SCIM sign-in membership goes and a re-create starts in none | yes | confirmed | `scim-users.ts:354-355`; `scim-groups-api.db.test.ts:650`; without the call → it and `:572` fail; SPEC.md:92 and PLAN agree |
| 19 | An account promoted to root after joining is never changed by a later rename or group delete | yes | confirmed | `:610`; without the root skip (`scim-groups.ts:50`) → it fails |
| 20 | A write past the guard after SCIM is off → 401, nothing written | yes | confirmed | `:633`; `scim-groups.ts:71` changed to `if (!provider)` → it fails |

**Overall:** met: row 17 has a server test that fails without the re-check, and the DELETE re-sync, the root rule and the 401 after SCIM is off each have a test that fails without their code.

### Re-check 1 (adversarial: rows 9, 12, 23, 25, plus what the diff touches)

Witnessed: 2026-10-18 12:36 EDT, by a fresh agent (adversarial). Commit: 51f8b62d + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9 | A sync never changes a root, one promoted after joining included | yes | confirmed | P5 holds; M3 (drop the root skip, `scim-groups.ts:50`) → the new test fails |
| 12 | A user deleted in no SCIM group loses the provider's sign-in memberships; a re-create starts in none | yes | confirmed | P12 on SQLite, PostgreSQL, MariaDB → `[global]` only; the old conditional sync put back → the new test fails |
| 23 | A write past the guard is refused once SCIM is off | yes | confirmed | M4 (`!provider`) → "refuses a write once SCIM is off…" fails |
| 25 | The create re-checks the email after its lock → 409 | yes | confirmed | M12 (`scim-users.ts:152` removed): PostgreSQL and MySQL → "makes a create wait, and see the account's email change" fails; SQLite skips it (servers only) |
| 26 | Always re-syncing on DELETE never removes a hand-set membership, another provider's, or `global` | no | confirmed | P16 (hand-set eng, `beta`'s ops, global, no group) → unchanged; P16b (acme's eng) → only eng removed; all four databases |
| 27 | Deleting a linked user promoted to root touches nothing | no | confirmed | P17 → 403, still root, enabled, memberships unchanged; all four |
| 28 | An adopted account holds no provider memberships beyond its SCIM groups' ("SCIM is the one source", SPEC l.129) | no | partly | P18: a 106 account with eng admin `acme`, adopted (201) → keeps it until its first group change; never put in a group, it keeps it while SCIM is on. The spec doesn't say adoption reconciles; owner's call |
| 29 | The task's suites pass on all four databases | no | confirmed | SQLite 59 passed, 4 skipped; PostgreSQL, MySQL, MariaDB → 82/82 each with the probes |

**Overall:** not met: rows 9, 12, 23 and 25 hold and each new test fails without its fix, but an adopted account keeps its sign-in memberships until the provider first puts it in a group (28), which needs the owner's decision.

The owner decided row 28 (2026-10-18): adoption and turning SCIM on change no membership; roles the sign-in gave stay until the provider's first group change that includes the person. SPEC's Groups paragraph and the Documentation checklist say so, and a test pins it (adopted with eng admin → kept; put in "Engineers" → eng as user) → 19 passed on all four databases.

### Re-check 2 (adversarial: row 28, plus what the diff touches)

Witnessed: 2026-10-18 12:45 EDT, by a fresh agent (adversarial). Commit: 51f8b62d + working tree. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 28 | The spec says exactly what happens (adoption and turning SCIM on change no membership; sign-in roles stay until the provider's first group change that includes the person; a DELETE removes them at once), the code matches, and a test pins it on SQLite and PostgreSQL | yes | confirmed | `SPEC.md:130-133`, `:208-209`; the adoption branch (`scim-users.ts:174-192`) calls no `syncMemberships`; turning SCIM on touches no membership (grep); group writes sync only members (`scim-groups.ts:175,271,314,328`); DELETE syncs (`scim-users.ts:357`). Test `scim-groups-api.db.test.ts:652` → passes; mutation A (sync at adoption) → fails; mutation B (no sync on group create) → fails; PostgreSQL → 51 passed. No test pins "turning SCIM on changes no membership" (read in the code) |

**Overall:** met: the spec describes the owner's chosen behaviour exactly, the code matches, and the test fails under both mutations.
