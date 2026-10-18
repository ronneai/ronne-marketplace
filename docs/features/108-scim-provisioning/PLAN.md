# 108 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Spike: the plugin.** [risky] Through the dependency checklist, read the installed
  `@better-auth/scim`: licence, peer dependencies, tables and columns on the four database kinds,
  the transaction requirement, what `connections` and `managedConnections` give, how tokens are
  stored (digest?), the supported filters and PATCH shapes, `reconcileUser`, and whether a route
  base other than `/api/auth/scim/v2` is possible. Replay Entra and Okta request bodies
  against it. Decide in Notes: the plugin behind `/api/v1/scim/v2`, or a small implementation of
  Users and Groups on Ronne's tables.
  *Done when:* Notes name the choice with the evidence; `pnpm licenses:check` and
  `pnpm audit --audit-level high` pass.

- [x] **2. Tables and tokens.** [risky] The migration (SCIM links, groups, memberships' `source`
  from 106 reused, token hashes, the 24-hour rotation overlap) for all dialects; the token service
  (`scim_` prefix, hash, show once, rotate, revoke, last used) and its audit events.
  *Done when:* db tests cover each operation, the overlap, and that no plain token is stored or logged.

- [ ] **3. The guard and the routes' frame.** [risky] `/api/v1/scim/v2` mounted over our handlers
  (task 1), the SCIM guard (token by hash, provider on, per-token and bad-token rate limits),
  the SCIM error format, `ServiceProviderConfig`, `ResourceTypes`, `Schemas`.
  *Done when:* route tests cover every refusal, the formats and the public discovery endpoints.

- [ ] **4. Users.** [risky] Create, get, list with `eq` filters, replace, patch (path and value
  forms, string booleans), delete; creation through the Create user service; deprovisioning through
  the Disable user service in one transaction; root and last-root protections.
  *Done when:* db tests cover each request, the 409 cases, adoption (each of its conditions, the 30
  days included, and its event), a `userName` that isn't plain ASCII, the lowercased match on a
  create, a `PUT` or `PATCH` of `userName` or `emails` (`Ann@b.com` matched as `ann@b.com`, and 409
  against another account's) and a `userName eq` filter, repeated delete (404), a create with this
  provider's tombstone `externalId` (another's never matches, and `active: false` keeps it
  disabled), reactivation, a root, the last root, and the Entra and Okta request shapes from task 1.

- [ ] **5. Groups.** [risky] Groups CRUD, `PATCH` members, the mapping (106) applied to members and
  only `source`-marked memberships changed, unmapped groups, a root as a member.
  *Done when:* db tests cover add, remove, rename, delete, two groups giving one workspace
  different roles, hand-set memberships, a user's `DELETE` taking them out of every group (and the
  memberships those gave) while `active: false` keeps them, and a re-created user starting in none.

- [ ] **6. The provider page's SCIM section.** Turn on/off, base URL, Generate, Rotate, Revoke,
  last used, the steps; Admin › Users badges and read-only fields; the Erase link when 103 exists
  (hidden before).
  *Done when:* component tests pass for each state; the phone sweep passes.

- [ ] **7. Terminal commands and backup.** `revoke-access` revokes SCIM tokens, `disable-sso` turns
  SCIM off; backup and restore carry the tables.
  *Done when:* script tests pass, including a restore round trip.

- [ ] **8. End-to-end.** A test process plays an identity provider's SCIM client against the built
  server: create, patch, group, deprovision; the browser shows the account disabled and the session
  gone.
  *Done when:* `pnpm test:e2e` passes the spec on desktop and phone.

- [ ] **9. Documentation.** The sections, pages and helpers in the spec.
  *Done when:* the docs render tests pass in ronne-web, and the helper link test passes here.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

**Task 1, the plugin (2026-10-18): Ronne's own Users and Groups, not `@better-auth/scim`.** Read
`@better-auth/scim@1.7.7`, the version matching the installed `better-auth@1.7.7` (from the npm
tarball, not installed in the workspace; 1.7.10 is the latest, 2026-10-15).

- **Dependency checklist.** MIT, by Jonathan Samines in the better-auth repository, published
  2026-09-30. Peers `better-auth ^1.7.7`, `@better-auth/core ^1.7.7`, `better-call 1.4.0`,
  `@better-auth/utils 0.4.2`; dependencies `zod ^4.5.4` and `@noble/hashes ^2.2.0`, both already in
  the lockfile (`zod@4.6.5`, `@noble/hashes@2.4.0`). One 7,583-line `dist/index.mjs`.
- **Tables.** Seven of its own, the same on all four databases (SQLite migrated; PostgreSQL 15,
  MySQL 8.4 and MariaDB 10.11 compiled by the witness): `scimConnectionBinding` (13 fields, with
  decommission leases), `scimIdentityTombstone`, `scimSubject`, `scimUser` (21),
  `scimProjectionGrant`, `scimGroup`, `scimGroupMember`; three more with `managedConnections`
  (`scimManagedConnection`, `scimManagedCredential`, `scimManagedConnectionEvent`). Uniqueness
  through keyed digests (`userNameKey`, `externalIdKey`, `orderKey`…). Its SCIM `id` is its own,
  not the Better Auth user's.
