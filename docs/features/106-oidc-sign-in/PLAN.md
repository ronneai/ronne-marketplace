# 106 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Spike: the library.** [risky] Through the dependency checklist, read the installed
  `@better-auth/sso` (and `genericOAuth` in `better-auth`): licence, release age, peer
  dependencies (SAML ones must not come along), its tables on the three databases, whether it
  stores the client secret in clear, how it validates the response, how it takes a provider that
  Ronne reads from its own tables, and what `resolveUser`/hooks give. Build a throwaway sign-in
  against a fake OIDC server. Write the answer in Notes and, if it fails, switch Decision 3 to the
  fallback in `SPEC.md`.
  *Done when:* Notes name the chosen route with the evidence, and `pnpm licenses:check` and
  `pnpm audit --audit-level high` pass with it installed.

- [x] **2. Tables and the contract.** [risky] Migration: `identity_providers`,
  `provider_group_mappings` and `workspace_members.source` (all three dialects, `docs/spec`
  untouched); the `AuthProviderType` contract and the registry of types in the
  identity domain; the secret encryption (AES-256-GCM, key derived from `AUTH_SECRET`) with
  `encryptSecret`/`decryptSecret`; the repository and the provider service (create, update,
  enable, disable, delete, with the audit events), no UI yet.
  *Done when:* db tests cover each operation and the id rules; the migration test passes on the four
  database kinds; a test shows the stored secret is not the plain one and the logger and audit rows
  never carry it.

- [x] **3. The OpenID Connect type and a fake provider.** The type's schema, `start`, `complete`,
  `test` and `instructions`; the presets as data; a fake OIDC server for tests (discovery, keys,
  authorize, token, with switches for unverified email, missing groups, a bad signature, a wrong
  issuer and a slow answer).
  *Done when:* unit tests cover discovery, the issuer rule (https or localhost, redirects refused,
  issuer mismatch), PKCE/state/nonce, a bad signature (failing without `validateApplicationLevelSignature`), expiry,
  an `iat` in the future or from before the sign-in started, and each preset's issuer pattern.

- [x] **4. Sign-in and accounts.** [risky] The start action, the callback route added to the HTTP
  allowlist (and only it), the decision list (verified email, disabled, known link, link by email,
  create for a listed domain, refuse), the session, `auth.sso_*` and `user.*` events. The creation
  goes through the same service as Create user (personal workspace included).
  *Done when:* db tests cover every branch of the decision list, two accounts with one email, a
  changed email at the provider, root, a disabled account, an off-site `next`, a state from another
  browser or used twice, and that the session endpoint returns 404 over HTTP.

- [x] **5. Groups.** [risky] The mapping service and its application at sign-in (add, raise, remove
  by `source`, never touch hand-set rows or root), the warning for a deleted workspace.
  *Done when:* db tests cover joining and leaving a group, two mappings giving one workspace
  different roles, a hand-set membership, a deleted workspace and root.

- [x] **6. The panel and the form.** The provider list, Add/Edit with presets, the redirect URI
  with Copy, the steps beside the form, the write-only secret, domains, groups, the version check;
  Test connection and Test sign-in (the dry run, changing nothing); Turn on needs the test.
  *Done when:* component tests pass for each state, including "can't turn on before the test" and a
  stale form; the phone sweep passes.

- [x] **7. The sign-in page and the password policy.** [risky] Provider buttons, the error
  messages, *Root only* with "Use your password (root)", the choice's preconditions and confirm, the
  token exchange's `password_sign_in_disabled`, and the Sign-in methods panel (122) listing it all.
  *Done when:* tests cover both policies for root and a non-root, the exchange, and refusing to
  choose *Root only* with no tested enabled provider.

- [x] **8. Terminal commands.** `rmk-server disable-sso`; `rotate-secret` re-encrypts the provider
  secrets; `backup`/`restore` carry them and the restore runbook is updated.
  *Done when:* script tests pass for each, including a round trip through rotate and restore.

