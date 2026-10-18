# 108 — SCIM provisioning

> Milestone: M16 · Depends on: 106, 092, 103 · Design: [MVP §14.3](../../MVP/MVP.md#143-sso--planned-as-m16) · Contracts: RFC 7643 and 7644

## Goal

The company's identity provider creates, updates and removes Ronne accounts by itself, and keeps
workspace membership in step with its groups. When someone leaves, their access ends at once,
without root remembering to do it. Ronne's own Users and Groups endpoints on its own tables,
behind the same provider contract as 106 (task 1 read Better Auth's `@better-auth/scim@1.7.7` and
chose not to load it: Decision 5).

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
  and, in the same transaction, revokes its personal access tokens and deletes its sessions. After
  `active: false`, a later `active: true` enables it again; after `DELETE`, the link is gone and the
  account comes back only through a new create with the same `externalId` (Edge cases). Deleting
  never erases data: the account shows *Deprovisioned by
  <provider>* in Admin › Users, with the link to erase it (103) for root.
- **Groups:** a SCIM group's members get the workspace role 106's mapping gives that group, marked
  as coming from the provider (`workspace_members.source`), added and removed as the group changes,
  and never touching hand-set memberships. Groups with no mapping are stored and grant nothing.
- **Protections:** SCIM never touches a root, never leaves the instance without an enabled root
  (059), never removes anyone from `global` (092), and can't set a role.
- **Audit events** (007), actor *the provider* (shown by name): `user.created { via: "scim" }`,
  `user.scim_adopted { provider }`,
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
- **Matching an existing manual account on SCIM create by email alone.** A SCIM create whose
  email belongs to an account not linked to this provider is answered 409 `uniqueness`; root links
  the two by having the person sign in once through the provider (106 links by verified email),
  after which the provider's next create can adopt the account, on the conditions of the Users
  table's `POST /Users` row (Decision 2).
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
checks SCIM is on, and refuses everything else (no header, another scheme, an `rmk_` token, an
unknown, revoked or rotated-out token, SCIM off) with one answer: 401 in the SCIM error format (RFC
7644 §3.12, `application/scim+json`, `status`, `scimType`, `detail`) and `WWW-Authenticate: Bearer`;
the audit log and the logs keep the reason (`scim.request_refused`). A rate limit applies per token
(600 requests a minute) and to refusals per client address (20 a minute; when the address can't be
trusted, 100 a minute for the instance); past it the answer is 429 with `Retry-After`, and refusals
aren't audited, so a flood can't fill the audit log. `Cache-Control: no-store` on every answer.
Cookies are ignored. An unknown path is 404 and a method a path doesn't take is 405 (with `Allow`),
before any token is asked for; `Bulk` and `Me` are 501.

**Discovery.** `GET /ServiceProviderConfig` says: patch supported; bulk, filter (max 100 results,
only `eq` on `userName`, `externalId`, `id` and `displayName`), changePassword, sort and etag
unsupported; authentication scheme `oauthbearertoken`. `ResourceTypes` and `Schemas` describe the
core User and Group. These three are public, as the RFC allows.

**Users.**

| Request | Does |
|---|---|
| `GET /Users?filter=userName eq "a@b.com"&startIndex=&count=` | list (paged, 100 max); the filter the providers use to ask "does this exist?" |
| `POST /Users` | create (below). An existing account is adopted (201, a new link, no new account) only when all of these hold: its email is the `userName`, byte for byte; it is linked to this provider by its sign-in (106: an `account` row for the provider, which keeps its subject) and signed in through it in the last 30 days (an `auth.sso_signed_in` event for the account and provider), which narrows, without closing, the case of a leaver's account whose address went to someone new (Decision 2); it has no SCIM link on any provider, live or deleted; it isn't a root; and it is enabled. Adoption never enables an account (a disabled one is 409 and stays disabled) and never changes 106's link. 409 `uniqueness` on a `userName` or `externalId` of a live link on this provider, or an email that belongs to any other account. A deleted link is in no `uniqueness` check (RFC 7644 §3.6): a create with the `externalId` of this provider's tombstone links its account again (Edge cases); another provider's tombstones are never matched |
| `GET /Users/{id}` | one; `id` is the link's own id (`scim_users`), not the account's, so a deleted one never comes back |
| `PUT /Users/{id}` | replace the managed fields: `userName` (the email), `name`, `active`, `externalId` |
| `PATCH /Users/{id}` | `replace` (and `add`/`remove` where it makes sense) on `active`, `userName`, `name.*`, `displayName`, `emails`, in both the path form and the value-object form Entra and Okta each send |
| `DELETE /Users/{id}` | deprovision (disable) and end the SCIM link, which stays as a tombstone (for *Deprovisioned by*) keeping only its `externalId`; the link leaves every group of the provider, and every membership marked as this provider's goes (its SCIM groups', and any its sign-in gave before SCIM was on), so a re-create starts in none; 204. As RFC 7644 §3.6 asks, that id then gets 404 for everything (`GET`, `PATCH`, `PUT`, a repeated `DELETE`), lists and filters leave it out, and it counts in no `uniqueness` check |

