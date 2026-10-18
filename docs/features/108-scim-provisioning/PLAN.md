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

- [x] **3. The guard and the routes' frame.** [risky] `/api/v1/scim/v2` mounted over our handlers
  (task 1), the SCIM guard (token by hash, provider on, per-token and bad-token rate limits),
  the SCIM error format, `ServiceProviderConfig`, `ResourceTypes`, `Schemas`.
  *Done when:* route tests cover every refusal, the formats and the public discovery endpoints.

- [x] **4. Users.** [risky] Create, get, list with `eq` filters, replace, patch (path and value
  forms, string booleans), delete; creation through the Create user service; deprovisioning through
  the Disable user service in one transaction; root and last-root protections.
  *Done when:* db tests cover each request, the 409 cases, adoption (each of its conditions, the 30
  days included, and its event), a `userName` that isn't plain ASCII, the lowercased match on a
  create, a `PUT` or `PATCH` of `userName` or `emails` (`Ann@b.com` matched as `ann@b.com`, and 409
  against another account's) and a `userName eq` filter, another provider's working token never
  reaching this provider's users, repeated delete (404), a create with this provider's tombstone
  `externalId` (another's never matches, and `active: false` keeps it disabled), reactivation, a
  root, the last root, and the Entra and Okta request shapes from task 1.

- [x] **5. Groups.** [risky] Groups CRUD, `PATCH` members, the mapping (106) applied to members and
  only `source`-marked memberships changed, unmapped groups, a root as a member.
  *Done when:* db tests cover add, remove, rename, delete, two groups giving one workspace different
  roles, hand-set memberships, another provider's token never reaching this provider's groups, a
  user's `DELETE` taking them out of every group (and the memberships those gave) while `active:
  false` keeps them, and a re-created user starting in none.

- [x] **6. The provider page's SCIM section.** Turn on/off, base URL, Generate, Rotate, Revoke,
  last used, the steps; Admin › Users badges and read-only fields; the Erase link when 103 exists
  (hidden before).
  *Done when:* component tests pass for each state; the phone sweep passes.

- [x] **7. Terminal commands and backup.** `revoke-access` revokes SCIM tokens, `disable-sso` turns
  SCIM off; backup and restore carry the tables.
  *Done when:* script tests pass, including a restore round trip.

- [x] **8. End-to-end.** A test process plays an identity provider's SCIM client against the built
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

**Task 3, the guard and the frame (2026-10-18).**

- **One route:** `app/api/v1/scim/v2/[...path]/route.ts` sends every method to `handleScim`
  (`server/http/scim-api.ts`), which reads the path itself (`new URL(request.url)`), so Next's
  catch-all decoding doesn't matter. Discovery (`scim-discovery.ts`) is public; `Users` and
  `Groups` go through `authenticateScim` (`domains/identity/actions/scim.ts`) and then to a
  `ScimResources` handler, `{ caller, id, base }`. Until tasks 4 and 5 replace them, both answer
  501; tests pass stand-ins through `options.resources`.
- **Format:** `scim-format.ts` (`scimJson`, `scimError`, `scimUnauthorized`, `scimRateLimited`).
  Every refusal is the same 401 and detail; the reason goes only to `scim.request_refused` (audit,
  with the provider when the token was found, and a `warn` log line).
- **Limits:** `createScimLimiters` (in memory, like 107's): 600 a minute per token, 20 refusals a
  minute per trusted address, 100 for the instance without one. A refusal past its limit is a 429,
  not audited.
- **Telemetry:** `scim`, `v2` and `[...path]` are route segments; a SCIM path is cut after `v2`
  (`/api/v1/scim/v2/…`). The privacy scenario now sends a SCIM token and an email in a filter.
- **Methods:** the route exports `OPTIONS` as well as the five, so Next doesn't answer it with its
  own 204; `HEAD` is left to Next, which runs `GET`'s handler and drops the body. The request still
  says `HEAD`, so the dispatcher treats it as `GET` (handlers get `method`, never `HEAD`) and lists
  `HEAD` in every `Allow` that has `GET`. `route.test.ts` beside the route checks the exports and the SCIM
  503 before setup. The audit filter has a `scim` group for `scim.request_refused`; the token events
  stay under `instance`.
- **For task 9:** the Documentation's events table (Logs) and audit list need `scim.request_refused`
  and the `instance.scim_*` events.

**Task 4, Users (2026-10-18).**

- **Where:** `models/scim-user.ts` reads a body, a PATCH and a filter and renders the resource,
  with no storage, so every shape Entra and Okta send is unit-tested; `scim-user-repository.ts`
  (+ Kysely) holds the links and the account steps; `services/scim-users.ts` is the behaviour, one
  transaction per write with the provider's row locked (`retryOnDeadlock` around it);
  `http/scim-users-api.ts` reads the body in SCIM's terms and maps `ScimRequestError` to the SCIM
  error. `scim-users-api.db.test.ts` drives every request through `handleScim` with real tokens.
- **Shared with Disable user:** `disableAccount` (`user-admin.ts`) now holds the steps after the row
  is set (keep a root, end sessions, revoke tokens, cancel requests to join); root's service and
  SCIM both call it, so access ends the same way.
- **Decided while building:** a create whose email is a root's is 403 at once (the edge case),
  before any adoption check, and the refusal's event is written after the rollback so it stays;
  `name.formatted` stands in for a missing `displayName`; `PUT` is a full replace (a `displayName`
  not sent goes, and the account's name falls back to the given and family names, then the email);
  a `PATCH` of `emails` in any of its forms changes the email through the primary (or first) value;
  `remove` on `active` or `userName` is 400 `mutability`; read-only and unknown paths are ignored;
  a filter also takes `id eq`, and a `userName` filter that isn't plain ASCII matches nothing (a
  search isn't a write); `count` is clamped to 0…100 and `startIndex` to 1 or more. A `PATCH` that
  changes nothing in the link still puts back an email or name root changed by hand (the
  provider's word wins). `user.updated { via, provider, changed }` and `user.scim_adopted` joined
  the audit catalogue; `scim.request_refused { reason: "root" }` is the root refusal.
- **MySQL look-alikes:** `findUserByEmail` may return `kåte@` for `kate@`; the service compares the
  stored email byte for byte and treats a mismatch as another account's (409), as 106 refuses it.
- **From the witnesses:** the provider lock serialises one provider only, so two providers creating
  one email at once met a unique violation on `user.email` (a 500); a unique violation inside a
  SCIM write now answers 409 `uniqueness`, whatever raised it. A write also locks the account's row
  (`lockUser`) after the provider's, so the state it reads is the state it writes against.
  `startIndex=1e21` reached the database as an offset it refused (a 500 on all four): integers are
  taken as they come and clamped (`startIndex` ≤ 2³¹−1, `count` 0…100), so a huge index means an
  empty page, not an error.
- **Left open (low):** after the lock, the create reads the owner again by id but doesn't check its
  email against the `userName` again; an email root changes while a create for the old one is in
  flight could still be adopted (it needs the account's own recent sign-in through the provider).
  A one-line re-check of the email (409 if it changed) closes it; worth doing with task 5.
- **Process:** while task 4's adversarial re-check 2 ran, I mutated two service files in the
  repository itself to check the lock tests; the witness noticed, snapshotted the restored tree and
  reran. Mutations go in a scratch copy even for the implementer's own checks.
- **For task 5:** a `DELETE` removes the user's `scim_group_members` rows for the provider
  (`removeFromGroups` returns the group ids); the mapping must then drop the memberships those
  groups gave, and a re-created user starts in no group (task 5's *Done when*). The resource's
  `groups` already lists the provider's groups the user is in.

**Task 5, Groups (2026-10-18).**

- **Where:** `models/scim-group.ts` (body, PATCH, filter, resource, `groupNames`), the repository
  (`scim-group-repository.ts` + Kysely), `services/scim-groups.ts`, `http/scim-groups-api.ts`, and
  `scim-groups-api.db.test.ts` through the real guard.
- **106's rules, not new ones:** `applyGroups` (`group-sync.ts`) now takes a narrower repository
  (`GroupSyncRepository`, a `Pick` of `SsoRepository`) and a `via`; SCIM calls it per member whose
  groups changed (`syncMemberships`), with the names of every provider group they're in. So the
  higher role, `global`, hand-set rows and root behave exactly as at sign-in.
- **Decided while building (SPEC updated):** a mapping matches a group's `displayName` or its
  `externalId` (Entra's mappings name object ids); while SCIM is on for a provider, its sign-in
  skips the groups claim (`SsoRepository.scimEnabled`), so the two sources can't undo each other; a
  root named as a member is left out and audited `scim.request_refused { reason: "root_member" }`;
  `PUT` without `members` empties the group; removing a member who isn't there is no error;
  `excludedAttributes=members` is honoured on get and list.
- **A user's `DELETE`** (task 4's `deleteScimUser`) now re-applies the mappings after taking the
  user out of the provider's groups, always (in no group too), so every membership marked as the
  provider's goes, even one its sign-in gave before SCIM was on: a re-create starts in none (the
  adversarial pass found a user in no group kept them). `active: false` keeps them.
- **Owner's decision (2026-10-18):** turning SCIM on or adopting an account changes no membership;
  roles the sign-in gave stay until the provider's first group change that includes the person (no
  gap in access while a provider pushes users before groups). A test pins it.
- **Task 4's open item, closed:** the create checks the account's email again after locking it; an
  address root changed meanwhile is another account's (409).

**Task 6, the provider page's SCIM section and Admin › Users (2026-10-18).**

- **Section:** `providers/ScimSection.tsx` on a saved provider's page (`ProviderPage.tsx`), fed by
  `actions/scim-settings.ts` (`scimPanel`: on since when, the base URL from PUBLIC_URL, the tokens
  with their maker's email; never a token). Off: *Turn on SCIM*, after a confirm that says sign-in
  stops applying the groups claim. On: the base URL to copy, the token (made when and by whom, last
  used), *Generate token* or *Rotate* (24 hours for the one before, said in the confirm and after),
  *Revoke* and *Turn off SCIM* with confirms, and the provider's steps (Entra's and Okta's own,
  generic otherwise). A new token is shown once, as `CopyableCommand`, from the action's state; it
  never reaches the page's server render.
- **Admin › Users:** `adminListUsers` adds each row's `scim` (`ScimAccountState`, from the link and
  the latest `user.scim_adopted`); `ScimBadges` under the role (the Status column is hidden on
  phones, the witness found; the cell is a grid with `justify-items-start`, or root's badge
  stretches to the column, as the owner saw on 2026-10-18); an account disabled by `active: false` keeps *Managed by*, since its
  link is live: *Deprovisioned by* follows a DELETE; `ScimManagedNotice` in the
  Disable/Enable dialogs. The page has no name or email editing, so "read-only while SCIM is on"
  needed nothing (SPEC says so). *Erase* is left out until 103.
- **Help:** `scim-provider` and `scim-managed` link to `authentication#scim`; the app's topic list
  has `scim` and `scim-groups` (ronne-web's `topics.ts` gets them in task 9).
- **Phones:** 106's provider phone test now turns SCIM on and makes a token, checking nothing
  scrolls sideways (the sweep only opens pages as they load, with no saved provider).

**Task 7, terminal commands and backup (2026-10-18).**

- **`revoke-access --everyone`** with tokens also revokes every provider's SCIM tokens (the ones
  that still work), counted in its question, its answer and its event (`scimTokensRevoked`), and
  says SCIM stops until root generates new tokens. `--user` and `--sessions-only` leave them: a
  SCIM token isn't anyone's. (`IdentityRepository.countAllScimTokens` / `revokeAllScimTokens`.)
- **`disable-sso`** also turns SCIM off for every provider that has it (`disableAllScim`, each
  audited `instance.scim_disabled { via: "cli" }`), a provider that's off included; the tokens stay,
  refused while SCIM is off, as the page's *Turn off SCIM* does.
- **Backup and restore** read the schema, so the SCIM tables needed no code: the restore tests'
  seed now holds a provider with SCIM on, a rotated token, a live link, a tombstone (null
  `user_name`), a group and a member, and every round trip compares every row (SQLite to each
  server kind and back). Two old tests assumed one user and one provider and now say which row
  they read. `rotate-secret` needs nothing: SCIM tokens are hashes, not encrypted.
- **Script tests:** `setup/scim-commands.db.test.ts` (each command's question and lines).
- **Audit log line** (the blind pass's row 10): the SCIM count joins the other counts in the
  parentheses ("(2 SCIM tokens revoked)"), so *nothing left* shows only when all are zero; tested
  in `summary.test.ts`, with `instance.scim_disabled`'s *from the command line*.

**Found before task 8: *Reset password* on an account with no password (2026-10-18).** Accounts
that 106's sign-in and SCIM create have no `credential` row, and `setPassword` only updated one:
the reset ended sessions, revoked tokens and showed a password that signed nobody in (and
`disable-sso`'s line sends root there). The owner chose to fix it within 108. `setPassword` now
locks the user's row, updates the password, and adds the row Better Auth writes when there was
none. Tests: the reset gives a passwordless account a working password with one row; two resets
racing in two transactions (servers only; SQLite has one connection) add one row. Without the
lock that race leaves two rows on PostgreSQL and MySQL.

**Task 8, end to end (2026-10-18).** `e2e/scim.ts` (the flow), `scim.e2e.ts` (desktop) and
`scim.mobile.e2e.ts` (phone, phone-webkit, tablet). 106's root of each project adds a Keycloak
provider with a group mapping (moderator of `e2e-team`), turns SCIM on and generates a token
from the page; the test process then plays the provider with `fetch`: create (Okta's shape) and
the same create again (409), find by `userName eq`, patch the name (Entra's), a group with the
person in it (Admin › Users: *Managed by* and moderator). Root resets the person's password (the
fix above), the person signs in and makes an `rmk_` token. Then: out of the group (the role
goes), `active` "False" (Entra's string; the next page is the sign-in, the token gets 401, the
row says disabled), `active: true` (Okta's; enabled, the token stays revoked, a sign-in works),
`DELETE` (204, then 404; signed out, *Deprovisioned by … on*). Deleting the provider leaves the
instance as it was, and its token then gets 401. The SCIM token and the password are recorded for
the log check. No new seeded users: 106's root signs in once in its own test, so one more stays
under the per-email limit. Tests run one at a time (`workers: 1`), so 106's `disable-sso` (which
now turns SCIM off too) never lands in the middle of this flow.