- [x] **9. End-to-end.** Playwright with the fake provider: root adds a provider from a preset,
  tests and turns it on; a new person signs in and is created; a group grants a role; root chooses
  *Root only*; `disable-sso` restores it. Mind the sign-in limit.
  *Done when:* `pnpm test:e2e` passes the new spec on desktop and phone.

- [x] **10. Documentation.** The Authentication topic, the seven guides, the helpers, the signing-in
  and incident pages, and MVP §14.3 / §15.
  *Done when:* the docs render tests pass in ronne-web, every helper's link lands on a real section
  here, and each guide's redirect URI example matches `PUBLIC_URL/api/auth/sso/callback/<id>`.

- [ ] **11. Link by email within the provider's domains.** [risky] Decision 9: an existing
  account is linked only when its email's domain is on the provider's list; root's included. The
  form, the *Test sign-in*'s result and the Documentation say so.
  *Done when:* tests cover a listed and an unlisted domain, root linked, and an empty list.

- [ ] **12. Limit and lighten the start without a trusted proxy.** [risky] Decision 11: one bucket
  for the instance when the client's address is unknown (starts and callbacks), the discovery
  document cached for 10 minutes (never for *Test connection*), expired sign-ins in progress
  deleted.
  *Done when:* tests cover the shared bucket, a cached and an expired discovery, and the pruning.

- [ ] **13. 24-hour provider sessions.** [risky] Decision 12: a session opened by a provider lasts
  24 hours and isn't extended.
  *Done when:* a test shows the session's expiry and that using it doesn't extend it; the
  Documentation says so.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

**Task 1, the library (2026-10-16): Ronne's own flow on `oauth4webapi@3.8.8`.** Read against
`better-auth@1.7.7`, the installed version.