A create takes `userName` as the email: only ASCII spaces around it are trimmed, a `userName` that
isn't plain ASCII is 400 `invalidValue` (as 106 refuses it: lowercasing folds the Kelvin sign into
`k`), and the rest is lowercased and validated as sign-in does. Every match on it (a live link,
adoption, another account's email) compares that lowercased address byte for byte, so Entra's
capitalised `Ann@…` finds `ann@…`. The same rule holds wherever a `userName` or email arrives: a
`PUT` or `PATCH` of `userName` or `emails`, and the value of a `userName eq` filter (so Entra's
`userName eq "Ann@b.com"` finds the link it made). A create also takes `name`
(`displayName`, or `name.formatted`, or `givenName` + `familyName`), `externalId`, `active` (default true) and ignores
unknown attributes. `active: false` on create makes a disabled account. The response is the SCIM
User with `meta` (`resourceType`, `created`, `lastModified`, `location`). Roles, passwords and
`groups` on a User are read-only: group membership is changed through Groups.

**Groups.**

| Request | Does |
|---|---|
| `GET /Groups?filter=displayName eq "…"` | list/find |
| `POST /Groups` | create, with members (SCIM user ids) |
| `GET`, `PUT`, `PATCH`, `DELETE /Groups/{id}` | `PATCH` `add`/`remove` on `members` (path and value forms) and `replace` on `displayName`; DELETE removes the group and the memberships it gave |

Members are SCIM user ids (live links) of this provider, sent as `[{ value }]` (or Entra's older
`["id"]`); an unknown or deleted id is 400 `invalidValue`, and a root named as a member is left out
and audited (`scim.request_refused { reason: "root_member" }`). A deleted link is in no group
(`DELETE /Users` takes it out), so no group lists an id that answers 404. A `PATCH` takes `add`,
`remove` (`members[value eq "…"]`, a value list, or no value for all) and `replace` on `members`,
and `replace` on `displayName` and `externalId`, with a path or as a value object; a `PUT` sets the
name, the external id and the members exactly (members left out means none).
`excludedAttributes=members` leaves the members out of an answer, as Entra asks when it checks a
group exists. A duplicate `externalId` on the provider is 409 `uniqueness`; two groups may share a
name. After any change, every member whose groups changed (all of them on a rename) gets the
provider's mappings (106) applied again from the groups they're in, through 106's own rules: only
those memberships marked with this provider change, a hand-set one never, root never, nobody leaves
`global`, and two mappings to one workspace give the higher role. A mapping's group matches a SCIM
group's `displayName` or its `externalId`, byte for byte (Entra's groups claim, and so its mappings,
often name groups by object id). While SCIM is on for a provider, its sign-in no longer applies the
groups claim: SCIM is the one source of that provider's groups (106's rules apply again once SCIM is
off). Turning SCIM on, or adopting an account, changes no membership: roles the provider's sign-in
gave before stay until the provider's first group change that includes the person, which applies the
mappings from SCIM's groups; a `DELETE` takes them away at once (owner, 2026-10-18). The
Documentation tells admins to assign groups in SCIM, so that change comes.

