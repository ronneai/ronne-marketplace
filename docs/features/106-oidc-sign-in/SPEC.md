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
  | config schema | Zod schema of what root types (and which fields are secret) |
  | form fields | what the Add/Edit form renders, from the schema |
  | `start(provider, { next })` | the URL to send the browser to |
  | `complete(provider, request)` | the verified identity: `{ subject, email, emailVerified, name, groups }` |
  | `test(provider)` | discovery and key checks, and the dry-run sign-in |
  | `instructions(provider, { redirectUri })` | the setup steps shown beside the form |

  Only the type knows about OIDC; the list, the sign-in page, linking, provisioning, group mapping
  and audit are written against the contract.
- **The OpenID Connect type**, the authorization-code flow with PKCE, through Better Auth's
  `@better-auth/sso` plugin (the fallback is in Decisions).
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
    in `global` with a personal workspace (114), made by the same service as Create user (008,
    092), never root;
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
  only after a passing *Test sign-in* by the root who enables it; editing the issuer, client or
  scopes clears it.
- **Lockout protection:** root's password sign-in cannot be turned off, by anyone, anywhere. A
  new terminal command, `rmk-server disable-sso`, turns every provider off and sets the password
  policy to *Everyone*, for when a provider breaks, like `revoke-access` and `rotate-secret` (098).
- **Audit events** (007): `auth.sso_signed_in { provider }`, `auth.sso_failed { provider, reason }`
  (`unverified_email`, `not_allowed`, `disabled`, `invalid_response`, `provider_error`),
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
- **A provider-specific session length.** SSO sessions last as long as "Remember me" ones (30
  days), and end at once when the account is disabled (006).
- **Making someone root or setting the instance role from a claim.** Never: root is made in Admin
  › Users only.

## Behaviour

**The panel.** Rows show the name, "OpenID Connect · Okta" (type and preset), the issuer, the
domains, a status badge (*Off*, *Tested*, *On*, *Failing* if the last test or sign-in failed) and
the last sign-in. Actions: Edit, Turn on / Turn off, Delete (confirm; accounts linked to it keep
their linked rows and can still sign in with a password, if they have one). No providers yet:
a short explanation and **Add provider**.

**Add / Edit provider** (a page, `/admin/settings?tab=authentication&provider=<id|new>`, so the
steps can sit beside the form on a desktop and under it on a phone):
1. **Type and preset.** One type today, so it opens on the presets as cards.
2. **Details.** Display name (shown on the sign-in button), issuer URL (the preset says what goes
   where, with its placeholders), client ID, **client secret** (write-only: after saving, "Secret
   saved", Replace; never read back), scopes (the preset's default, `openid email profile`, plus
   the groups scope when groups are mapped).
3. **Who may sign in.** Email domains (comma-separated) that may get an account on first sign-in;
   empty means nobody is created and only existing accounts are linked. Link existing accounts by
   verified email: on (turning it off means only accounts already linked can sign in).
4. **Groups.** The claim name (the preset's default, usually `groups`), and rows *group → workspace
   → role*.
5. **Test, then turn on.** The two tests, with their results written out ("Issuer
   `https://…` answered; the keys were fetched; the response has `email_verified`; groups claim
   found: 3 values").
The provider's **id** (a slug, chosen once, 3–32 characters, lowercase letters, digits and `-`)
is in the redirect URI and can't be changed; it can't be `credential` or collide with another
provider.

**Secrets.** The client secret is encrypted before it is stored (key derived from `AUTH_SECRET`,
AES-256-GCM, a fresh nonce per value), shown nowhere, redacted by the logger (100) and left out of
every audit row (which says only that it changed). `rmk-server rotate-secret` re-encrypts the
stored secrets (it has both keys in the same run); `backup` (099) carries them encrypted. If the
installed `@better-auth/sso` stores the secret in a table of its own in clear, task 1 records it
and the fallback applies: Ronne's own table holds the encrypted value and gives it to the plugin
per request.

**Where the data lives.** Ronne owns a table, `identity_providers` (id, type, name, preset, enabled,
tested_at, `config` JSON without secrets, `secret_enc`, domains, link_by_email, groups claim,
created/updated); and a `provider_group_mappings` table (provider id, group, workspace id, role).
`@better-auth/sso`'s own `ssoProvider` rows (if it needs them) are written from Ronne's on save and
are never the source of truth. `workspace_members` gains `source` (null, or the provider id).

**Signing in.** The sign-in page lists the enabled providers as buttons. A server action asks the
type for the authorization URL and redirects. PKCE, `state` and `nonce` are the plugin's. The
callback `GET /api/auth/sso/callback/<id>` is added to the HTTP allowlist (006) (and only that
route); it validates the response, then `complete` returns the identity and Ronne decides:
1. **Verified email required.** `email_verified` must be `true` (Entra often omits it: the Entra
   preset says to turn on the optional `email` and `xms_edov` claims, and the test shows when it
   is missing). Otherwise `unverified_email`.
2. **A disabled account** is refused (`disabled`), with the same message as a wrong password
   (006's rule: it doesn't say which accounts exist).
3. **Known link** (the provider and subject): sign in.
4. **Else, an account with this email** and *link by email* on: link, then sign in.
5. **Else, the email's domain is on the list:** create the account (same service as Create user,
   `user` in `global`, personal workspace, no password), link, sign in.
6. **Else** `not_allowed`.
Then the groups are applied (below) and the session is created like a password one (same cookie,
`auth.signed_in`, plus `auth.sso_signed_in`). Two-factor (105) isn't asked.

**Groups.** At each sign-in, for each mapped group the person is in, make sure the membership
exists with at least the mapped role, marked `source = provider`; for each membership marked with
this provider whose group they left, remove it (or lower it to what another mapping still gives).
A membership root set by hand (`source` null) is never touched by a mapping, even to lower it. A
group mapped to a workspace that no longer exists is skipped and shown as a warning in the panel.
Root is never changed. `global` stays (nobody is removed from it, 092).

**Password policy and the sign-in page.** With *Root only*, the page shows the provider buttons
first and, under them, a link "Use your password (root)" that opens the password form; non-root
accounts that try the password get the usual wrong-email-or-password error. The token exchange
(`POST /api/v1/auth/token`) answers `password_sign_in_disabled` to a non-root account that sent the
right password. The change needs an enabled, tested provider and a confirm that says who loses
their password sign-in.

**Allowlist and security.**
- Only the callback route joins `/get-session` and `/ok`; the rest of the plugin's routes (register,
  sign-in) stay 404, and registering a provider is only through Ronne's action.