- **`@better-auth/sso@1.7.7`: rejected.** MIT, released 2026-09-30, peers `better-auth ^1.7.7`,
  `@better-auth/core ^1.7.7`, `better-call 1.4.0`, `@better-auth/utils 0.4.2` and
  `@better-fetch/fetch 1.3.2`. But:
  - `samlify`, `@xmldom/xmldom` and `fast-xml-parser` are plain `dependencies`, and `dist/index.mjs`
    imports them at the top (lines 3, 15–17), so the SAML code loads with OIDC only.
  - Its `ssoProvider` table keeps `clientSecret` in clear inside the `oidcConfig` JSON
    (`buildOIDCConfig`, around line 3420). `defaultSSO` avoids the table but is fixed at start.
  - No `nonce` at all (`grep -c nonce` → 0); the ID token check is `jwtVerify` with `iss` and `aud`.
  - Its `resolveUser` hook (typed at `index-sM6JWXeV.d.mts:332`; `resolveSSOUser` at
    `index.mjs:1600-1612`, called for OIDC in `handleOIDCCallback` at `:3967` and for SAML in
    `processSAMLResponse` at `:3013-3066`) gets the verified identity and answers `continue`,
    `link` (a `userId`, and `profile: preserve|update`) or `reject` (a `code`) (`:1583-1588`),
    inside a transaction (it needs the adapter's native transactions). That could carry Ronne's decision list, but it runs inside
    the plugin's callback, so a *Test sign-in* that changes nothing and Ronne's own audit reasons
    would still go through the plugin; `provisionUser` runs only after the user exists. It doesn't
    outweigh the SAML libraries, the secret in clear and the missing nonce.
  - 14 routes of its own, 10 of them not SAML (`/sign-in/sso`, `/sso/register`, `/sso/providers`,
    `/sso/update-provider`, …), and its
    own linking, domain verification and organisation provisioning, beside Ronne's decision list.
- **`genericOAuth` (in `better-auth`): rejected.** No new package, and it binds the nonce. But its
  `options.config` is read in `init` (discovery runs there), so a new or edited provider means a
  new Better Auth instance, and its callback is core's `/callback/:id`, which creates and links
  users by Better Auth's rules: the decision list and a dry-run *Test sign-in* would be hooks
  fighting it.
- **`oauth4webapi@3.8.8`: chosen.** MIT, no dependencies, published 2026-09-05 with SLSA provenance,
  OpenID Certified, maintained by panva (also `jose`'s author; one maintainer, like `jose`, which
  Better Auth depends on already). It is what Auth.js builds on. Every request uses
  `redirect: 'manual'`.
- **The throwaway sign-in** (a fake OIDC server on `node:http` + `jose`, code + PKCE + state + nonce,
  `ClientSecretBasic`), each case's result:

  | Case | Result |
  |---|---|
  | ok | claims `sub`, `email`, `email_verified: true`, `groups` |
  | `email_verified: false` | accepted by the library, so Ronne's decision list refuses it |
  | no groups claim | accepted, `groups` absent (the test must say so) |
  | bad signature | **accepted** until `validateApplicationLevelSignature(as, response)` is called, then `OAUTH_INVALID_RESPONSE` |
  | wrong nonce | `OAUTH_JWT_CLAIM_COMPARISON_FAILED` |
  | expired | `OAUTH_JWT_TIMESTAMP_CHECK_FAILED` |
  | discovery issuer ≠ typed issuer | `OAUTH_JSON_ATTRIBUTE_COMPARISON_FAILED` |
  | discovery answers a redirect | `OAUTH_RESPONSE_IS_NOT_CONFORM` (not followed) |

- **Gotchas for tasks 3–4:**
  - The ID token signature isn't checked by default (OIDC Core 3.1.3.7). Call
    `validateApplicationLevelSignature(as, tokenResponse)` with the token endpoint's **`Response`**
    (the library keys the token by it), not the parsed result. Task 3's bad-signature test must fail
    without that call.
  - `ClientSecretBasic` form-encodes the id and secret before Base64 (RFC 6749 §2.3.1: `client-1`
    is sent as `client%2D1`). The fake must decode them, and so do real providers.
  - `http://localhost` needs `[allowInsecureRequests]: true` on each call; give it only for a
    `localhost` issuer.
  - `clockTolerance` defaults to 30 seconds and covers only `exp` and `nbf`; the spec says 5
    minutes. `iat` is only checked to be a number (`build/index.js:1823-1827`): a token with `iat`
    a year ahead or 30 days back passes, so Ronne checks it itself (SPEC, Allowlist and security).
- **Opening the session.** A server-only Better Auth plugin endpoint (`metadata: { SERVER_ONLY:
  true }`) that calls `internalAdapter.createSession` and `setSessionCookie` for the user Ronne
  chose: the session cookie is set, `databaseHooks.session.create.before` (the disabled check) runs,
  `getSession` reads it back, and over HTTP the endpoint is a 404 even without Ronne's allowlist
  (200 without `SERVER_ONLY`).
- `@better-auth/scim` (108) doesn't need `@better-auth/sso`: its dependencies are `zod` and
  `@noble/hashes`.
- With `oauth4webapi` installed: `pnpm install --frozen-lockfile` up to date, `pnpm licenses:check`
  "323 packages checked. All licenses are allowed", `pnpm audit --audit-level high` "No known
  vulnerabilities found".

**Task 2, tables and the contract (2026-10-16).**

- **Every write that depends on a read is conditional on the row's version** (`updated_at`): save,
  turn on/off and recording a test all update `WHERE id = ? AND updated_at = <what was read>` and
  report whether one row changed. A read-compare-write inside a transaction isn't enough: MySQL and
  MariaDB's REPEATABLE READ let two saves of one form both land, and an enable racing a save that
  cleared the test left the provider on and untested (the witnesses' probes; SQLite runs one
  transaction at a time and never shows it). Versions only go up: a write within the same
  millisecond takes the previous `updated_at` + 1 ms.
- **A test counts for one version**: `markProviderTested` takes the `updatedAt` the test started on,
  so a save during a *Test sign-in* makes it count for nothing (task 6 passes it).
- **No `zod` in `apps/web`**: a type gives `fields` and a `parse(input, previous)` that throws
  `InvalidProviderConfigError` with a message per field; SPEC's contract table says so.
- **Audit metadata keys can't contain `secret`** (007's check), so `instance.auth_provider_updated`
  lists the changed fields as values: `changed: ["name", "client secret"]`.
- **The secret's AAD is the provider id**, so a value copied onto another row doesn't decrypt; the id
  never changes, so that's safe.
