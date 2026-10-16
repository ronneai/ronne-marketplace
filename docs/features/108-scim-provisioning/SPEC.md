# 108 — SCIM provisioning

> Milestone: M16 · Depends on: 106, 092, 103 · Design: [MVP §14.3](../../MVP/MVP.md#143-sso--planned-as-m16) · Contracts: RFC 7643 and 7644

## Goal

The company's identity provider creates, updates and removes Ronne accounts by itself, and keeps
workspace membership in step with its groups. When someone leaves, their access ends at once,
without root remembering to do it. Built on Better Auth's `@better-auth/scim` plugin (2026-10-15
docs), behind the same provider contract as 106.

## Scope

**In:**
- **SCIM 2.0 server** at `<PUBLIC_URL>/api/v1/scim/v2`: `ServiceProviderConfig`, `ResourceTypes`,
  `Schemas`, **Users** (list with filter, get, create, replace, patch, delete) and **Groups**
  (the same).
- **One token per identity provider** (106), created on the provider's page in the Authentication
  tab: a **SCIM** section with *Turn on SCIM*, the base URL to copy, *Generate token* (shown once),
  *Rotate* and *Revoke*, the last time it was used, and the setup steps for the provider's SCIM
  (Entra, Okta, Keycloak-with-extension, Authentik, Auth0 notes in the Documentation).
- **Users:** a SCIM user is a Ronne account created like a Create user (008, 092, 114): `user` in
  `global`, personal workspace, no password, linked to the provider by `externalId`. Name and email
  are managed by the provider while SCIM is on.
- **Deprovisioning:** `active: false`, or `DELETE`, **disables the account** (`disabled_at`, 008)
  and, in the same transaction, revokes its personal access tokens and deletes its sessions. A later
  `active: true` enables it again. Deleting never erases data: the account shows *Deprovisioned by
  <provider>* in Admin › Users, with the link to erase it (103) for root.
- **Groups:** a SCIM group's members get the workspace role 106's mapping gives that group, marked
  as coming from the provider (`workspace_members.source`), added and removed as the group changes,
  and never touching hand-set memberships. Groups with no mapping are stored and grant nothing.
- **Protections:** SCIM never touches a root, never leaves the instance without an enabled root
  (059), never removes anyone from `global` (092), and can't set a role.
- **Audit events** (007), actor *the provider* (shown by name): `user.created { via: "scim" }`,
  `user.updated`, `user.disabled { via: "scim" }`, `user.enabled { via: "scim" }`,
  `workspace.member_added | member_role_changed | member_removed { via: "scim" }`,
  `instance.scim_token_created | rotated | revoked { provider }`, `instance.scim_enabled |
  disabled { provider }`, and `scim.request_refused { reason }` for bad tokens and refused changes.

**Out** (and where it goes instead):
- **Erasing a person automatically.** Deprovisioning disables; erasing is root's choice (103).
- **Bulk operations, sorting, ETags, change password** (all advertised as unsupported).
- **Custom schema extensions** beyond core User, EnterpriseUser's `department`-style fields being
  ignored, and Group.
- **Provisioning other things than accounts and memberships** (items, scopes).
- **Matching an existing manual account on SCIM create.** A SCIM create whose email belongs to an
  account Ronne didn't provision is answered 409 `uniqueness`; root links the two by having the
  person sign in once through the provider (106 links by verified email), after which SCIM
  updates it. (Decision 2.)
- **SAML/LDAP provisioning.** There is none to provision from.

## Behaviour

**Turning it on.** On a provider's page (106), *Provisioning (SCIM)* is off. *Turn on SCIM* asks to
confirm, then offers the base URL (`https://…/api/v1/scim/v2`, with Copy), and *Generate token*:
`scim_` + 32 random bytes base64url, shown once, only its SHA-256 stored, with the date and who
made it. Rotating makes a new token and keeps the old one for 24 hours (so a rotation at the
provider can be done calmly), then it stops; Revoke stops it at once. Turning SCIM off stops every
request with 401.