- The issuer must be `https://` (or `http://localhost` for development and tests), is fetched
  without following redirects (the plugin refuses them), and its discovery document's issuer must
  equal what root typed. Private addresses are allowed on purpose (a company's Keycloak is on one);
  only root can enter an issuer.
- The `next` after sign-in is the same relative-path rule as 006 and is carried in the plugin's
  `state`, not in the URL root registered.
- The ID token's signature, `iss`, `aud`, `exp` and `nonce` are checked by the plugin; Ronne also
  requires `sub`.
- Callback errors go to `/sign-in?error=<code>` with a plain message; the provider's error text is
  logged (redacted), not shown.
- The Better Auth rate limiter covers the callback route (it is an HTTP route); the start action
  uses Ronne's limiter per client IP when `TRUST_PROXY=true`.
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
  linked subject, not the email, identifies a person after the first link; a new subject with an
  already-linked email is refused (`not_allowed`) rather than linked to someone else's account.
- **A person changes email at the provider:** the link stays (it is by subject); the Ronne email
  does not change.
- **Root signs in with a provider:** allowed if linked (by email); nothing from a claim changes
  root, and groups never apply to root.
- **Deleting a provider that has linked accounts:** its group-given memberships are removed; people
  without a password can't sign in until root resets one (008) or adds another provider.
- **Turning off a provider:** nobody signs in with it; their links and group memberships stay.
- **Clock skew:** a few minutes of leeway on `exp` and `iat`, as the plugin does.
- **Two roots edit one provider at once:** the later save wins, with the *updated* time shown in the
  form; the stale form says so (a version check on save).
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
  redirect URI, the values to bring back, the claims, the groups, and the usual mistakes. The
  in-form instructions are the short version, and link to these.
- **Signing in** (the sign-in page's topic): signing in with a provider and with a password.
- **Administration → Settings** (`admin#settings`) and **Security** (`security#security`): the
  Authentication tab, the allowlist, the secret handling. **Incidents:** a provider is broken or
  compromised (`disable-sso`, `revoke-access`).
- **Helpers:** on Add provider, "Where do I find these values?" → the chosen preset's guide; on the
  redirect URI, "Why this address?" → `authentication#providers`; on Groups,
  "How are groups applied?" → `authentication#groups`; on the password policy,
  "Can root be locked out?" → `authentication#lockout`.

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
- [ ] Only the callback route joins the HTTP allowlist; the plugin's other routes return 404.
- [ ] *Root only* hides password sign-in for others, keeps it for root, can't be chosen without a
  tested enabled provider, and the token exchange answers `password_sign_in_disabled` correctly.
- [ ] `rmk-server disable-sso` turns all providers off and restores password sign-in for everyone.
- [ ] A fake provider (test double speaking OIDC) covers the flow on SQLite, PostgreSQL, MySQL and
  MariaDB; the end-to-end test signs in through it.
- [ ] The pages pass the phone sweep (065) and axe.
- [ ] The Documentation, the seven guides and inline helpers listed above say what the feature does now.

## Decisions

1. **An abstract provider type contract, OpenID Connect first** (owner, 2026-10-15), so SAML and
   LDAP are a type each.
2. **Presets are data with instructions** (owner, 2026-10-15): setup is the hard part for a company,
   so the app shows the redirect URI and the steps beside the form.
3. **Ronne owns the provider tables; the library's tables are a copy** (Claude): the UI, the
   encrypted secret and the group mapping are Ronne's, so they can't depend on a plugin's storage.
   *Fallback if `@better-auth/sso` doesn't fit* (task 1 decides, and records it in Notes): Better
   Auth's `genericOAuth` plugin built per request from Ronne's tables, or a small flow on
   `oauth4webapi` (MIT); the type contract is the same.
4. **Groups map to workspace roles only** (owner's list, 2026-10-06; instance roles are user and
   root, 091): never to root.
5. **Test sign-in required before turning on, and root's password can't be switched off**
   (Claude): a typo in the issuer must not lock a company out.
6. **Verified email is required to link** (Claude): an unverified address at a provider would let
   anyone claim an existing account.
7. **Single logout and provider-initiated sign-in are out** (Claude): both need more of the
   provider than most companies configure.

## Open questions

- **Session length for SSO** (30 days now): should an SSO session follow the provider's, or shorter?
- **Default role in `global` for new SSO accounts:** `user`, as the owner said; confirm for every
  listed domain, or per domain?
- **Which provider do we test against in CI?** A fake OIDC server in the repo's tests (planned)
  covers behaviour; a real Keycloak container could run nightly (a Docker Hub pull, see
  `docs/knowledge/docker-hub-pulls.md`).