- **Booleans go through `toDbBoolean`**: SQLite can't bind `true`.
- **Deleting a provider never removes anyone from `global`** (092): a group-given `global` row goes
  back to a hand-set `user` (audited `member_role_changed` via sso), the rest are removed.
- `pnpm test:db:<db> -- <a> <b>` with several paths fails at the script level; pass one path per
  call.

**Task 3, the OpenID Connect type (2026-10-16).**

- **Errors as the spec's reasons** (`ProviderFlowError`): the provider refused (`error=` in the
  callback, an OAuth error body), answered 5xx, timed out or couldn't be reached →
  `provider_error`; anything it sent that doesn't check out → `invalid_response`. A 5xx arrives
  from `oauth4webapi` as `OperationProcessingError` with the `Response` as its `cause`, so the
  status is read there. The library's message goes in `detail`, for the log only.
- **Discovery runs for every start, callback and test**: an edited provider needs no restart, and
  nothing is cached between replicas (111).
- **Entra's `xms_edov`** counts as verified only for the Entra preset and only when
  `email_verified` is absent (a preset's `verifiedClaim`): Entra never sends `email_verified`.
- **The fake signs with `node:crypto`** (RS256 from a generated key pair, the public key exported as
  a JWK): `jose` is only a dependency of Better Auth, so `apps/web` can't import it under pnpm.
- **The type is a factory** (`createOidcProviderType({ timeoutMs })`) so a test can make a slow
  provider time out in 100 ms; the app's registry (`PROVIDER_TYPES`) uses the 10-second default.
- **`URL.href` on both sides**: `oauth4webapi` compares the typed issuer and the document's issuer
  after `new URL()`, so `https://accounts.google.com` and `https://accounts.google.com/` match;
  with a path, the trailing slash matters (authentik and Auth0 keep theirs).
- The presets' steps were written from each vendor's documentation in October 2026; the in-form
  text is the short version, and task 10's guides carry the screenshots.

**Task 4, sign-in and accounts (2026-10-16).**

- **The flow:** the start (`actions/sso.ts` `startSsoSignIn`, the server action `ssoFromForm`) saves
  the sign-in in progress as a `verification` row (`sso-state:` + the state's SHA-256) and returns
  the state cookie to set; the callback (`app/api/auth/sso/callback/[id]/route.ts` →
  `completeSsoSignIn`) checks the cookie against `?state=`, takes the row (deleting it claims it:
  of two requests, one deletes), has the type verify the answer, decides
  (`services/sso-sign-in.ts`), and opens the session through the server-only
  `ronne-sso-session` plugin endpoint. Better Auth's allowlist didn't change.
- **The decision runs with the provider's row locked** (`SELECT … FOR UPDATE`, READ COMMITTED), so
  two first sign-ins of one person create one account; a new email taken meanwhile through
  another provider (the `user.email` unique index) is decided again once.
- **Account takeovers the witnesses found, now closed:** `normalizeEmail` lowercases Unicode, so a
  provider's `Kate@…` with the Kelvin sign folded onto `kate@…`: only plain-ASCII addresses are
  matched or created. MySQL and MariaDB compare emails without accents, so `kate@…` found
  `kåte@…`: a found account whose stored address isn't exactly the provider's is refused.
  Subjects (`account.account_id`, `text`) are compared in JavaScript too, for the same reason.
- **A *Test sign-in*'s state never opens a session** (it ends `expired` at the real callback) until
  task 6 finishes it its own way.
- **Its own limiter**, 30 a minute per client IP for the start and for the callback, on
  `globalThis` like the login limiter; nothing without a trusted proxy (SPEC says why).
- **Create user's repository write** (`insertUser`, now shared by `createUserWithPassword` and
  `createUserWithoutPassword`), not its service: the service needs `users.manage` and a root actor.
- Better Auth's endpoint body is a hand-written Standard Schema (better-call takes any), since
  `zod` isn't a dependency of the app.
- **Witnesses running side by side collided twice** in the scratchpad and on the same files; the
  rule now (docs/knowledge/state-witness.md): mutate only in a scratch copy of the repository.

**Task 5, groups (2026-10-16).**

- **The plan is pure** (`services/group-sync.ts` `planGroupChanges`): memberships in, changes out,
  so it is unit-tested on its own and a *Test sign-in* can show it without writing (task 6).
  `applyGroups` writes it in the sign-in's transaction (the provider's row locked), never for root.
