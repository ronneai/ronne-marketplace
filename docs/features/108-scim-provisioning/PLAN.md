# 108 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Spike: the plugin.** [risky] Through the dependency checklist, read the installed
  `@better-auth/scim`: licence, peer dependencies, tables and columns on the four database kinds,
  the transaction requirement, what `connections` and `managedConnections` give, how tokens are
  stored (digest?), the supported filters and PATCH shapes, `reconcileUser`, and whether a route
  base other than `/api/auth/scim/v2` is possible. Replay recorded Entra and Okta request bodies
  against it. Decide in Notes: the plugin behind `/api/v1/scim/v2`, or a small implementation of
  Users and Groups on Ronne's tables.
  *Done when:* Notes name the choice with the evidence; `pnpm licenses:check` and
  `pnpm audit --audit-level high` pass.

- [ ] **2. Tables and tokens.** [risky] The migration (SCIM links, groups, memberships' `source`
  from 106 reused, token hashes, the 24-hour rotation overlap) for all dialects; the token service
  (`scim_` prefix, hash, show once, rotate, revoke, last used) and its audit events.
  *Done when:* db tests cover each operation, the overlap, and that no plain token is stored or logged.

- [ ] **3. The guard and the routes' frame.** [risky] `/api/v1/scim/v2` mounted over the plugin or
  our handlers, the SCIM guard (token by hash, provider on, per-token and bad-token rate limits),
  the SCIM error format, `ServiceProviderConfig`, `ResourceTypes`, `Schemas`.
  *Done when:* route tests cover every refusal, the formats and the public discovery endpoints.

- [ ] **4. Users.** [risky] Create, get, list with `eq` filters, replace, patch (path and value
  forms, string booleans), delete; creation through the Create user service; deprovisioning through
  the Disable user service in one transaction; root and last-root protections.
  *Done when:* db tests cover each request, the 409 cases, repeated delete, reactivation, a root,
  the last root, and recorded Entra and Okta bodies.

- [ ] **5. Groups.** [risky] Groups CRUD, `PATCH` members, the mapping (106) applied to members and
  only `source`-marked memberships changed, unmapped groups, a root as a member.
  *Done when:* db tests cover add, remove, rename, delete, two groups giving one workspace
  different roles, and hand-set memberships.

- [ ] **6. The provider page's SCIM section.** Turn on/off, base URL, Generate, Rotate, Revoke,
  last used, the steps; Admin › Users badges and read-only fields; the Erase link when 103 exists
  (hidden before).
  *Done when:* component tests pass for each state; axe and the phone sweep pass.

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
