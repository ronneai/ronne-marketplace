# 106 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Spike: the library

Witnessed: 2026-10-16 21:51 EDT, by a fresh agent (blind). Commit: ac27449d + working-tree diff (apps/web/package.json, pnpm-lock.yaml, 106 SPEC.md and PLAN.md). Machine: macOS 27.0.1, Node v24.0.0.

The witness read PLAN.md's Notes from the start, since they are the task's deliverable.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Notes name the chosen route (Ronne's own flow on `oauth4webapi@3.8.8`) and give evidence for it | yes | confirmed | PLAN.md Notes, "Task 1, the library": `@better-auth/sso` and `genericOAuth` are rejected with reasons, `oauth4webapi` is chosen, and there is a table of spike results |
| 2 | `oauth4webapi` is pinned exactly and the lockfile matches | yes | confirmed | `apps/web/package.json` has `"oauth4webapi": "3.8.8"`. `pnpm install --frozen-lockfile` → "Lockfile is up to date", supply-chain policies pass |
| 3 | `pnpm licenses:check` passes with it installed | yes | confirmed | → "323 packages checked. All licenses are allowed by the policy.", exit 0 |
| 4 | `pnpm audit --audit-level high` passes | yes | confirmed | → "No known vulnerabilities found", exit 0 |
| 5 | `oauth4webapi@3.8.8` passes the checklist: MIT, no dependencies, published 2026-09-05 with SLSA provenance, latest, one maintainer (panva), no install scripts | yes | confirmed | `npm view`: license MIT, no dependencies/peers/optional, time 2026-09-05T10:22:40Z, `dist.attestations.provenance` slsa v1, latest 3.8.8, maintainers panva only, no install or postinstall script. Older than the 3-day `minimumReleaseAge`. The single maintainer is a §3 "Health" caveat, and the Notes say so openly |
| 6 | `@better-auth/sso@1.7.7`: MIT, released 2026-09-30, peers `better-auth ^1.7.7` | yes | partly | Packed tgz: MIT, released 2026-09-30T21:30Z. But the peers are `better-auth ^1.7.7`, `@better-auth/core ^1.7.7`, `better-call 1.4.0`, `@better-auth/utils 0.4.2` and `@better-fetch/fetch 1.3.2`. The Notes list only the first |
| 7 | The SAML libraries are plain dependencies and load at the top of `dist/index.mjs` (lines 3, 15–17) | yes | confirmed | package.json dependencies include `samlify`, `@xmldom/xmldom`, `fast-xml-parser`. `index.mjs:3` imports fast-xml-parser, `:15` @xmldom/xmldom, `:16-17` samlify |
| 8 | The `ssoProvider` table keeps `clientSecret` in clear in the `oidcConfig` JSON | yes | confirmed | `index.mjs:3415-3440` `buildOIDCConfig` does `JSON.stringify({…clientSecret: body.oidcConfig.clientSecret…})`, which is stored as `oidcConfig` (`:3481`). Grepping for encrypt finds only the SAML algorithm checks |
| 9 | sso sends no nonce, and the ID token check is `jwtVerify` with iss and aud | yes | confirmed | `grep -c nonce` → 0 in every dist file. `index.mjs:580` is `jwtVerify(token, JWKS, {audience, issuer})` |
| 10 | sso has "nine routes of its own" | yes | partly | `grep -oE 'createAuthEndpoint\("[^"]+"'` → 14 endpoints: 10 that aren't SAML (`/sign-in/sso`, `/sso/callback`, `/sso/callback/:providerId`, register, providers, get-provider, update-provider, delete-provider, request-domain-verification, verify-domain) plus 4 SAML ones. The count is wrong; the point it makes (it serves its own routes) still holds |
| 11 | `genericOAuth` reads `options.config` in `init`, runs discovery there, binds the nonce, and its callback is core's `/callback/:id` | yes | confirmed | Installed `better-auth@1.7.7` `plugins/generic-oauth/index.mjs`: `:66` "`callback/:id` core endpoints — no plugin-specific endpoints", `:80-91` `init` loops over `options.config` and calls `fetchDiscovery`, `:192` passes `nonce: data.idTokenNonce` |
| 12 | Spike table: ok, unverified and no-groups are accepted; bad signature, wrong nonce, expired, issuer mismatch and a redirecting discovery are refused with the codes listed | yes | confirmed | `node spike.mjs` (oauth4webapi 3.8.8) → ok, unverified and no-groups print OK with matching claims. bad-signature gives `OAUTH_INVALID_RESPONSE`, bad-nonce `OAUTH_JWT_CLAIM_COMPARISON_FAILED`, expired `OAUTH_JWT_TIMESTAMP_CHECK_FAILED`, wrong-issuer `OAUTH_JSON_ATTRIBUTE_COMPARISON_FAILED`, redirect-discovery `OAUTH_RESPONSE_IS_NOT_CONFORM` |
| 13 | A bad signature is accepted unless `validateApplicationLevelSignature` is called | yes | confirmed | Mutation `w106/spike-nosig.mjs` (call commented out) → `bad-signature OK {…}`, so the token is accepted. With the call it is refused (row 12) |
| 14 | Every library request uses `redirect: 'manual'`. `clockTolerance` defaults to 30 s. ClientSecretBasic form-encodes the id and secret | yes | confirmed | `oauth4webapi/build/index.js`: all 5 fetch sites set `redirect: 'manual'` (lines 237, 961, 1170, 1643, 2457). `getClockTolerance` falls back to `30` (`:436-440`). `formUrlEncode(client.client_id)` and `formUrlEncode(clientSecret)` run before `btoa` (`:456`, `:486-488`) |
| 15 | A SERVER_ONLY plugin endpoint opens a session: the cookie is set, `session.create.before` runs, `getSession` reads it back, and the endpoint is a 404 over HTTP (200 without SERVER_ONLY) | yes | confirmed | `node session.mjs` → set-cookie `better-auth.session_token`, the hook ran for the user, getSession → ana@example.com, HTTP 404. Mutation `w106/w106-nosrv.mjs` without SERVER_ONLY → 200 |
| 16 | `@better-auth/scim` doesn't need `@better-auth/sso` | yes | confirmed | `npm view @better-auth/scim@1.7.7` → dependencies are only `zod` and `@noble/hashes`. The peers are better-auth, better-call, core and utils, and none is sso |
| 17 | SPEC.md matches the chosen route everywhere it describes the OIDC flow, with nothing left that relies on the rejected library | no | partly | Scope, Secrets, Where the data lives, Signing in, Allowlist and security, Clock skew and the allowlist criterion are all rewritten for oauth4webapi, and grep finds no `@better-auth/sso`, `ssoProvider` or plugin-routes wording left in them. But the Decision 3 heading (SPEC.md:260) still says "**Ronne owns the provider tables; the library's tables are a copy**" and "a plugin's storage". That contradicts "No library keeps a copy" in Where the data lives |
| 18 | The task's question about sso's tables on the three databases is answered | no | confirmed | Not tested on the database servers. That is moot because the library was rejected and Ronne keeps no copy; task 2's text drops "the plugin's tables" to match |

**Overall:** not met: the route, the checks (frozen install, licences, audit) and the spike all hold up, but the Notes miscount sso's routes and list its peers incompletely, and the Decision 3 heading in SPEC.md still describes library tables as a copy.

Witnessed: 2026-10-16 21:54 EDT, by a fresh agent (adversarial). Commit: ac27449d + working-tree diff. Machine: macOS 27.0.1, Node v24.0.0.

The witness was given PLAN.md's Notes, the deliverable, and filled *In the notes?* after its verdicts. The tree changed during the pass (the blind pass's wording fixes); rows 6 and 14 were checked against it as it was at 21:54.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Notes name the chosen route (Ronne's own flow on `oauth4webapi@3.8.8`) with evidence for and against each option | yes | confirmed | PLAN.md Notes "Task 1, the library": sso rejected, genericOAuth rejected, oauth4webapi chosen, each with `file:line` evidence and a spike table |
| 2 | `pnpm licenses:check` passes with it installed | yes | confirmed | `pnpm licenses:check` → "323 packages checked. All licenses are allowed by the policy." |
| 3 | `pnpm audit --audit-level high` passes | yes | confirmed | → "No known vulnerabilities found" |
| 4 | The lockfile matches and the version is pinned exactly | yes | confirmed | `pnpm install --frozen-lockfile --offline` → "Lockfile passes supply-chain policies… up to date"; `apps/web/package.json` `"oauth4webapi": "3.8.8"`; lockfile `oauth4webapi@3.8.8: {}` (no dependencies) |
| 5 | oauth4webapi meets the policy: MIT, no dependencies, no install scripts, old enough, published with provenance, OpenID Certified, by panva, used by Auth.js | yes | confirmed | `npm view oauth4webapi@3.8.8` → license MIT; no `dependencies`; no preinstall/install/postinstall; published 2026-09-05T10:22Z (41 days, more than `minimumReleaseAge: 4320` minutes); `dist.attestations` SLSA v1; maintainers `[panva]`; README:38 certified Basic RP; `@auth/core` depends on `oauth4webapi ^3.3.0` |
| 6 | The facts about `@better-auth/sso@1.7.7`: SAML libraries imported at the top, client secret stored in clear, no nonce, its own routes, MIT, peer dependencies | yes | confirmed | `npm pack`: `dist/index.mjs:3,15-17` import fast-xml-parser, xmldom and samlify; `:3415-3438` `buildOIDCConfig` puts `clientSecret` into `JSON.stringify`; `grep -c nonce dist/*.mjs` → 0 in all three files; 14 `createAuthEndpoint` routes, 10 not SAML. The diff first handed over said "Nine routes" and one peer; the current tree says 14 and lists all five peers |
| 7 | The task's question "what `resolveUser`/hooks give" is answered | no | partly | The Notes never mention `resolveUser`. sso has it (`index.d.mts:332`; `index.mjs:1600-1612`, `3013-3066`): reject or link inside a transaction, needing native transaction support. The rejection still holds on row 6's other grounds, but the question is unanswered |
| 8 | The facts about `genericOAuth` in better-auth 1.7.7: `options.config` and discovery run in `init`, the nonce is bound, it goes through core's `/callback/:id` | yes | confirmed | `dist/plugins/generic-oauth/index.mjs:66`, `:80-91`, `:192` and `:220-223` |
| 9 | The spike's table can be reproduced | yes | confirmed | `node spike.mjs` → the 8 rows match the Notes exactly |
| 10 | A bad signature is accepted unless `validateApplicationLevelSignature(as, response)` is called | yes | confirmed | Mutation `NO_SIG=1 node attack.mjs` → bad-signature `OK`; with the call → `FAIL OAUTH_INVALID_RESPONSE`. `build/index.js:1196,1209` keys the check by the `Response`. Without the call the JWKS is never fetched either |
| 11 | The `SERVER_ONLY` session endpoint opens a session, the `session.create.before` hook runs, `getSession` reads it back, and over HTTP it returns 404 (200 without `SERVER_ONLY`) | yes | confirmed | `node session.mjs` → cookie set, hook ran, getSession → ana@example.com, HTTP 404. Mutation without `SERVER_ONLY` → 200. Other letter case or a trailing slash → 404. `better-call/dist/router.mjs:22` skips `SERVER_ONLY` endpoints |
| 12 | SPEC's security claims: signature, `iss`, `aud`, `exp`, `nonce` and `sub` checked, state bound, redirects refused, discovery issuer must match | no | confirmed | `attack.mjs` → refused: alg none, HS256 with the client secret, wrong aud, wrong token iss, exp 120 s past, no sub, no nonce, forged state, wrong `iss` in the callback (RFC 9207), 302 on JWKS, 307 on the token endpoint, 302 on discovery. PKCE enforcement is the provider's side; the flow sends S256 |
| 13 | SPEC.md:173 says `iat` is checked; SPEC.md:202 says there are "a few minutes of leeway on `exp` and `iat`" through `clockTolerance` | no | not met | `attack.mjs` modes old-iat (30 days past), future-iat (+10 min), far-future-iat (+1 year) → all `OK`. `build/index.js:1823-1827` checks only that `iat` is a number; `clockTolerance` applies to `exp` (`:1819`) and `nbf` (`:1837`) only |
| 14 | SPEC.md is internally consistent and nothing still relies on a rejected library | no | confirmed | Current tree: Decision 3 heading reads "no library keeps a copy" (SPEC.md:260); no sso, `ssoProvider` or plugin-route wording left. Row 13's wording is the only wrong statement |

**Overall:** not met: the route, the dependency checks and the spike hold, but SPEC.md says `oauth4webapi` checks `iat` with leeway, which it doesn't, and the Notes leave the `resolveUser`/hooks question unanswered.

### Re-check (adversarial: rows 7 and 13, plus what the diff touches)

Witnessed: 2026-10-16 21:56 EDT, by a fresh agent (adversarial). Commit: ac27449d + working-tree diff. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | The Notes answer what sso's `resolveUser`/hooks give, and why that doesn't change the choice | yes | confirmed | PLAN.md:95-100 cite `index.d.mts:332` and `index.mjs:1600-1612` / `3013-3066`. In the packed package, `:3014` asserts native transaction support, `:3025` runs `resolveSSOUser` inside `runWithTransaction`, `:3043` turns "reject" into FORBIDDEN, and `selectedUser` is set for "link"; the OIDC callback uses it too (`:3908`, `:3955`). `provisionUser` runs after `handleOAuthUserInfo`, only when `isRegister` or on every login (`:3081`) |
| 13 | SPEC.md:173-178: `oauth4webapi` checks `iss`, `aud`, `exp` and `nonce`, the signature through `validateApplicationLevelSignature`, and Ronne checks `iat` itself (not before the sign-in started, not after now, with leeway). SPEC.md:204-205: 5 minutes on `exp`/`nbf` through `clockTolerance` and on `iat` in Ronne's check | yes | confirmed | Library alone (`TOL=300 node attack-iat.mjs`): `iat` at +600 s, +1 year, -30 days, +120 s, -120 s and -400 s all accepted, so "the library only checks that it is a number" is right (`build/index.js:1823-1827`). With the SPEC rule in the probe (`IAT_CHECK=1`, 300 s): +600 s, +1 year, -30 days and -400 s refused; ok, +120 s, -120 s accepted. The start time exists: `verification.created_at` (`0001_identity.ts:74`). `clockTolerance=300`: `nbf` +200 s accepted, +400 s refused, `exp` -200 s accepted; with the default 30 s both are refused. Nowhere else says the library checks `iat` |
| 15 | PLAN.md task 3's *Done when* asks for tests of an `iat` in the future or from before the sign-in started, and for the bad-signature test to fail without `validateApplicationLevelSignature` | yes | confirmed | PLAN.md:37-38 says both; `NO_SIG=1 node attack.mjs` → bad-signature `OK`, with the call → `OAUTH_INVALID_RESPONSE` |
| 16 | The `clockTolerance` gotcha in the Notes is corrected | yes | confirmed | PLAN.md:136-138 matches `build/index.js:1819`, `:1823-1827`, `:1837` and the probe |

**Overall:** met. Task 3 must set `[oauth.clockTolerance]: 300` and test the configured value.

### Re-check 1 (blind: rows 6, 10, 17, plus what the diff touches)

Witnessed: 2026-10-16 21:57 EDT, by a fresh agent (blind). Commit: ac27449d + working-tree diff (106 SPEC.md, PLAN.md, WITNESS.md, apps/web/package.json, pnpm-lock.yaml). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | The Notes list sso 1.7.7's peers correctly | yes | confirmed | PLAN.md:87-89 lists all five, matching `peerDependencies` in the packed tgz |
| 10 | sso has "14 routes of its own, 10 of them not SAML" | yes | confirmed | PLAN.md:101; first-pass grep found 14, 4 under `/sso/saml2/…` |
| 17 | SPEC.md matches the chosen route, with nothing left from the rejected library | no | confirmed | SPEC.md:262-263 "no library keeps a copy … a library's storage" agrees with :122; grep finds nothing else |
| 19 | (diff) `oauth4webapi` checks only that `iat` is a number | yes | confirmed | `build/index.js:1823-1827`; probe `w106/w106-iat.mjs` (`iat` now+1y, now-30d) → both `OK` |
| 20 | (diff) `clockTolerance` defaults to 30 s and covers only `exp` and `nbf` | yes | confirmed | `:436-440`, `:1819`, `:1837`; nowhere for `iat` |
| 21 | (diff) SPEC says Ronne checks `iat` itself; Clock skew 5 min; task 3's *Done when* includes the `iat` cases | no | confirmed | SPEC.md:172-178, :204-205; PLAN.md:38 |
| 22 | (diff) Notes' `resolveUser` paragraph and its citations | yes | partly | Substance holds, but `index.d.mts` is one line (the type is at `index-sM6JWXeV.d.mts:332`), `index.mjs:3013-3066` is the SAML path (OIDC calls it at `:3967`), and the `continue` answer (`:1583-1588`) is left out |

**Overall:** not met: only the `resolveUser` paragraph's citations and its missing `continue` answer remain.

### Re-check 2 (blind: row 22)

Witnessed: 2026-10-16 21:57 EDT, by a fresh agent (blind). Commit: ac27449d + working-tree diff (106 PLAN.md). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 22 | Notes' `resolveUser` bullet: typed at `index-sM6JWXeV.d.mts:332`; `resolveSSOUser` at `index.mjs:1600-1612`, called for OIDC in `handleOIDCCallback` at `:3967` and for SAML in `processSAMLResponse` at `:3013-3066`; answers `continue`, `link` (`userId`, `profile: preserve\|update`) or `reject` (`code`) (`:1583-1588`), inside a transaction that needs native transactions | yes | confirmed | Each citation checked in the unpacked `@better-auth/sso@1.7.7` dist: the type at `index-sM6JWXeV.d.mts:332`; `resolveSSOUser` at `index.mjs:1600-1612`; in `handleOIDCCallback` (`:3795`), `:3956` asserts native transactions, `:3960` opens `runWithTransaction`, `:3967` calls `resolveSSOUser(…, { protocol: "oidc", … })`; the SAML path at `:3013-3025`; `isSSOUserResolution` (`:1583-1588`) accepts `continue`, `link` and `reject` |

**Overall:** met. Every row of task 1 is now confirmed (rows 1-5, 7-9, 11-16 and 18 in the first pass, 6, 10, 17 and 19-21 in Re-check 1, 22 here), and the adversarial re-check is met.

## Task 2 — Tables and the contract

Witnessed: 2026-10-16 22:12 EDT, by a fresh agent (blind). Commit: 1032b115 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration 0026 creates `identity_providers`, `provider_group_mappings` and `workspace_members.source`, and is registered | no | confirmed | `0026_identity_providers.ts:20-92` has all three; `migrations/index.ts` adds `"0026_identity_providers"`; `schema.ts` adds the tables and `source` |
| 2 | The migration test passes on all four database kinds | no | confirmed | SQLite → 7 passed; `pnpm test:db:postgres -- …0026_identity_providers.db.test.ts` → 7 passed; `TEST_DATABASE_URL=<mysql 8.4 / mariadb> vitest run --project db <both db files>` → 25 passed on each |
| 3 | `docs/spec` untouched | no | confirmed | `git status --short docs/spec` → nothing |
| 4 | `AuthProviderType` contract and the type registry are in the identity domain, matching the spec's table | no | confirmed | `models/auth-provider-type.ts:56-79`; `models/provider-types.ts` (`get` throws UnknownProviderTypeError); SPEC's table changed in the same change to `fields`/`parse`/`needsRetest` |
| 5 | Secrets are encrypted with AES-256-GCM under a key derived from AUTH_SECRET, through `encryptSecret`/`decryptSecret` | no | confirmed | `repositories/provider-secrets.ts`: HKDF-SHA256(AUTH_SECRET), aes-256-gcm, fresh 12-byte nonce, provider id as AAD; `provider-secrets.test.ts` → round trip, fresh nonce, wrong AUTH_SECRET, wrong row and a changed byte all refused |
| 6 | A test shows the stored secret is not the plain one | no | confirmed | `identity-providers.db.test.ts:129-135`; mutation storing the plain secret → 2 tests fail |
| 7 | The logger and audit rows never carry the secret | no | confirmed | test `:443-491` scans stdout/stderr at debug, every `audit_log` row and every returned value; mutation logging `got ${secret}` → the test fails |
| 8 | Create / update / enable / disable / delete each write their audit event | no | confirmed | service; db tests assert each; `audit-event.ts` adds the 5 actions; `summary.ts` a summary for each, plus `bySso` on member_* |
| 9 | Id rules: 3–32 chars, lowercase letters, digits and `-`, not `credential`, no collision, chosen once | no | confirmed | `identity-provider.ts:52-60`; model and db tests; mutation allowing `credential` → 2 tests fail; `getProvider("ACME")` on MySQL → ProviderNotFoundError |
| 10 | Enable only after a passing Test sign-in by the root who enables it | no | confirmed | `enableProvider` checks `testedBy === actor`; test `:326-342`; mutation dropping it → 1 test fails |
| 11 | Editing the issuer, client, secret or scopes clears the test, turns an enabled provider off, and audits `disabled` with `reason: "retest"` | no | confirmed | `updateProvider`; tests `:223-282` (scopes are the OIDC type's `needsRetest`, a later task) |
| 12 | Delete: linked accounts keep their rows; group-given memberships are removed, each audited with `via: "sso"` | no | confirmed | test `:396-441`; mutation skipping `removeSourcedMemberships` → 1 test fails |
| 13 | Two roots edit one provider at once: the version check refuses the stale save | no | partly | Sequentially yes (mutation → 2 tests fail). Concurrently, two `updateProvider` calls with the same `expectedUpdatedAt` → mysql `['ok','ok']`, mariadb `['ok','ok']` (postgres one stale; SQLite passes): read, compare, `UPDATE … WHERE id = ?` with no lock or condition |
| 14 | Status badge rule | no | confirmed | `providerStatus`; model test passes |
| 15 | Conventions: arrow functions, domain-first layout, createTestDb, `_at` names, lint and types clean | no | confirmed | biome on the task's paths → no findings; `tsc --noEmit` → no output |

**Overall:** not met: the version check lets two simultaneous saves both go through on MySQL and MariaDB. Remark: `setEnabled`/`disableAll` don't bump `updated_at` past the previous value within one millisecond.

Witnessed: 2026-10-16 22:12 EDT, by a fresh agent (adversarial). Commit: 1032b115 + uncommitted working tree. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration 0026 creates the tables and `source`, and its test passes on SQLite, PostgreSQL, MySQL and MariaDB | no | confirmed | 7 passed on each |
| 2 | The foreign keys are real on every dialect | no | confirmed | the `foreignKeys()` test passes on all 4 (exactly 4 keys); mutation of the cascade to `set null` → 2 tests fail |
| 3 | `docs/spec` is untouched | no | confirmed | `git diff --stat 1032b115 -- docs/spec` → empty |
| 4 | The `AuthProviderType` contract and the registry exist in the identity domain | no | confirmed | `models/auth-provider-type.ts`, `models/provider-types.ts` (unknown type tested). Remark: `start` takes `{ redirectUri }`, `instructions` also `preset` |
| 5 | AES-256-GCM, HKDF-SHA256 key from AUTH_SECRET, fresh nonce, provider id as AAD; wrong key, other row or tampering throws ProviderSecretUnreadableError | no | confirmed | `provider-secrets.test.ts`; mutations: AAD removed → 1 fails; fixed zero nonce → 1 fails |
| 6 | The stored secret is not the plain one | no | confirmed | mutation `secretEnc: secret ?? null` → 2 tests fail |
| 7 | Logger lines, audit rows and returned values never carry the secret | no | confirmed | mutation adding `JSON.stringify(input.config)` to the update event → 3 tests fail; `isSecretKey("clientSecret")` true |
| 8 | Only root may list, get, create, update, enable, disable, delete or mark tested | no | confirmed | probe P8 → 12 ForbiddenError; mutation removing the check in create → 1 test fails |
| 9 | Id rules, unique; another letter case on MySQL can neither collide nor find a provider | no | confirmed | probes P1, P2 (all 4), P7 (concurrent creates → ok + ProviderIdTakenError on all 4). Remark: leading/trailing `-` and `new` are refused but SPEC doesn't say so |
| 10 | Create stores the provider off and untested, and audits it | no | confirmed | passes on all 4 |
| 11 | Update keeps a blank secret, names only changed fields, clears the test on issuer/client/secret change | no | confirmed | mutations: `retest = false` → 2 fail; secret change not counted → 1 fails |
| 12 | Version check: a stale form is refused; the later save never silently overwrites | no | partly | Probe P3, two concurrent saves of one version: MySQL and MariaDB → `ok:One,ok:Two`. Probe P4, update then enable in the same millisecond: `updated_at` 12:00:00.001 → 12:00:00.000, and a form opened at creation is accepted on all 4 |
| 13 | Enable only after a passing test by the root who enables it; both audited | no | confirmed | mutation dropping the `testedBy` check → 1 fails |
| 14 | A recorded test can't enable settings that were never tested | no | partly | Probe P5: create, change the issuer to `https://evil.example`, then `markProviderTested` → `enableProvider` `{"changed":true}` on the new issuer |
| 15 | Delete removes only the memberships this provider gave, audits each, keeps linked accounts, cascades mappings | no | partly | Probe P6: a `global` row with `source = "acme"` → removed on all 4, against SPEC "global stays (nobody is removed from it, 092)" |

**Overall:** not met: concurrent saves both land on MySQL/MariaDB, an enable can move `updated_at` backwards, deleting a provider can remove someone from `global`, and a recorded test isn't tied to the settings tested.

### Re-check 1 (blind: row 13 and the diff)

Witnessed: 2026-10-16 22:16 EDT, by a fresh agent (blind). Commit: 1032b115 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | Two roots save one provider at once: only one save lands, the other gets StaleProviderError | no | confirmed | Repo `update` has `.where("updated_at", "=", at(expected))`; concurrent probe → `['ok','StaleProviderError']` on all four; new test passes on all four and fails on MariaDB with the condition removed |
| 16 | Turning on or off writes a strictly later `updated_at` | no | confirmed | `setEnabled(…, after(at, provider.updatedAt))`; new test passes on all four |
| 17 | A passing test counts only for the version tested | no | confirmed | `markProviderTested(…, testedVersion)` checked in the service and the repo; new test passes on all four |
| 18 | Deleting a provider doesn't remove its `global` memberships: they become hand-set `user`, audited `member_role_changed` via sso | no | confirmed | `releaseSourcedMemberships`; new test passes on all four |
| 19 | The task's db tests pass on all four after the diff | no | confirmed | 29 passed on each; biome → no new findings |
| 10 | Enable only after a passing test by the root who enables it | no | not met | `Promise.allSettled([enableProvider, updateProvider(otherRoot, issuer changed)])` × 8 → `enabled true tested false` in 4/8 (PostgreSQL), 3/8 (MySQL), 2/8 (MariaDB), 0/8 SQLite: `setEnabled` is unconditional |

**Overall:** not met: enable racing a save that clears the test leaves the provider on and untested.

### Re-check 1 (adversarial: rows 12–15 and the diff)

Witnessed: 2026-10-16 22:17 EDT, by a fresh agent (adversarial). Commit: 1032b115 + uncommitted working tree (re-check after fixes). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 12 | Version check: stale form refused, two saves of one version can't both land, versions only go up | no | confirmed | P3 → `ok:One,StaleProviderError` on all four; P4 → .000 → .001 → .002 and the old form stale on all four; reverting the condition → the new test fails on MySQL; reverting `after()` in `setEnabled` → its test fails |
| 13 | Enabling can't turn on settings that have no passing test (enable racing a save) | no | partly | P10 (enable's write delayed 300 ms, a new issuer saved meanwhile) → PostgreSQL, MySQL, MariaDB: `enabled: true testedAt: null issuer: https://other.example`; `setEnabled` updates `WHERE id = ?` only |
| 14 | A test recorded for an older version doesn't count | no | confirmed | P5 → StaleProviderError, enable → ProviderNotTestedError on all four; reverting the check → its test fails |
| 15 | Delete removes only what this provider gave and never anyone from `global` | no | confirmed | P6 → `{"membershipsRemoved":0}`, row `{role:"user",source:null}` on all four; reverting the split → its test fails; SQLite 68 passed, servers 22 + 7 each |

**Overall:** not met: an enable racing a save that clears the test turns the provider on with untested settings.

### Re-check 2 (blind: row 10 and the diff)

Witnessed: 2026-10-16 22:23 EDT, by a fresh agent (blind). Commit: 1032b115 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | A provider is turned on only after a passing Test sign-in by the root who turns it on, even when someone saves it at the same moment | no | confirmed | `setEnabled` has `.where("updated_at", "=", at(expected))`; the 8-round enable-vs-retest race → exactly one lands every round, never on and untested: 0/8 bad on SQLite, PostgreSQL, MySQL 8.4 and MariaDB (was 4/8, 3/8, 2/8). Condition removed → the new test fails on PostgreSQL and MariaDB |
| 20 | Turning off is conditional on the version too | no | confirmed | `disableProvider` passes `provider.updatedAt` and throws StaleProviderError on 0 rows (read, and the on/off tests) |
| 13 | Concurrent saves still let only one land | no | confirmed | `['ok','StaleProviderError']` on all four |
| 19 | The task's db tests pass on all four databases | no | confirmed | 30 passed on each |

**Overall:** met.

### Re-check 2 (adversarial: row 13 and the diff)

Witnessed: 2026-10-16 22:23 EDT, by a fresh agent (adversarial). Commit: 1032b115 + uncommitted working tree (re-check 2 after fixes). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | Enabling can't turn on settings that have no passing test (enable racing a save) | no | confirmed | P10 → PostgreSQL, MySQL, MariaDB: `enable: StaleProviderError … final enabled: false testedAt: null` (was `enabled: true`); SQLite: the save waits, enable ok, save stale, provider stays on the tested issuer. `kysely-identity-provider-repository.ts:91-98` conditional; `identity-providers.ts:235`, `:253` throw on 0 rows. Condition removed → the new test fails on SQLite and MySQL |
| 13a | The diff breaks nothing else in the task's tests or the earlier probes | no | confirmed | 4 test files on SQLite → 69 passed; servers → 23 passed each; P3, P4, P5 as in re-check 1 on all four |

**Overall:** met. Every row of task 2's blind and adversarial passes is now confirmed. Remark: `disableAll` (for `disable-sso`, task 8) turns providers off without a version check; off is the safe direction.

## Task 3 — The OpenID Connect type and a fake provider

Witnessed: 2026-10-16 22:26 EDT, by a fresh agent (blind). Commit: 4af0fb60 (+ uncommitted: errors.ts diff, oidc-presets.ts, oidc-provider-type.ts/.test.ts, provider-type-registry.ts, fake-oidc-server.ts). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The type has fields and parse, `start`, `complete`, `test` and `instructions`, and is registered | no | confirmed | `oidc-provider-type.ts:128-300`; `provider-type-registry.ts:5`; the test file → 45 passed |
| 2 | Discovery tests: https or loopback issuer, redirect refused, issuer mismatch refused | no | confirmed | `checkIssuer` `:32-43`; tests `:59-84`, `:317-342`; oauth4webapi `build/index.js:309` compares `href`s; `redirect: 'manual'` at :237, :961, :1170 |
| 3 | PKCE (S256), state and nonce sent and enforced | no | confirmed | `start` `:179-198`; test `:143-163`; forged state, wrong nonce, reused code or another verifier refused (`:251`, `:216`, `:267`) |
| 4 | A bad signature is refused, and the test fails without `validateApplicationLevelSignature` | no | confirmed | call at `:220` with the token `Response`; M1 (call removed) → 1 failed / 44 passed |
| 5 | `exp` gets 5 minutes of leeway | no | confirmed | `:24`, `:113`; test `:227`; M3 (clockTolerance removed) → it fails |
| 6 | Ronne checks `iat`: more than 5 minutes in the future, or from before the sign-in started minus 5 minutes, is refused | no | confirmed | `:225-231`; test `:234`; M2, M5, M6 each fail it; probe `probe-iat-anchor.mts`. Remark: M4 (lower bound from `now` instead of `startedAt`) survives the suite |
| 7 | `sub` and email required; email_verified true or "true"; `xms_edov` only for Entra and only without email_verified | no | confirmed | `:232-242`; tests `:177-192`, `:246` |
| 8 | Groups: a missing claim gives null; a single string and a custom claim are read | no | confirmed | `groupsFrom` `:117-123`; test `:194-209` |
| 9 | Down, refusing or slow → `provider_error`; a bad response → `invalid_response` | no | confirmed | `flowError` `:68-84`; 10 s timeout `:92`; tests `:298`, `:308` |
| 10 | The fake serves discovery, keys, authorize and token, with the switches | no | confirmed | `fake-oidc-server.ts:120-208`, switches `:26-53`; decodes form-encoded Basic credentials (`:166-170`) |
| 11 | Presets are data, all seven, each issuer pattern tested | no | confirmed | `oidc-presets.ts:34-212`; tests `:362-411`; issuer formats match each vendor's |
| 12 | Instructions start with the redirect URI, then the preset's steps; Entra's mention `email`, `xms_edov` and the overage | no | confirmed | `:291-300`; test `:413`; `oidc-presets.ts:78-84` |

**Overall:** met. Findings: the `iat` lower bound's anchor isn't pinned by a test (M4); `test()` fetches `jwks_uri` without the https rule.

### Re-check 1 (blind: the diff since the pass)

Witnessed: 2026-10-16 22:31 EDT, by a fresh agent (blind). Commit: 4af0fb60 + the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | Ronne checks `iat` itself, and a test pins the lower bound to the sign-in's start | no | confirmed | new test `oidc-provider-type.test.ts:246-259`; 46 passed; M4 → that test fails, 1 failed / 45 passed |
| 13 | `test()` refuses a `jwks_uri` that isn't https or loopback http, before fetching it | no | confirmed | `oidc-provider-type.ts:269-273`; probe `probe-jwks-http.mts http` → `ok:false`, "isn't https"; `loop` → `ok:true`. Remark: no unit test covers it (disabling the check → 46 passed) |

**Overall:** met. Finding: the keys rule has no test.

### Re-check 2 (blind: row 13's test)

Witnessed: 2026-10-16 22:34 EDT, by a fresh agent (blind). Commit: 4af0fb60 + the uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | `test()` refuses a `jwks_uri` that isn't https or loopback http, before fetching it, and a test covers it | no | confirmed | `fake-oidc-server.ts:54,131` switch `insecureJwks`; test `oidc-provider-type.test.ts:367-371`; 46 passed; mutation (`if (!jwksUrl)` → `if (false)`) → 1 failed / 45 passed; restored (sha1 matches) |

**Overall:** met. Every row of task 3 is confirmed.

## Task 4 — Sign-in and accounts

Witnessed: 2026-10-16 22:45 EDT, by a fresh agent (blind). Commit: 2e944960 + working tree (uncommitted diff and untracked sso files). Machine: macOS (Darwin 27.0.0), Node v24.0.0.

The pass's mutation harness collided with another witness's `scratchpad/bak` folder, so its mutations stayed in four untracked files for a few minutes; it restored each by hand (every line matching the snapshots taken before), and the implementer checked the files and the suite (22/22) afterwards.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | db tests pass on SQLite and the three servers | no | confirmed | SQLite → 22 passed; `pnpm test:db:postgres` / `:mysql` / `:mariadb -- …/sso.db.test.ts` → 22 passed each |
| 2 | db tests cover every branch of the decision list | no | partly | mutations of the verified-email and linked-subject checks are caught; `if (linked.disabledAt)` removed survives 22/22, because the session hook refuses the disabled account later. The other branches each have a test (`:109`, `:147`, `:158`, `:195`, `:216`) |
| 3 | Creation goes through the same service as Create user, with a personal workspace | no | partly | the same repository code (`insertUser`, with `global` and the personal workspace, test `:109`), not the Create user service: `normalizeName` and `emailTaken` are skipped; `nameFor` slices to 255 (can split a surrogate pair) |
| 4 | A new subject with an email already linked (same provider) is refused | no | confirmed | tests `:234`, `:249`; removing the `linkedSubjects` check fails both |
| 5 | A changed email at the provider keeps the link | no | confirmed | test `:226` |
| 6 | "The same email in two providers by two different people" is refused | no | not met | probe P1: ana linked at `acme`; provider `beta` (same domain, link by email) sends `sub-impostor-at-beta` with `ana@acme.com` → signed in as ana, the subject linked to her. `linkedSubjects` looks at the current provider only; SPEC also says "an account can be linked to several providers" |
| 7 | Root signs in when linked by email, and nothing changes root | no | confirmed | test `:280` |
| 8 | A disabled account is refused, linked or matched by email | no | confirmed | test `:256` (the linked case backed by the session hook) |
| 9 | An off-site `next` lands on `/` | no | confirmed | test `:320`; probe P4 (`/\t/evil.example`, `" //evil.example"` → `/`) |
| 10 | Another browser's state, used twice, after 10 minutes, or another provider's callback → `expired` | no | confirmed | tests `:332`/`:342`/`:353`/`:368`; each check's removal caught; race probe R1 (same state twice at once, 5 runs) → never two sign-ins. A mutation ignoring the deleted-rows count isn't caught by the suite |
| 11 | Sign-in in progress: a `verification` row by the state's hash, deleted on first use, plus an HttpOnly SameSite=Lax cookie | no | confirmed | `saveState`/`takeState`; test `:383` |
| 12 | The session endpoint is server-only (404 over HTTP); the allowlist is unchanged | no | confirmed | test `:452`; mutation of `SERVER_ONLY` fails it |
| 13 | The only new HTTP route is the callback | no | confirmed | `app/api/auth/sso/callback/[id]/route.ts`; `proxy.ts:50` skips `api/` |
| 14 | Session like a password one; the events | no | confirmed | tests `:109`, `:195`, `:147`; actions, log events and summaries added |
| 15 | Two-factor isn't asked | no | confirmed | probe P2 (two-factor user → signed in); no test in the suite |
| 16 | Callback errors go to `/sign-in?error=<code>`, the provider's text not shown | no | confirmed | test `:430`, probe P5 |
| 17 | Limiter on the start and the callback | no | partly | only the start is tested; the callback's limiter has no test |
| 18 | Two first sign-ins at once create one account | no | confirmed | test `:288` on all four |

**Overall:** not met: a second provider links a different subject to an account already linked elsewhere (row 6, for the owner: the spec contradicts itself); the linked-disabled branch and the callback limiter lack tests that fail without them; creation is the same repository function, not the Create user service.

Witnessed: 2026-10-16 22:58 EDT, by a fresh agent (adversarial). Commit: 2e944960 + uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

Runs between 22:48 and 22:50 read the other pass's mutations (see the blind pass) and were discarded; every verdict comes from runs before 22:48 or at 22:53 and later.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's db tests pass on all four databases | no | confirmed | 22 passed each (MySQL and MariaDB before the window, PostgreSQL runs 5–7 after it) |
| 2 | Verified email is required, before anything else | no | confirmed | `sso-sign-in.ts:39`; the test passes with an existing account and no link written |
| 3 | A disabled account is refused, linked, by email, or disabled between decision and session | no | confirmed | `:44,57`; probe P3: `startSession` on a disabled user → `null`, 0 sessions; `sso.ts:263`. The race has no test of its own |
| 4 | A known link signs in, subjects compared exactly, a changed email keeps the link | no | confirmed | `kysely-sso-repository.ts:73` compares in JS; tests; P8: a subject linked on `acme` doesn't sign in on `beta` |
| 5 | Link by email only for that account's verified email, only with link-by-email on, never when the account has another subject of this provider | no | not met | probe P1: an IdP-verified `Kate@acme.com` (KELVIN SIGN) → `normalizeEmail` lowercases it to `kate@acme.com` → signed in as Kate, on all four databases |
| 6 | Create only for a listed domain: a `user` in `global` with a personal workspace, no password | no | confirmed | the test; `role: "user"` hard-coded; shares `insertUser` with Create user (the same repository write, not the same service) |
| 7 | Refuse otherwise | no | confirmed | `:66`; tests |
| 8 | Root signs in only when linked by email; its role is unchanged | no | confirmed | test; P9 (a second provider links root, role stays `root`) |
| 9 | Concurrent first sign-ins create one account (one provider, and two providers with one email) | no | confirmed | test; P7 (acme and beta at once) → 1 user, links on one user, all four |
| 10 | An off-site `next` lands on `/` | no | confirmed | test; P12 (`/\t/evil.example`, `/a/..//evil.example`, `/sign-in?next=//evil` → `/`) |
| 11 | The state: this browser's, once, under 10 minutes, this provider's callback | no | confirmed | tests; P11 (replayed twice at once → one `/`, one `expired`); P6 (a wrong cookie before the right one → `expired`) |
| 12 | The session endpoint is a 404 over HTTP | no | confirmed | test; P10/P13 straight to `app.auth.handler` with path variants → 404, no Set-Cookie |
| 13 | The events are recorded, with no token or secret | no | confirmed | asserted in tests; logs carry reason, provider and `detail` only |
| 14 | The tests fail when the code is broken | no | partly | the other pass's mutations failed the right tests; nothing covers case-folding or the disable race |
| 15 | The start and the callback are rate-limited | no | partly | 30/min per IP with `TRUST_PROXY`; without it `clientIp` is null and there's no limit |

**Overall:** not met: link by email maps a Unicode case-folded address onto someone else's account. Also: a malformed state cookie gives a 500 (`decodeURIComponent` throws, P5); a state saved with `test` completes a real sign-in (P4, latent for task 6).

### Re-check 1 (blind: rows 2, 3, 6, 10, 17 and the diff)

Witnessed: 2026-10-16 22:58 EDT, by a fresh agent (blind). Commit: 2e944960 + working tree. Machine: macOS (Darwin 27.0.0), Node v24.0.0. Backups in its own folder `scratchpad/106-t4-blind/`, `cmp` after each restore.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass on SQLite and the three servers | no | confirmed | SQLite 62 passed (3 files); servers → 30 passed each |
| 2 | db tests cover every branch, including a linked disabled account | no | confirmed | mutation of `if (linked.disabledAt)` → "refuses a linked account that was disabled" fails (`:283`) |
| 3 | Creation goes through the same path as Create user; the name follows Create user's rule | no | partly | the name rule holds (mutation to a UTF-16 slice → `:324` fails); but SPEC.md:49 and :144 still say "the same service as Create user", while the code shares only the repository write |
| 4 | A new subject of the same provider is refused; another provider's verified email links (SPEC as changed) | no | confirmed | SPEC's edge case; tests `:237`, `:252`; probe P1. Depends on the owner agreeing to the SPEC change |
| 5 | One state replayed by two callbacks at once is taken once | no | confirmed | removing the deleted-rows check → `:402` fails; passes on all three servers |
| 6 | The callback is limited per client IP | no | confirmed | mutation → `:548` fails |
| 7 | Non-ASCII emails are never matched or created | no | confirmed | mutation → `:303` fails |
| 8 | A malformed state cookie gives `expired` | no | confirmed | mutation rethrowing → `:397` fails |
| 9 | A *Test sign-in*'s state never opens a session | no | confirmed | removing `sso.ts:242` → `:419` fails |

**Overall:** not met: SPEC.md still names the Create user service (row 3).

### Re-check 1 (adversarial: rows 3, 5, 14, 15 and the diff)

Witnessed: 2026-10-16 23:03 EDT, by a fresh agent (adversarial). Commit: 2e944960 + uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0. Between 22:59 and 23:01 its mutations and the blind pass's overlapped on `sso.ts` and `sso-sign-in.ts`; from 23:01:31 the three source files were `cmp`-identical to the blind pass's originals before and after every run below (the implementer checked again afterwards).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's db tests pass on all four databases | no | confirmed | 30 passed each (23:01–23:03) |
| 3 | A disabled account is refused, including between decision and session | no | confirmed | tests `:283`, `:568`; no test drives the callback through the null-session line |
| 5 | Link by email only for that account's own verified email | no | not met | Kelvin sign → `not_allowed` on all four; fullwidth, zero-width, ideographic full stop, combining accent, `ACME.Kom`, whitespace, NUL, newline, `;`, trailing-dot domain → refused on all four. R7: a Ronne user `kåte@acme.com` and an IdP-verified `kate@acme.com` with a new subject → on MySQL and MariaDB signed in as `kåte@acme.com` (accent-insensitive `=` in `findUserByEmail`) |
| 14 | The tests fail when the code is broken | no | confirmed | in `scratchpad/106-t4-adv`: removing `PLAIN_EMAIL`, rethrowing in the cookie `catch`, removing the test-state guard → each caught |
| 15 | The start and the callback are rate-limited; the spec says what happens without `TRUST_PROXY` | no | confirmed | both tests pass; SPEC.md:189 |
| 16 | A malformed state cookie gives `expired` | no | confirmed | R5 → `error=expired` on all four |
| 17 | A state with `test` set never opens a session | no | confirmed | R4 → `error=expired`, no session, no user, on all four |
| 18 | Unusual but ASCII addresses aren't taken over | no | confirmed | `KATE@ACME.COM` links `kate@acme.com` (by design); `"kate"@acme.com`, `kate%40acme.com@acme.com` create their own accounts |

**Overall:** not met: on MySQL and MariaDB an ASCII email links an existing account whose address differs only by an accent.

### Re-check 2 (blind: row 3)

Witnessed: 2026-10-16 23:03 EDT, by a fresh agent (blind). Commit: 2e944960 + working tree. Machine: macOS (Darwin 27.0.0), Node v24.0.0. Read-only.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | Creation uses Create user's repository write (user, `global` row, personal workspace, one READ COMMITTED transaction), Create user's name rule, no password, never root, and SPEC.md says so | no | confirmed | `grep "same service" SPEC.md` → nothing; SPEC.md:49-51, :144-146; `kysely-sso-repository.ts:111` → `createUserWithoutPassword({ ...user, role: "user" })` → shared `insertUser`; `passwordHash` null (test `:112`); runs in `readCommittedTransaction` (`db/locks.ts:21`); `nameFor` uses `normalizeName` |

**Overall:** met. Row 4 of re-check 1 (another provider's verified email still links) stands on the SPEC change the owner is asked to confirm.

### Re-check 2 (adversarial: row 5)

Witnessed: 2026-10-16 23:08 EDT, by a fresh agent (adversarial). Commit: 2e944960 + uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0. Mutations only in a scratch copy of the repository.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's db tests pass on all four databases | yes | confirmed | 31 passed each (23:07–23:08) |
| 5 | Link by email only for that account's exact verified email, never one the database's collation calls equal | yes | confirmed | `sso-sign-in.ts` refuses when `existing.email !== email`. Probe on all four: `kåte@`/`kate@`, `émile@`/`EMILE@` → MySQL and MariaDB `not_allowed`; `straße@`/`strasse@`, `æther@`/`aether@`, NFD `kåte@` → MySQL `not_allowed`, MariaDB a new account; `ıvan@`/`ivan@` → MySQL new account, MariaDB `not_allowed`; SQLite and PostgreSQL a new account every time; a stored trailing space → MariaDB `not_allowed`; an exact match in another case still links on all four. Mutation in the scratch copy: removing the check → the new test fails on MySQL; restored → passes |

**Overall:** met. Every row of task 4's blind and adversarial passes is now confirmed; row 4 of the blind re-check (another provider's verified email links) stands on a SPEC change for the owner to confirm.

## Task 5 — Groups

Witnessed: 2026-10-16 23:19 EDT, by a fresh agent (blind). Commit: 6c3948d3 + working tree. Machine: macOS (Darwin 27.0.0), Node v24.0.0. Mutations only in its scratch copy (`scratchpad/106-t5-blind/`); the repository was never edited.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass on SQLite | no | confirmed | 2 files, 21 tests passed |
| 2 | The db test passes on PostgreSQL, MySQL and MariaDB | no | confirmed | 10 passed on each |
| 3 | Joining a mapped group adds the membership with `source` = provider; leaving removes it | no | confirmed | `planGroupChanges`; db tests; M5 (removal loop off) → 2 fail |
| 4 | Two mappings to one workspace give the higher role, dropping when one group goes | no | confirmed | `higher()`; M3 → that test fails |
| 5 | A hand-set membership is never raised, lowered or removed by a mapping | no | partly | rows inserted with `source` null stay untouched (M2 → test fails). But a role root changes on a group-given row (`changeMemberRole` → `putMember`) keeps `source` = provider: the next sign-in reverts it, and leaving the group deletes the row (probe, all four databases) |
| 6 | The plain `global` `user` row can be taken over, then goes back to hand-set `user` | no | confirmed | `defaultGlobal`/`release`; db test |
| 7 | A mapping whose workspace was deleted is skipped, and the form warns | no | confirmed | FK `SET NULL`; `listGroupMappings` warning; M4 → test fails |
| 8 | Root is never changed by groups | no | confirmed | `!outcome.root`; `isMappedRole` rejects `root`; M1 → test fails |
| 9 | Group changes are audited `workspace.member_*` with `via: "sso"`, in the sign-in's transaction | no | confirmed | `applyGroups` inside `repo.transaction`; M7 (`via: "web"`) → 2 fail |
| 10 | A missing groups claim changes nothing | no | confirmed | `groupsFrom` → null, early return; M6 → test fails |
| 11 | Mappings saved with the provider, named in the update event; the checks | no | confirmed | `checkMappings`, `sameMappings`, `replaceMappings`; tests; probes: 4-byte emoji groups intact, `Admins`/`admins` distinct on all four |
| 12 | Deleting a provider removes its group-given memberships; turning it off leaves them | no | confirmed | `releaseSourcedMemberships` only from `deleteProvider`; 69 passed |

**Overall:** not met: a role root sets by hand on a group-given membership is undone at the next sign-in.

Witnessed: 2026-10-16 23:23 EDT, by a fresh agent (adversarial). Commit: 6c3948d3 + working tree. Machine: macOS 27.0.1, Node v24.0.0. Mutations and probes only in its scratch copy.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Joining a mapped group adds the membership, `source` = provider, audited with `via: "sso"` | no | confirmed | SQLite 10 passed; the 3 files 64/64 on PostgreSQL, MySQL, MariaDB; M8 → 2 fail |
| 2 | Leaving a group removes what it gave | no | confirmed | M7 → 3 fail |
| 3 | A provider-given membership goes when the provider no longer gives it | no | partly | P3: removing 1 of 2 mappings revokes; removing the last leaves it for good (`applyGroups` returns early on no mappings) |
| 4 | Two mappings give the higher role, dropping when one group goes | no | partly | the code is right, but M4 (last-wins) passes both suites: the tests list user before moderator |
| 5 | A hand-set membership is never raised or lowered by a mapping | no | partly | null-source rows alone (M1 → fails). P1/P2/P6: root's change of a group-given row (`putMember` keeps `source`) is undone at the next sign-in, or the row deleted when the group goes, in `global` too |
| 6 | Root is never changed by a groups claim | no | confirmed | M2 → test fails; `role: "root"` refused at save |
| 7 | A deleted workspace's mapping is skipped, the form warns | no | confirmed | M3 → test fails |
| 8 | Nobody leaves `global`: takeover and release | no | confirmed | M6 → test fails; P6 events |
| 9 | A missing claim, or one that isn't a list of strings, changes nothing | no | confirmed | M5 → test fails; P4 (`["Café", 5]`, `{a:"ops"}` → unchanged; `"ops"` → added; a 10,000-char group → no error) |
| 10 | Groups compare byte for byte on every dialect | no | confirmed | P4 (case, whitespace, NFD) → no membership; P7 (workspace id by case) refused on MySQL |
| 11 | No escalation into personal workspaces or other providers' rows | no | confirmed | db test; unit test |
| 12 | Concurrent sign-ins of one person with changing groups stay consistent | no | confirmed | P5: 6 concurrent callbacks on SQLite, PostgreSQL, MySQL → consistent with the audit trail |

**Overall:** not met: a hand edit of a group-given row is undone; removing the last mapping never revokes; no test pins the higher-role rule.

### Re-check 1 (adversarial: rows 3, 4, 5 and the diff)

Witnessed: 2026-10-16 23:27 EDT, by a fresh agent (adversarial). Commit: 6c3948d3 + working tree. Machine: macOS 27.0.1, Node v24.0.0. Mutations only in its scratch copy.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | A provider-given membership goes when the provider no longer gives it, including after the last mapping is deleted | no | confirmed | P3 on all four: removing 1 of 2 → `{eng}`, removing all → `{global:'user'}`; M10 (the early return back) → the new test fails; a missing claim still changes nothing |
| 4 | Two mappings give the higher role, whatever their order | no | confirmed | M4 (last wins) → the new unit test fails |
| 5 | A hand-set membership is never changed by a mapping, including a group-given row a person has changed since | no | confirmed | `putMember` writes `source: null` on insert and update (kysely-workspace-repository.ts:715-722); P1, P2, P6 on all four keep root's role; M9 → the new db test fails; every `putMember` caller is a person's action (members.ts:263/299/381, access-requests.ts:280) |
| D | The diff breaks nothing in the task's or Members' tests | no | confirmed | 32/32 on all four; unit 12/12 |

**Overall:** met.

### Re-check 1 (blind: row 5 and the diff)

Witnessed: 2026-10-16 23:26 EDT, by a fresh agent (blind). Commit: 6c3948d3 + working tree. Machine: macOS (Darwin 27.0.0), Node v24.0.0. Mutations only in its scratch copy.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | A hand-set membership is never changed by a mapping, including a group-given row once a person changes it | no | confirmed | `putMember` writes `source: null` (insert and update); every caller goes through it; the other inserts are new user/`global` rows (source null); probe passes on all four (13 each); M8 → the new db test fails |
| 13 | Deleting the last mapping still removes what earlier mappings gave | no | confirmed | `applyGroups` returns early only with no mappings and no sourced rows; M9 → the new test fails |
| 14 | Two mappings give the higher role whatever their order | no | confirmed | `group-sync.test.ts:37`; M10 → it fails |
| 15 | Task tests and workspaces members tests pass on all four databases | no | confirmed | 25 passed on each from the scratch copy; members 13 passed each from the repo |

**Overall:** met. Every row of task 5's blind and adversarial passes is now confirmed.