- **Who owns a membership is `workspace_members.source`.** Workspaces' `putMember`, the one write
  behind adding, re-adding, changing a role and approving a request, now sets it to null: a
  person's change makes a group-given row hand-set, and groups leave it alone from then on (the
  witnesses found root's change undone at the next sign-in before).
- **`global`'s plain `user` row** may be taken over by a mapping and goes back to a hand-set
  `user` when the group goes (nobody leaves `global`); any other hand-set row is never changed.
- **A missing groups claim changes nothing**; an empty list removes what the groups gave; with no
  mappings left, what earlier ones gave still goes.
- **Mappings travel with the provider** (`ProviderInput.mappings`, replaced together, named in
  the update event), checked against personal workspaces and missing ones; a deleted workspace
  leaves the mapping with a null workspace for the form's warning (FK `SET NULL`).

**Task 6, the panel and the form (2026-10-17).**

- **The provider's page** is `/admin/settings?tab=authentication&provider=<id|new>`; each panel row
  links to it, and Turn on/off and Delete live there (SPEC says so). The preset cards are links
  (`&preset=<id>`), so choosing one works without JavaScript and the chosen form renders on the
  server; the redirect URI is built in the browser from the id as it's typed.
- **Test sign-in can't be a server action:** React intercepts a form whose action is a function
  (a fetch), so `target="_blank"` never opens a tab. It is a plain form posting to
  `POST /api/auth/sso/test/<id>` (root only; the `Origin` must be `PUBLIC_URL`'s, which stops a
  cross-site post), which sets the state cookie and sends the tab to the provider.
- **The test's result** is a `verification` row (`sso-test:<provider>:<root>`, an hour), read by
  that root's page. `finishTestSignIn` (`actions/test-sign-in.ts`) is its own module because
  `sso.ts` calls it and `identity-providers.ts` imports `sso.ts`. It finishes only in the browser
  of the root who started it (their session at the callback), works out the decision and the group
  plan with the same pure functions as a sign-in, writes neither, and records the passing test for
  the version it started on (a save during the test makes it count for nothing).