- **Transactions.** `init` throws "The scim plugin requires a database adapter with native
  transaction support" unless the adapter has a `transaction` function (`index.mjs:5499-5502`).
  Ronne passes `database: { db, type }` (`repositories/better-auth.ts:69`), which gives the Kysely
  adapter `transaction: undefined` (`kysely-adapter/dist/index.mjs:40-48`). Not a hard limit: the
  witness ran a second, SCIM-only Better Auth instance with `transaction: true` on the same
  database, leaving the main one as it is.
- **Tokens.** `connections` are static bearer tokens fixed in code; `managedConnections` keeps its
  own catalog with an HMAC digest under a separate `credentialHashSecret` (≥ 32 characters, a second
  secret to back up); `authentication.verifyBearerToken` lets the app check the token itself, which
  would fit Ronne's SHA-256 hashes.
- **Users and identity.** A create calls `internalAdapter.createUser({ email, name })`
  (`index.mjs:6536`): a bare `user` row, without Ronne's `global` membership, personal workspace
  (114) or `user.created` event (`kysely-identity-repository.ts:94-150`, `user-admin.ts:121-150`).
  The hooks `identity.resolveUser` (before the transaction) and `identity.reconcileUser` /
  `projection.reconcileUser` (inside it) get a Better Auth `DBTransactionAdapter`, which knows only
  Better Auth's models (probe: `database.findOne({ model: "access_tokens" })` → `Model
  "access_tokens" not found in schema`). Ronne's work can still join that transaction, two ways the
  witnesses showed: declaring Ronne's tables to Better Auth and writing them through its adapter, or
  wrapping Ronne's Kysely `transaction().execute` in AsyncLocalStorage, so a hook finds the
  plugin's own Kysely transaction (a throw then rolls back the plugin's rows and Ronne's together).
  Either way `createUser`, `disableUser` (`user-admin.ts:182-215`, which opens its own
  transaction) and the membership code would be redone to run inside the plugin's transaction, the
  first through Better Auth's adapter instead of the Kysely repositories, the second relying on how
  Better Auth's adapter opens transactions inside. The plugin itself only calls
  `deleteUserSessions` when a user ends up inactive (`index.mjs:4225`).
- **Routes.** Under the instance's base path. Ronne's instance serves `/api/auth`: probe
  `GET /api/v1/scim/v2/Users` → 404, and rewriting the URL into `auth.handler` leaves
  `meta.location` and `Location` at `…/api/auth/scim/v2/Users/…`. A second instance with
  `basePath: "/api/v1"` gives the right paths and `location` (the witness), at the cost of a second
  Better Auth (its other routes kept closed, Ronne's `authSchema` column mapping repeated).
- **Filters and PATCH.** `eq` only (`parseSCIMEqualityFilter`, `index.mjs:3429-3530`; `co` → 400),
  on `id`, User `userName`, `externalId` and emails, Group `displayName` and `externalId`, and up to
  10 `eq` joined by `and`; `maxResults` 100. Its `onRequest` normalises Entra's shapes
  (`normalizeSCIMUserEntraCompatibilityRequestBody`, `normalizeMicrosoftEntraGroupSchema`).
- **The replay** (`scratchpad/108-spike/probe/probe.mjs`, and `after-delete.mjs` beside it for what
  follows a DELETE; SQLite in memory, `transaction: true`,
  a `verifyBearerToken`). The bodies are written from Microsoft's and Okta's published SCIM
  examples; none was captured from a live tenant, and none can be in CI.

  | Request | Result |
  |---|---|
  | `ServiceProviderConfig` with a bad token | 200 (public), `application/scim+json` |
  | `GET /Users` with a bad token | 401 SCIM error, "Invalid SCIM bearer token" |
  | Entra `filter=userName eq "…"` before and after create | 0, then 1 result |
  | Entra create (`userName` with capitals, enterprise extension, `roles: []`) | 201, email lowercased |
  | The same create again | 409 `uniqueness` |
  | Entra `Replace name.givenName`, `Add displayName` | 200, name changed |
  | Entra `Replace active "False"`, then `"True"` | 200; hooks saw `active` false, then true |
  | Okta create (with `password` and `groups`, both ignored) | 201 |
  | Okta value-object `replace { active: false }`, then `PUT` | 200, 200 |
  | Group create, Entra `Add members`, `Remove members[value eq "…"]` | 201, 200, 200; projection got the mapped role, then none |
  | Okta value-object `replace { displayName }` on a group | 200, renamed |
  | Group `add` an unknown member | 400 `invalidValue` |
  | `DELETE /Users/{id}`, again, then `GET` | 204, 404, 404 (RFC 7644 §3.6) |
  | After it: `filter=userName eq`, a create with the same `externalId`, then one with the same email and a new `externalId` (`after-delete.mjs`) | 0 results; 201 with a new SCIM id on the same user; 409 "A Better Auth User already uses this email" |

- **The choice: Ronne's own implementation on its tables**, as 106 and 107 did. The plugin can be
  made to fit: a second Better Auth instance at `/api/v1` with native transactions, and Ronne's
  account, token, membership and audit code moved inside its transaction (AsyncLocalStorage around
  Kysely, or Ronne's tables declared to Better Auth). That is a dependency on how Better Auth opens
  transactions inside, a second auth instance to keep closed, Ronne's services redone around a
  foreign transaction, and seven tables (keyed digests, tombstones, decommission leases) where
  Ronne's own needs four (task 2: links with tombstones, groups, members, tokens), all for a protocol part that is small in Ronne's scope: `eq` on
  three attributes, a handful of PATCH paths, two resources. Owning it keeps one transaction per
  request in Ronne's own code, the existing services and repositories, and the tables Ronne
  needs. No dependency is added. The replay's request shapes, and the plugin's answers to them,
  become task 4's and 5's fixtures.
- **SPEC changed with it:** the Goal, *Reconciling*, *Transactions*, an edge case and Decision 5 no
  longer name the plugin. `DELETE /Users/{id}` followed the spec's "repeating it is 204"; RFC 7644
  §3.6 says a deleted resource answers 404 to everything after, is left out of queries and doesn't
  count in conflicts, so the spec now says that: a SCIM user's `id` is its link's own id (not the
  account's), the ended link stays as a tombstone, and a later create for that account makes a new
  link with a new id, matched by `externalId` only (a reused address gets 409, as the plugin
  answers). A create adopts an account the provider already signs in to (106), where the plugin
  answers 409. After two re-check rounds the owner chose the rule (2026-10-18): adopt only an
  enabled, non-root account with the provider's 106 link, used to sign in within 30 days, and no
  SCIM link anywhere, matched by its
  exact email, never enabling it or touching 106's subject; and the Documentation's Entra steps map
  `objectId` to `externalId`, since Entra's default `mailNickname` can be reused. A deleted link
  leaves its groups and the memberships they gave; `active: false` keeps them (Decision 3).
  The acceptance criterion and task 4 say "the request shapes Entra and Okta
  publish", not recorded bodies.
- `pnpm licenses:check` → "323 packages checked. All licenses are allowed by the policy";
  `pnpm audit --audit-level high` → "No known vulnerabilities found".

**Task 2, tables and tokens (2026-10-18).**

- **`0028_scim`:** `identity_providers.scim_enabled_at`, and `scim_tokens`, `scim_users`,
  `scim_groups`, `scim_group_members`. A SCIM user's `id` is its `scim_users` row's, not the
  account's. `user_name` and `external_id` are `exactString`, so `kate@`/`kåte@` and `E-1`/`e-1` are
  two values on MySQL too. A tombstone (`deleted_at` set) clears `user_name` and keeps
  `external_id`: the email is held by the account itself, and the external id is the only way back
  (task 4 deletes the tombstone and inserts a new link, with a new id, in one transaction).
- **Tokens:** at most two work at once (the current one, and the one before a rotation for 24
  hours); a second rotation within those hours revokes the older one at once. Every change locks
  the provider's row (`lockProvider`), which the "two changes at once" tests prove: without the
  lock, three creates make three tokens on PostgreSQL. `checkScimToken` answers `format`, `unknown`,
  `revoked`, `expired` or `scim_off`; task 3's guard must answer them all the same way.
- **Logs:** `redactString` now hides `scim_…` runs in free text, as it did `rmk_…`
  (`log/redact.ts`), so a guard that logs a header or an error can't write a token out.
- **For task 4:** `given_name`, `family_name` and `display_name` are `varchar(100)`. SQLite takes a
  longer value, PostgreSQL and MySQL refuse it, so the Users service must check or cut names (to
  Ronne's name limit) before writing. The database accepts a live link (`deleted_at` null) with no
  `user_name`, which no uniqueness check would then catch (there are no CHECK constraints in the
  schema): the repository must never write one, and a test must show it's refused.

**For task 4, from task 1:** the 30-day check reads `auth.sso_signed_in` events, whose provider is
inside `audit_log.metadata` (JSON text, no column or index): parse it the same way on all four
databases, and keep the query to the account's own events (by `target_id`). `audit_log` is
insert-only, so no retention cuts the 30 days short.

**For 103 (erase a user), from task 1:** erasing an account must delete its SCIM links, tombstones
included (not only mark them ended: a tombstone's `external_id` would link the erased account
again), or a provider keeps updating an erased account's id, and the changed-email remedy in SPEC's
Edge cases can't work.