**Authentication.** The route is outside `/api/v1`'s own bearer guard (009: `rmk_` tokens, users):
it has its guard, which accepts only `Authorization: Bearer scim_…`, finds the provider by hash,
checks SCIM is on, and refuses everything else with the SCIM error format (RFC 7644 §3.12,
`application/scim+json`, `status`, `scimType`, `detail`) and `WWW-Authenticate: Bearer`. A rate
limit applies per token (600 requests a minute) and per client address for bad tokens (20 a
minute); `Cache-Control: no-store`. Cookies are ignored.

**Discovery.** `GET /ServiceProviderConfig` says: patch supported; bulk, filter (max 100 results,
only `eq` on `userName`, `externalId` and `displayName`), changePassword, sort and etag
unsupported; authentication scheme `oauthbearertoken`. `ResourceTypes` and `Schemas` describe the
core User and Group. These three are public, as the RFC allows.

**Users.**

| Request | Does |
|---|---|
| `GET /Users?filter=userName eq "a@b.com"&startIndex=&count=` | list (paged, 100 max); the filter the providers use to ask "does this exist?" |
| `POST /Users` | create (below); 409 `uniqueness` on a duplicate `userName` or `externalId` on this provider, or an email that belongs to a non-provisioned account |
| `GET /Users/{id}` | one; `id` is Ronne's user id |
| `PUT /Users/{id}` | replace the managed fields: `userName` (the email), `name`, `active`, `externalId` |
| `PATCH /Users/{id}` | `replace` (and `add`/`remove` where it makes sense) on `active`, `userName`, `name.*`, `displayName`, `emails`, in both the path form and the value-object form Entra and Okta each send |
| `DELETE /Users/{id}` | deprovision (disable); 204; repeating it is 204 too |

A create takes `userName` as the email (lowercased, validated as sign-in does), `name`
(`displayName`, or `givenName` + `familyName`), `externalId`, `active` (default true) and ignores
unknown attributes. `active: false` on create makes a disabled account. The response is the SCIM
User with `meta` (`resourceType`, `created`, `lastModified`, `location`). Roles, passwords and
`groups` on a User are read-only: group membership is changed through Groups.

**Groups.**

| Request | Does |
|---|---|
| `GET /Groups?filter=displayName eq "…"` | list/find |
| `POST /Groups` | create, with members (user ids) |
| `GET`, `PUT`, `PATCH`, `DELETE /Groups/{id}` | `PATCH` `add`/`remove` on `members` (path and value forms) and `replace` on `displayName`; DELETE removes the group and the memberships it gave |

Members are Ronne user ids already provisioned by this provider; an unknown id is 400
`invalidValue`. After any change, the group's mapping (106) is applied to its members and only
those memberships marked with this provider change.

**Reconciling.** One user can come from the provider's SCIM and its sign-in at once; the plugin
keeps the link (`externalId`, provider) and tells Ronne "active" or "not active" across sources.
Ronne is disabled only when no source is active (one provider today, but the rule is the plugin's
and two providers are allowed). Reactivating clears `disabled_at` and does not create a session.
Disabling goes through the same service as Disable user (008), so tokens and sessions end the same
way, and the last-root rule is enforced there.

**In Admin › Users.** A provisioned account shows a *Managed by <provider>* badge. Its name and email
are read-only while SCIM is on (the provider is the source), *Disable* and *Enable* warn that the
provider will overwrite the change at its next sync, and a deprovisioned account shows *Deprovisioned
by <provider> on <date>* with **Erase** (103).

**Transactions.** Every write is one database transaction (the plugin requires it), with the user
rows locked in id order as 092's member changes do, so two requests for one user, or a group
change racing a sign-in, can't interleave.

**Phones:** the SCIM section is a stack of the same parts as 106's panel.

## Edge cases