- **Component states are tested by props** (the repo's way: static rendering), so the result
  notices, the Delete confirm and the `?test=` notices are small exported components.
- **The phone test** (`e2e/identity-providers.mobile.e2e.ts`) walks the form, because 065's sweep
  only opens pages as they load; a preset card's long issuer pattern made the page 1px too wide at
  360px until it could wrap (`break-all`, `min-w-0`).
- New route segments go in `server/telemetry/sanitize.ts`'s list (`sso`, `callback`, `test`): a
  unit test checks every segment of `app/` is there.

**Task 7, the sign-in page and the password policy (2026-10-17).**

- **The setting** (`password_sign_in`, settings domain) is root's choice; the **effective** policy
  (`actions/password-policy.ts` `effectivePasswordPolicy`) is *Root only* only while a provider is
  on, so turning every provider off gives everyone their password back without touching it.
  Identity reads it through the settings service and repository, not its actions, which import
  identity's session (an import cycle otherwise).
- **Every password path reads it:** the web sign-in (refused before Better Auth, the usual
  answer), the token exchange (403 `password_sign_in_disabled`, only after the right password, like
  two-factor's answer), and the second step of a two-factor sign-in (a challenge someone other
  than root got before the switch is refused; the witnesses found it finishing).
- **Timing:** the refused web path runs Better Auth's own sign-in for a reserved address no
  account can have (`refused@sign-in.invalid`, RFC 2606), so it does exactly the work root's
  attempt does and the answer's time doesn't tell which address is root's. Copying the work by
  hand (the lookups and an argon2 check) still left root 2–4 ms slower on the database servers;
  about 1 ms remains, accepted by the owner. `normalizeEmail` refuses `.invalid` addresses
  everywhere, so no account (made by root or a provider) can be the reserved one; a session for one
  put in by hand is ended at once (the witnesses found root could create it).
- **SQLite's one connection:** "is a provider usable" reads another table, so it runs before the
  settings transaction, not inside it (inside, SQLite waited on itself and the tests timed out).
- **One answer for a disabled account and for none** at the sign-in page (`?error=disabled` and
  `not_allowed` say the same), as 006's rule asks; the audit row keeps the real reason.
- Known test gap (accepted): nothing renders the policy form's Save button with *Root only* chosen
  and the confirm unticked; `canSave` is tested and the server refuses without the confirm.

**Task 8, terminal commands (2026-10-17).**

- **`disable-sso`** is composed at the action layer (`actions/disable-sso.ts`): the providers off
  in identity's repository transaction, then the password policy back to *Everyone* through the
  settings service with a system actor (`via: "cli"`). A new script means a line in every list:
  `apps/web/package.json`, the root `package.json`, `tsdown.config.ts` (the Docker image's
  `dist-scripts`), `docker/pnpm`, and `packages/server` (`SCRIPTS`, the usage, `SCRIPT_VERBS`, the
  service help).
- **`rotate-secret`** passes the old and new `AUTH_SECRET` to `endSessionsForNewSecret`, which
  re-encrypts each provider's secret in its transaction, before the new secret is written; one the
  old key can't read stays as it was and is reported. If the database fails after the file is
  written, the providers' secrets stay under the old key: the message says to enter them again.
- **Restore** checks each provider's secret against the `AUTH_SECRET` the server will use (the same
  rule as two-factor's) and marks the ones it can't read `secret_unreadable`, which the panel shows
  as *Failing* at once and the page explains. Backups need nothing new: they carry
  `identity_providers` like any table, the secrets still encrypted.

**Task 9, end-to-end (2026-10-17).**

- **The flow is one function** (`e2e/sso.ts`), run once per project: `sso.e2e.ts` on the desktop,
  `sso.mobile.e2e.ts` on phone, phone-webkit and tablet. Each run starts its own fake provider and
  has its own provider id, its own new person (`ann@<project>.e2e.test`) and **its own root and
  member**: each device project's root is already signed in five times, so the flow's would be the
  sixth (e2e-sign-in-limit.md). A first version reused it and passed only because the sign-ins
  happened to straddle two windows; a probe confirmed the limit holds (the sixth right sign-in in a
  minute is refused, other pages visited between).
- **`disable-sso` runs for real**, `scripts/disable-sso.ts --yes` with the instance's env from
  `RONNE_E2E_INSTANCE`, and again in `finally` when the flow fails after choosing *Root only*, so
  one failure can't hold every later test on the shared instance to root-only.
- **The Authentication tab has two Save buttons** now (two-factor policy and password sign-in), so
  each test scopes Save to its form (`two-factor-hold.e2e.ts` changed for it).

**Task 10, Documentation (2026-10-17).**

- **On the website** (ronne-web, branch `docs/106-oidc-sign-in`, en/pt/fr): a new topic
  `authentication` (how it fits together, adding a provider, groups, password sign-in, lockout,
  and one guide per preset), a new section `account#signing-in` (the sign-in page has no topic of
  its own: it explains every message back from a provider), and Admin › Settings, Security,
  Incidents (`disable-sso` is the third incident command), `rmk#login` and `backups#restore`.
- **The usual mistakes are the same for every provider**, so they live once in `providers` and
  every guide's closing note links to them (SPEC's Documentation line says so).
- **Helpers:** "Where do I find these values?" links to the chosen preset's guide (`presetGuide`,
  `Help`'s new `href`), "Why this address?", "How are groups applied?", "Can root be locked
  out?"; "How do people sign in?" moves to `authentication#overview`.
- **The docs test doesn't catch a DocLink pointed at another real section** (the witness checked
  parity across locales by hashing the targets). Worth a ronne-web test some day.
- **MVP:** §9.5, §10, §14.3 and the §15 SSO row record what was built.

