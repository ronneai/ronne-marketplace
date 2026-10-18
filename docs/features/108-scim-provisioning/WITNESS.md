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