- **The provider sends `PATCH` with `value: "False"`/`"false"`** (Entra's habit): treated as boolean.
- **Create for a deprovisioned user** (same `externalId`): reactivates the account (201 per the
  plugin) rather than creating another.
- **A user in a mapped group is deprovisioned:** the memberships stay; the account is disabled and
  can't act, and enabling restores it, as disabling by hand does (008).
- **A SCIM request for a root:** 403 with `detail: "root accounts are managed in Ronne"`; it
  appears in the audit; a Group naming a root as a member skips that member and logs it.
- **Email change via SCIM to one that exists:** 409 `uniqueness`.
- **Provider and Ronne disagree after root edits by hand:** the next SCIM update from the provider
  wins for the fields it manages (name, email, active); roots are told in Admin › Users.
- **Revoking the token mid-sync:** the in-flight request finishes; the next gets 401.
- **Backup/restore (099)** carries the token hashes; `rotate-secret` needs nothing (hashes, not
  encrypted). `revoke-access` (098) also revokes SCIM tokens, and `rmk-server disable-sso` (106)
  turns SCIM off.
- **A deleted provider** (106) loses its SCIM links and tokens; accounts stay.
- **Time:** `meta` times are UTC ISO 8601; the Users list is ordered by creation then id so
  paging is stable.

## Documentation

- **Administration → Authentication** (106's topic, new sections `scim`, `scim-groups`): what SCIM
  does and doesn't, turning it on, the token, each provider's steps (Entra, Okta, Authentik, Auth0;
  Keycloak needs a community extension and the guide says so), what deprovisioning does, mapping
  groups, protections.
- **Administration → Users** (`admin#users`): *Managed by*, *Deprovisioned by*.
- **Incidents:** a leaver or a compromised provider (disable SCIM, revoke the token).
- **API:** a page for the SCIM endpoints, the supported filters and PATCH shapes and the errors.
- **Helpers:** on the SCIM section, "What does the provider need?" → `authentication#scim`;
  on *Managed by*, "Why can't I edit this?" → `authentication#scim`.

## Acceptance criteria

- [ ] With SCIM on, the sample requests an Entra and an Okta test tenant send (users create, find
  by `userName eq`, patch `active`, patch name, group create and member add/remove) get correct
  SCIM responses.
- [ ] A created user is a `user` in `global` with a personal workspace and no password; the same
  request twice is 409.
- [ ] `active: false` and `DELETE` disable the account, delete its sessions and revoke its tokens in
  one transaction; the web and a `rmk_` token stop working at once; reactivation enables it.
- [ ] A group's members get the mapped workspace role marked as from the provider and lose it when
  removed; hand-set memberships and roots are untouched.
- [ ] A bad, revoked, rotated-out or other provider's token gets 401 in SCIM format; a rotated token
  works for 24 hours.
- [ ] The last enabled root can't be disabled or changed by SCIM; a root is refused.
- [ ] The SCIM token is stored only as a hash and appears in no log or audit row.
- [ ] Tests run on SQLite, PostgreSQL, MySQL and MariaDB (transactions and locks included).
- [ ] The pages pass the phone sweep (065).
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **Deprovisioning disables and never erases** (Claude): erasing is irreversible, and a mistaken
   sync must not destroy a person's published items' record; 103 is where root erases, and this
   feature links to it.
2. **A SCIM create doesn't adopt a manual account** (Claude, following the plugin: it never matches
   by email alone): adopting by email lets a provider take over an account with a typed address.
   The person signing in once through the provider (106) links it.
3. **Memberships stay when a user is deprovisioned** (Claude): same as disabling by hand (008).
4. **One token per provider, rotation overlaps 24 hours** (Claude): identity providers rotate
   credentials by hand and should not break in between.
5. **The plugin's tables, Ronne's routes** (Claude, task 1 decides): the endpoint lives at the path
   the owner listed (`/api/v1/scim/v2`), behind Ronne's own guard and error shape.

## Open questions

- **Does 103 land first?** This feature links to *Erase*. Without 103, the badge shows the date and
  the link is hidden until 103 exists (the task says so).
- **Entra's SCIM quirks:** group `members` as `value` strings and boolean-as-string patches are
  covered above; we can only test against recorded request shapes, not a live tenant, in CI.