**Reconciling.** One user can come from the provider's SCIM and its sign-in at once; Ronne keeps
the link (provider, `externalId`, user) in its own table. An account has at most one SCIM link,
live or deleted (a create adopts only an account with none, and an email of any other account is
409), so one provider decides `active`; the account's sign-in links to other providers (106) don't.
Reactivating clears `disabled_at` and
does not create a session.
Disabling goes through the same service as Disable user (008), so tokens and sessions end the same
way, and the last-root rule is enforced there.

**In Admin › Users.** A provisioned account shows a *Managed by <provider>* badge, and an adopted
one *Adopted by <provider> on <date>* as well, so root can review each adoption. Its name and email
are read-only while SCIM is on (the provider is the source), *Disable* and *Enable* warn that the
provider will overwrite the change at its next sync, and a deprovisioned account shows *Deprovisioned
by <provider> on <date>* with **Erase** (103).

**Transactions.** Every write is one database transaction with the provider's row locked (the
lock 106's sign-in through that provider takes too) and then the account's row, so two SCIM
requests for one user, or a change racing a sign-in through the provider, run one after the
other; the account steps (disable, sessions, tokens) run inside it. Deadlocks the database
resolves are retried (113), and a unique index refusing a write (another provider took the email
at the same moment) answers 409 `uniqueness`.

**Phones:** the SCIM section is a stack of the same parts as 106's panel.

## Edge cases

- **The provider sends `PATCH` with `value: "False"`/`"false"`** (Entra's habit): treated as boolean.
- **Create for a deprovisioned user.** Matched by `externalId` only, never by `userName` alone
  (Decision 2). `externalId` must be the provider's immutable id for the person: Entra's default
  mapping sends `mailNickname`, an alias that can be given to someone new, so the Documentation's
  Entra steps map `objectId` to `externalId` instead, and say why. With a reusable `externalId`, a
  new person given an old one would come back as the old account. The link was ended by `DELETE`: a
  create with the `externalId` of this provider's tombstone links the same account again, with a new
  id (201), and enables it unless the create says `active: false`, taking the `userName` it sends
  (409 `uniqueness` if that email belongs to another account). It is in no group until the provider
  adds it again, as providers do after a create. A create with the tombstone's email but another
  `externalId`, or none, is 409 `uniqueness`: the address may have been given to someone else, who
  must not inherit the old account; root erases the old account (103) or changes its email. The
  account was deprovisioned by `PATCH active: false` (Entra's usual first step): its link is live,
  so a create with its `externalId` or `userName` is 409 `uniqueness`, and the provider sets
  `active: true` instead.
- **The person's email changed at the provider after a 106 link** (106 keeps the Ronne email): the
  create's `userName` matches no account, so it makes a second account for the same person, which
  they can't sign in to (106 signs them in to the first by subject). The first is outside SCIM: a
  later `DELETE` or `active: false` disables only the second, and the person keeps their access
  until root disables the first by hand, the only stopgap this feature has. The way to avoid it is
  before turning SCIM on: the Documentation's SCIM steps say to change those Ronne emails to the
  ones the provider will send (Admin › Users), and to have the people sign in through the provider
  in the 30 days before the first create, so it adopts them. Once a second account exists, the way back
  needs 103: root erases the second (which deletes its SCIM link and tombstone), changes the first's
  email, makes sure the first is enabled and the person has signed in through the provider within 30
  days (re-enabling it if root disabled it), and has the provider create the person again
  (unassigned and assigned there), which then adopts the first.
- **A user in a mapped group is deprovisioned by `active: false`:** the memberships stay; the account is disabled and
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
  does and doesn't, turning it on, the token, what to check before turning it on (the Ronne emails
  of people who sign in through the provider match what it will send; groups assigned in SCIM,
  since roles the sign-in gave stay until SCIM's groups change; leavers disabled, then and
  whenever someone outside SCIM leaves; only accounts that signed in through it in the last 30 days
  are adopted), each provider's steps (Entra, with `objectId` mapped to `externalId`; Okta,
  Authentik, Auth0; Keycloak needs a community extension and the guide says so), what deprovisioning
  does, mapping groups, protections.
