# 106 — Identity providers and OIDC sign-in

> Milestone: M16 · Depends on: 122, 105, 006, 008, 091, 092, 114 · Design: [MVP §14.3](../../MVP/MVP.md#143-sso--planned-as-m16) · Contracts: none new

## Goal

Root connects Ronne to the company's identity provider from the browser, without touching files or
environment variables, and people then sign in with it. The platform is abstract: an **identity
provider** is a configured instance of a **provider type**, and OpenID Connect is the first type.
SAML or LDAP later add a type, not a new page. Every provider comes with step-by-step instructions
for setting it up on the provider's side.

## Scope

**In:**
- **Identity providers on the Authentication tab** (122), a new panel: the list (name, type,
  issuer, email domains, status, last sign-in) and **Add provider**. Root only (`settings.manage`).
- **The provider type contract** (in the identity domain), so a type is one module:

  | Part | What it gives |
  |---|---|
  | `id`, `label` | `"oidc"`, "OpenID Connect" |
  | `fields` | what root types and the Add/Edit form renders (and which field is the secret) |
  | `parse(input, previous)` | checks it and splits it into the stored config and the secret (a blank secret keeps the stored one); `needsRetest(before, after)` says whether a change clears the test |
  | `start(provider, { next })` | the URL to send the browser to |
  | `complete(provider, request)` | the verified identity: `{ subject, email, emailVerified, name, groups }` |
  | `test(provider)` | discovery and key checks, and the dry-run sign-in |
  | `instructions(provider, { redirectUri })` | the setup steps shown beside the form |

  Only the type knows about OIDC; the list, the sign-in page, linking, provisioning, group mapping
  and audit are written against the contract.
- **The OpenID Connect type**, the authorization-code flow with PKCE, state and nonce, a small
  flow of Ronne's own on `oauth4webapi` (MIT); Better Auth only opens the session (Decision 3).
- **Presets**, which fill the form and choose the instructions: Google Workspace, Microsoft Entra
  ID, Okta, Keycloak, Authentik, Auth0, and **Other OpenID Connect**. A preset is data (a label,
  an issuer pattern with the pieces root fills in such as `{tenant}` or `{domain}`, default scopes,
  where its groups claim is, and its steps), not code.
- **Setup instructions in the form**: beside it, numbered steps for the chosen preset, starting
  with **the redirect URI to copy**, `<PUBLIC_URL>/api/auth/sso/callback/<provider id>`, then what
  to create on the provider's side, which values to bring back, and which claims Ronne reads. The
  full guides, with screenshots, are in the Documentation (one page per preset).
- **Sign-in with a provider:** the sign-in page shows **Continue with <name>** for each enabled
  provider, under the password form (or alone, see the password policy); the flow returns to
  `next`.
- **Accounts:**
  - an existing account is **linked by verified email** (the provider's `email_verified` must be
    true; the link is an `account` row, `provider_id` the provider's id);
  - for the **domains root lists**, a person with no account gets one on first sign-in, as a `user`
    in `global` with a personal workspace (114), written by the same repository code as Create
    user (008, 092: the user, its `global` row and its personal workspace, in one READ COMMITTED
    transaction) with Create user's name rule, but no password, and never root;
  - everyone else is refused with a message that says to ask root.
- **IdP groups to workspace roles:** per provider, root maps a group (a value in the groups claim)
  to a workspace and a role there (user, moderator or admin). The memberships are applied at
  every sign-in and marked as coming from that provider (`workspace_members.source`), so removing
  the person from the group removes only what the group gave, never what root set by hand.
- **Password sign-in policy** (the Sign-in methods panel): *Everyone* (default) or *Root only*.
  With "Root only", people other than root can sign in only with a provider; root keeps the
  password form behind a "Use your password (root)" link (below). It can be chosen only when a
  provider is enabled and has passed its test.
- **Test before you trust it:** *Test connection* (discovery document, issuer matches, keys
  fetched) and *Test sign-in* (root signs in with the provider in a new tab; Ronne shows the claims
  it received, and what it would do with them, and **changes nothing**). A provider can be enabled
  only after a passing *Test sign-in* by the root who enables it; editing the issuer, client,
  secret or scopes clears it, and turns an enabled provider off until it passes again (audited as
  turned off, `reason: "retest"`).
- **Lockout protection:** root's password sign-in cannot be turned off, by anyone, anywhere. A
  new terminal command, `rmk-server disable-sso`, turns every provider off and sets the password
  policy to *Everyone*, for when a provider breaks, like `revoke-access` and `rotate-secret` (098):
  it asks first (`--yes` doesn't), signs nobody out, keeps the providers' settings, links and group
  memberships, and is audited as the command line's (`via: "cli"`). `rotate-secret` re-encrypts the
  providers' client secrets under the new `AUTH_SECRET` in the same transaction; a restore under
  another `AUTH_SECRET` marks each provider it can't read *Failing* ("Enter the client secret
  again").
- **Audit events** (007): `auth.sso_signed_in { provider }`, `auth.sso_failed { provider, reason }`
  (`unverified_email`, `not_allowed`, `disabled`, `invalid_response`, `provider_error`, and
  `unavailable`, `expired`, `rate_limited` before the provider is asked),
  `user.created { via: "sso", provider }`, `user.sso_linked { provider }`,
  `instance.auth_provider_created | updated | deleted | enabled | disabled { provider }` and
  `instance.password_sign_in_changed { from, to }`. Group changes use `workspace.member_added |
  member_role_changed | member_removed` with `via: "sso"`.

**Out** (and where it goes instead):
- **`rmk login` for people without a password** → 107.
- **Automatic provisioning and deprovisioning by the provider (SCIM)** → 108.
- **SAML and LDAP.** Not built; the contract is why they can be added (MVP §14.3).
- **Provider-initiated sign-in** (the IdP's app tile): not supported; people start at Ronne.
- **Logout at the provider** (single logout): signing out ends the Ronne session only.
- **A session length per provider.** Every provider's sessions last 24 hours (decision 12), and
  end at once when the account is disabled (006).
- **Making someone root or setting the instance role from a claim.** Never: root is made in Admin
  › Users only.

## Behaviour

**The panel.** Rows show the name, "OpenID Connect · Okta" (type and preset), the issuer, the
domains, a status badge (*Off*, *Tested*, *On*, *Failing* when the last test failed or after
three failed sign-ins in a row) and the last sign-in. Each row opens the provider's page, where it
is edited, tested, turned on or off, and deleted (confirm; accounts linked to it keep their linked
rows and can still sign in with a password, if they have one). No providers yet: a short
explanation and **Add provider**.

**Add / Edit provider** (a page, `/admin/settings?tab=authentication&provider=<id|new>`, so the
steps can sit beside the form on a desktop and under it on a phone):
1. **Type and preset.** One type today, so it opens on the presets as cards.
2. **Details.** Display name (shown on the sign-in button), issuer URL (the preset says what goes
   where, with its placeholders), client ID, **client secret** (write-only: after saving, "Secret
   saved", Replace; never read back), scopes (the preset's default, `openid email profile`, plus
   the groups scope when groups are mapped).
3. **Who may sign in.** *Email domains this provider signs in* (comma-separated): a new address
   in them gets an account on first sign-in, and an existing account with one is linked when *Link
   existing accounts by verified email, in these domains only* is on (the default). Empty means
   only accounts already linked can sign in; so does turning linking off, for existing accounts.
4. **Groups.** The claim name (the preset's default, usually `groups`), and rows *group → workspace
   → role*.
5. **Test, then turn on.** The two tests, with their results written out ("Issuer
   `https://…` answered; the keys were fetched; the response has `email_verified`; groups claim
   found: 3 values"). *Test connection* is a server action; a failure marks the provider *Failing*.
   *Test sign-in* is a plain form posting to `POST /api/auth/sso/test/<id>` in a new tab (a server
   action is intercepted and stays in the same tab): root only, from Ronne's own pages (the
   `Origin` must be `PUBLIC_URL`'s). It runs the sign-in for the version of the provider the page
   showed; at the callback, only in the browser of the root who started it, it shows the claims,
   what a sign-in would do (the decision and the group changes, worked out without writing them),
   and records the passing test (the email verified) for that version. The result is kept an hour
   for that root's page.
The provider's **id** (a slug, chosen once, 3–32 characters, lowercase letters, digits and `-`,
starting and ending with a letter or digit) is in the redirect URI and can't be changed; it can't
be `credential` or `new` (the form's address) or collide with another provider.

**Secrets.** The client secret is encrypted before it is stored (key derived from `AUTH_SECRET`,
AES-256-GCM, a fresh nonce per value), shown nowhere, redacted by the logger (100) and left out of
every audit row (which says only that it changed). `rmk-server rotate-secret` re-encrypts the
stored secrets (it has both keys in the same run); `backup` (099) carries them encrypted. It is
decrypted only in memory, for the token request, and never copied into another table.

**Where the data lives.** Ronne owns a table, `identity_providers` (id, type, name, preset, enabled,
tested_at, `config` JSON without secrets, `secret_enc`, domains, link_by_email, groups claim,
created/updated); and a `provider_group_mappings` table (provider id, group, workspace id, role).
No library keeps a copy. `workspace_members` gains `source` (null, or the provider id). A sign-in
in progress (the PKCE verifier, `state`, `nonce`, `next` and whether it is a *Test sign-in*) is a
`verification` row keyed by the state's hash, expiring after 10 minutes and deleted on first use
(an abandoned one is deleted once expired, by a later start, at most once a minute),
and the state is also in a short-lived `HttpOnly`, `SameSite=Lax` cookie, so the callback only
finishes in the browser that started it.

**Signing in.** The sign-in page lists the enabled providers as buttons. A server action asks the
type for the authorization URL (with a fresh PKCE verifier, `state` and `nonce`) and redirects.
The callback `GET /api/auth/sso/callback/<id>` is a route of Ronne's own (a Next.js route beside
Better Auth's catch-all, which stays limited to its allowlist, 006); it validates the response,
then `complete` returns the identity and Ronne decides:
1. **Verified email required.** `email_verified` must be `true` (or `"true"`). Entra never sends
   it: for the Entra preset only, and only when `email_verified` is absent, `xms_edov: true` (the
   email's domain is verified in the tenant) counts instead; the preset says to turn on the
   optional `email` and `xms_edov` claims, and the test shows when they are missing. Otherwise
   `unverified_email`.
2. **A disabled account** is refused (`disabled`), with the same message as no account at all
   ("You can't sign in here with that account…", 006's rule: it doesn't say which accounts
   exist); the audit row has the real reason.
3. **Known link** (the provider and subject): sign in.
4. **Else, an account with this email**, *link by email* on, and the email's domain on the
   provider's list (decision 9; root's account too): link, then sign in. Otherwise `not_allowed`.
   Every `not_allowed` says why, in a *Test sign-in*'s result and in the audit row's `why`
   (`domain_not_allowed`, `non_ascii_email`, `invalid_email`, `lookalike_email`, `link_off`,
   `domain_not_listed`, `linked_to_another`);
   the person sees one message for all of them.
5. **Else, the email's domain is on the list:** create the account (Create user's repository
   write: `user` in `global`, personal workspace; no password; the name by Create user's rule),
   link, sign in.
6. **Else** `not_allowed`.
Then the groups are applied (below) and the session is created like a password one without
*Remember me* (decision 12): the same cookie, but a browser-session one, and 24 hours at most,
never extended (Better Auth skips the refresh because of its signed `dont_remember` cookie).
A session made to replace the one a request is signed in with (changing the password, turning
two-factor on or off, which Better Auth would make for 30 days) never outlives it: the session
hook caps it at the current session's expiry, for every session, a password one without *Remember
me* included. A password sign-in with *Remember me* that works (a failed attempt changes nothing)
clears a `dont_remember` cookie a provider's
session left in that browser, so it lasts and is extended like any remembered one (two-factor's
second step included, which reads that cookie). It's a safety net, not a hard cut-off: someone who deletes the `dont_remember`
cookie on purpose gets their session extended like a remembered one, and `rmk` tokens don't
depend on sessions. Disabling the account in Ronne, or SCIM (108), is the hard cut-off. Audited
as `auth.signed_in` (`remember: false`), plus `auth.sso_signed_in`, by a server-only Better Auth
endpoint
(`SERVER_ONLY`, so it is a 404 over HTTP even without the allowlist) that takes the user Ronne
chose; the disabled-account check on session creation (006) still runs. Two-factor (105) isn't
asked.

**Groups.** At each sign-in, for each mapped group the person is in, make sure the membership
exists with at least the mapped role, marked `source = provider`; for each membership marked with
this provider whose group they left, remove it (or lower it to what another mapping still gives).
A membership root set by hand (`source` null) is never touched by a mapping, even to raise or lower
it; nor is one another provider gave. One exception: the plain `user` row in `global` that every
account has, which a mapping to `global` may take over (it is then the provider's); when the group
goes, it goes back to a hand-set `user`, since nobody leaves `global` (092). A person's change to a
membership a group gave (Members' change of role, adding them again) makes it hand-set: the
provider no longer changes or removes it. Deleting a provider's last mapping still removes what
the mappings gave, at each person's next sign-in. A group mapped to a
workspace that no longer exists is skipped and shown as a warning in the form. Root is never
changed. A missing groups claim changes nothing (missing isn't "in no group": Entra leaves it out
past 200 groups). The groups are applied in the sign-in's transaction, each change audited
(`workspace.member_added | member_role_changed | member_removed`, `via: "sso"`, the provider).

**Mappings** are saved with the provider (an update event names `group mappings` when they
changed). Each is a group exactly as the provider sends it (1–255 characters, compared byte for
byte), an existing workspace that isn't someone's personal one, and a role (user, moderator or
admin); the same group and workspace twice keeps the last.

**Password policy and the sign-in page.** With *Root only*, the page shows the provider buttons
first and, under them, a link "Use your password (root)" (a disclosure, so it works without
JavaScript) that opens the password form; non-root accounts that try the password get the usual
wrong-email-or-password error (audited `password_disabled`, or `disabled`), after running the
same password check for a reserved address no account has, so the answer takes as long as root's
(timing doesn't tell which address is root's; about 1 ms remains, accepted by the owner). No
account may have a `.invalid` address (RFC 2606), which keeps the reserved one free. A two-factor challenge someone other than root got before the switch can't finish
afterwards (refused like a disabled account, before any session). The token exchange
(`POST /api/v1/auth/token`) answers 403 `password_sign_in_disabled` to a non-root account that sent
the right password (a wrong one gets the usual 401). The change needs an enabled, tested provider
and a confirm that says how many people lose their password sign-in (active, with a password, not
root). *Root only* holds only while a provider is on: with every provider off (or after
`disable-sso`), the page shows the password form and everyone may use it again. With
*Everyone*, the buttons sit under the password form. The Sign-in methods panel lists the password
rule and each provider, on or off.

**Allowlist and security.**
- Better Auth's HTTP allowlist stays `/get-session` and `/ok`: the new HTTP routes are Ronne's own
  (the callback, and *Test sign-in*'s start), and the session endpoint is server-only. Registering a provider is only
  through Ronne's action.
- The issuer must be `https://` (or `http://` on loopback, `localhost`, `127.0.0.1` or `[::1]`,
  for development and tests), with no credentials, query or fragment, is fetched
  without following redirects (`oauth4webapi` refuses them), and its discovery document's issuer
  must equal what root typed. Private addresses are allowed on purpose (a company's Keycloak is on
  one); only root can enter an issuer.
- The `next` after sign-in is the same relative-path rule as 006 and is kept with the sign-in in
  progress (above), not in the URL root registered.
- The ID token's `iss`, `aud`, `exp` and `nonce` are checked by `oauth4webapi`, and its
  **signature** against the issuer's keys too: the library skips that by default for a token from
  the token endpoint (OIDC Core 3.1.3.7 lets TLS stand in), so Ronne always calls
  `validateApplicationLevelSignature`. Ronne also requires `sub`, and checks `iat` itself (the
  library only checks that it is a number): no later than now, with the clock leeway below. There
  is no lower bound: Entra sets `iat` to when the person authenticated, which for a browser that
  still has its Entra session is long before the sign-in started. A token is tied to this sign-in
  by its nonce, the single-use state and PKCE, not by its age (bugfix:
  [`docs/bugfixes/entra-iat-before-sign-in`](../../bugfixes/entra-iat-before-sign-in/SPEC.md)).
- Callback errors go to `/sign-in?error=<code>` with a plain message: the five reasons above, plus
  `unavailable` (the provider is off or gone), `expired` (no state cookie, another browser's, used
  already, or older than 10 minutes) and `rate_limited`. The provider's error text is logged
  (redacted), not shown.
- Ronne's limiter, per client IP when `TRUST_PROXY=true`, covers the start action and the callback:
  30 a minute each (a company behind one address signs in together), apart from the password
  limit. When the address can't be known (no trusted proxy), the starts share one bucket for the
  instance, and the callbacks another: 300 a minute each (decision 11). A flood then holds up
  provider sign-in for a minute at worst; passwords still work. A start costs little anyway: the
  discovery document is kept for 10 minutes for starts (only a good one), so a start asks the
  provider nothing, and its row is deleted once expired. The callback and *Test connection* always
  fetch it: `oauth4webapi` keeps the provider's keys on the document, so a kept one would check ID
  tokens against keys the provider may have rotated (found in CI, 2026-10-17).
- Everything is logged with the request's ID and the provider's id (100), never a token or a secret.

**Phones and keyboards.** The cards, the steps and the mapping rows work at phone width; the
sign-in buttons are 44px tall on a coarse pointer.

## Edge cases

- **The provider is down or misconfigured:** the sign-in page shows its button anyway; the callback
  fails with `provider_error` and "That provider didn't answer. Try again, or use your password."
  The panel marks *Failing* after repeated failures. `rmk-server disable-sso` is the way out.
- **Two providers with one email domain:** allowed; each person's first sign-in decides which
  provider is linked. An account can be linked to several providers.
- **The same email in two providers by two different people** (the provider reuses addresses): the
  linked subject, not the email, identifies a person after the first link; a new subject of the
  same provider with an already-linked email is refused (`not_allowed`) rather than linked to
  someone else's account. Another provider's verified email still links when the domain is on
  that provider's list too (an account can be linked to several providers, as when a company moves
  from one provider to another): root trusts every provider it turns on with link by email for its
  own domains, as it trusts a password account's email.
- **An email that isn't plain ASCII** is never matched to an account or used to create one
  (`not_allowed`): lowercasing folds some characters into ASCII ones (the Kelvin sign `K` into
  `k`), which would hand a provider's `Kate@…` someone else's `kate@…`. Only ASCII spaces around it
  are trimmed; a no-break space or a byte-order mark makes it not plain ASCII. Nor is an account whose
  stored address the database only calls equal (MySQL and MariaDB compare without accents, so
  `kate@…` would find `kåte@…`): only the exact address links.
- **A person changes email at the provider:** the link stays (it is by subject); the Ronne email
  does not change.
- **Root signs in with a provider:** allowed if linked (by email); nothing from a claim changes
  root, and groups never apply to root.
- **Deleting a provider that has linked accounts:** its group-given memberships are removed (in
  `global`, which nobody leaves, the role goes back to a hand-set `user` instead); people without a
  password can't sign in until root resets one (008) or adds another provider.
- **Turning off a provider:** nobody signs in with it; their links and group memberships stay.
- **Clock skew:** 5 minutes of leeway: on `exp` and `nbf` through `oauth4webapi`'s
  `clockTolerance` (its default is 30 seconds), and on the future side of `iat` in Ronne's own check.
- **Two roots edit one provider at once:** the first save wins; the other form is stale and says
  so (a version check on save: the update applies only to the version the form was opened with, so
  two saves at the same moment can't both land). A *Test sign-in* counts only for the version it
  started on: a save during the test makes it count for nothing.
- **Restoring a backup (099)** onto an instance with the same `AUTH_SECRET`: providers keep
  working; with another, the secrets can't be decrypted and the panel shows the provider as
  *Failing* with "Enter the client secret again".
- **The provider's group claim is too large** (Entra's "groups overage"): the claim is missing; the
  test says so and the preset's steps say to filter the groups to those Ronne maps.

## Documentation

- **Administration → Authentication** (a new topic `authentication`, with sections `overview`,
  `providers`, `groups`, `password-policy`, `lockout`; in ronne-web en/pt/fr and
  `apps/web/src/components/help/topics.ts` together): how it fits together, adding a provider,
  mapping groups, the password policy, `rmk-server disable-sso`.
- **One guide per preset**, each a section of that topic: `google`, `entra`, `okta`, `keycloak`,
  `authentik`, `auth0`, `other-oidc`. Each has the same shape: what to create at the provider, the
  redirect URI, the values to bring back, the claims and the groups, ending with a link to the
  usual mistakes, which are the same for every provider and live in `providers`. The in-form
  instructions are the short version, and link to these.
- **Signing in** (a new section `account#signing-in`, since the sign-in page has no topic of its
  own): signing in with a provider and with a password, and what each message back means.
- **Administration → Settings** (`admin#settings`) and **Security** (`security#security`): the
  Authentication tab, the allowlist, the secret handling. **Incidents:** a provider is broken or
  compromised (`disable-sso`, `revoke-access`).
- **Helpers:** on Add provider, "Where do I find these values?" → the chosen preset's guide; on the
  redirect URI, "Why this address?" → `authentication#providers`; on Groups,
  "How are groups applied?" → `authentication#groups`; on the password policy,
  "Can root be locked out?" → `authentication#lockout`. The Sign-in methods helper ("How do people
  sign in?") moves to `authentication#overview`. Also updated: `rmk#login`
  (`password_sign_in_disabled`) and `backups#restore` (an unreadable client secret).

## Acceptance criteria

- [ ] Root adds an OpenID Connect provider from a preset, sees the redirect URI and the steps,
  passes *Test connection* and *Test sign-in*, and turns it on; before the test it can't be turned on.
- [ ] A person with a linked or email-matching account signs in with the provider and lands on
  `next`; unverified email, a disabled account and an unlisted domain are refused with the audited
  reasons.
- [ ] First sign-in from a listed domain creates a `user` in `global` with a personal workspace, no
  password and no root role; an unlisted domain creates nothing.
- [ ] Group mappings add and remove only the memberships they gave; a hand-set membership is never
  lowered or removed; root is never changed.
- [ ] The client secret is encrypted at rest, never returned by any action, never in a log or an
  audit row (tests inspect all three), and `rotate-secret` re-encrypts it.
- [ ] The new HTTP routes are the callback and *Test sign-in*'s start (root only, same origin);
  Better Auth's allowlist is unchanged and the session endpoint returns 404 over HTTP.
- [ ] *Root only* hides password sign-in for others, keeps it for root, can't be chosen without a
  tested enabled provider, and the token exchange answers `password_sign_in_disabled` correctly.
- [ ] `rmk-server disable-sso` turns all providers off and restores password sign-in for everyone.
- [ ] A fake provider (test double speaking OIDC) covers the flow on SQLite, PostgreSQL, MySQL and
  MariaDB; the end-to-end test signs in through it.
- [ ] The pages pass the phone sweep (065).
- [ ] The Documentation, the seven guides and inline helpers listed above say what the feature does now.

## Decisions

1. **An abstract provider type contract, OpenID Connect first** (owner, 2026-10-15), so SAML and
   LDAP are a type each.
2. **Presets are data with instructions** (owner, 2026-10-15): setup is the hard part for a company,
   so the app shows the redirect URI and the steps beside the form.
3. **Ronne owns the provider tables, and no library keeps a copy** (Claude): the UI, the
   encrypted secret and the group mapping are Ronne's, so they can't depend on a library's storage.
   **The flow is Ronne's own on `oauth4webapi`** (task 1, 2026-10-16; the evidence is in PLAN.md's
   Notes). `@better-auth/sso` loads its SAML libraries (`samlify`, `@xmldom/xmldom`,
   `fast-xml-parser`) whatever is configured, stores the client secret in clear in its own table,
   sends no `nonce`, and serves routes of its own. `genericOAuth` fixes its providers when the
   instance starts and runs discovery then, and its callback creates and links accounts by Better
   Auth's rules, so the decision list and a *Test sign-in* that changes nothing would fight it.
   `oauth4webapi` has no dependencies, is OpenID Certified, and is by the author of `jose`, which
   Better Auth already uses. The type contract is the same either way.
4. **Groups map to workspace roles only** (owner's list, 2026-10-06; instance roles are user and
   root, 091): never to root.
5. **Test sign-in required before turning on, and root's password can't be switched off**
   (Claude): a typo in the issuer must not lock a company out.
6. **Verified email is required to link** (Claude): an unverified address at a provider would let
   anyone claim an existing account.
7. **Single logout and provider-initiated sign-in are out** (Claude): both need more of the
   provider than most companies configure.
8. **A new account is always a `user` in `global`** (owner, 2026-10-17): for every listed domain,
   with no per-domain role. Higher roles come from group mappings or from root.
9. **Link by email only within the provider's domains** (owner, 2026-10-17): a provider can claim
   an existing account by its verified email only when the email's domain is on that provider's
   list, so a provider for `acme.com` can't take over a `gmail.com` account. Root's account links
   too: root may sign in with a provider. (Task 11.)
10. **Group mappings may raise roles in `global`** (owner, 2026-10-17): root chooses each mapping
    and every change is audited. A mapping takes over only the default `user` row; a role root set
    by hand is never changed.
11. **Sign-in starts are limited and cheap without a trusted proxy too** (owner, 2026-10-17): when
    the client's address isn't known, the starts and callbacks share one bucket for the instance;
    the discovery document is cached for starts, and expired sign-ins in progress are deleted.
    (Task 12.)
12. **A provider's session lasts 24 hours** (owner, 2026-10-17), not 30 days: someone disabled at
    the provider loses Ronne within a day without SCIM (108); signing in again is usually one click.
    (Task 13.)
13. **CI tests against the fake provider only** (owner, 2026-10-17): a real Keycloak nightly only
    if a real provider ever behaves differently from it.