- **Administration → Users** (`admin#users`): *Managed by*, *Adopted by*, *Deprovisioned by*.
- **Incidents:** a leaver or a compromised provider (disable SCIM, revoke the token).
- **API:** a page for the SCIM endpoints, the supported filters and PATCH shapes and the errors.
- **Helpers:** on the SCIM section, "What does the provider need?" → `authentication#scim`;
  on *Managed by*, "Why can't I edit this?" → `authentication#scim`.

## Acceptance criteria

- [ ] With SCIM on, the request shapes Entra and Okta publish (users create, find
  by `userName eq`, patch `active`, patch name, group create and member add/remove) get correct
  SCIM responses.
- [ ] A created user is a `user` in `global` with a personal workspace and no password; the same
  request twice is 409.
- [ ] `active: false` and `DELETE` disable the account, delete its sessions and revoke its tokens in
  one transaction; the web and a `rmk_` token stop working at once; `active: true` after the one,
  and a create with the same `externalId` after the other, enable it again.
- [ ] An existing account is adopted only on every condition of the `POST /Users` row (exact
  email, the provider's 106 link used within 30 days, no SCIM link anywhere, enabled, not root),
  never enabled by it, audited `user.scim_adopted` and shown *Adopted by* in Admin › Users; any
  other existing email is 409.
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
2. **A SCIM create doesn't adopt an account by email alone** (Claude; Better Auth's plugin doesn't
   either): adopting by email lets a provider take over an account with a typed address, or give a
   reused address the old owner's account. It adopts only an enabled, non-root account with no SCIM
   link anywhere that the provider already signs in to (106's link, made from a verified email and
   bound to a subject, which adoption keeps, so a recycled address still can't sign in) and that
   signed in through it within 30 days, so a company that used 106 before turning SCIM on doesn't
   get an error for every existing user (owner, 2026-10-18). The 30 days (owner, 2026-10-18, after
   the witness's case of a leaver whose address was reused) narrow that case without closing it: a
   leaver who signed in within the 30 days, is still enabled in Ronne, and whose address the
   provider gives to a new hire within them, is adopted for the new hire, who can't sign in to it
   (106 keeps the leaver's subject) but whose groups then give it roles, while the leaver's
   sessions, tokens and password (if the account has one) still work. The window stays open after
   SCIM is on, for every enabled, 106-linked account with no SCIM link: people outside the
   provider's provisioning scope, and the first account of the changed-email case. Root disabling
   leavers in Ronne, before turning SCIM on and whenever one of those people leaves after, and
   *Adopted by* in Admin › Users are what cover it. A deleted SCIM user is linked again only by its
   `externalId`, which must be the provider's immutable id (Edge cases).
3. **Memberships stay when a user is deprovisioned by `active: false`** (Claude): same as disabling
   by hand (008). A `DELETE` ends the link and with it the groups, so a re-create starts in none.
4. **One token per provider, rotation overlaps 24 hours** (Claude): identity providers rotate
   credentials by hand and should not break in between.
5. **Ronne's own tables and routes, not `@better-auth/scim`** (Claude, task 1; evidence in PLAN.md's
   Notes): the plugin can be made to fit, but only with a second Better Auth instance at `/api/v1`
   with native transactions, and Ronne's account, token, membership and audit code moved inside
   the plugin's transaction (AsyncLocalStorage around Kysely, or Ronne's tables declared to Better
   Auth, and Ronne's `authSchema` column mapping repeated for the second instance), with seven
   tables of its own where Ronne needs four (task 2). For two resources, `eq` on three
   attributes and a handful of PATCH paths, owning it costs less and keeps each request's work in
   one transaction of Ronne's own. The endpoint lives at the path the owner listed
   (`/api/v1/scim/v2`), behind Ronne's own guard and error shape. The plugin's answers to Entra's and
   Okta's request shapes are the reference for Ronne's tests, except where this spec decides
   otherwise (adopting an account the provider signs in to, Decision 2).

## Open questions

- **Does 103 land first?** This feature links to *Erase*. Without 103, the badge shows the date and
  the link is hidden until 103 exists (the task says so).
- **Entra's SCIM quirks:** group `members` as `value` strings and boolean-as-string patches are
  covered above; we can only test against the request shapes they publish, not a live tenant, in CI.
