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

## Task 6 — The panel and the form

Witnessed: 2026-10-16 23:58 EDT, by a fresh agent (blind). Commit: 16f7ed0e + uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0. Mutations only in its scratch copy.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's component and db tests pass | no | confirmed | 3 files, 47 passed |
| 2 | The db tests pass on PostgreSQL, MySQL and MariaDB | no | confirmed | 11 passed on each |
| 3 | The panel: name, type · preset, issuer, domains, status badge, last sign-in; empty state with Add provider; root only | no | confirmed | panel tests; the 4 badges; `page.tsx` notFound; `providerPage`/`testConnection` reject a moderator |
| 4 | Add provider opens on the 7 presets; choosing one fills the name, issuer pieces, scopes, groups claim | no | confirmed | test "opens on the presets as cards"; the fill only covered by the phone e2e |
| 5 | The redirect URI with Copy, first in the steps beside the form | no | partly | Edit: yes. Add: the Copy holds `…/api/auth/sso/callback/<id>` literally, not the id typed |
| 6 | The client secret is write-only | no | confirmed | test; `IdentityProvider` has `hasSecret` only |
| 7 | The id rule; it can't change | no | confirmed | `pattern`; `RESERVED_IDS`; no id input on edit |
| 8 | Domains, link by email, groups claim, group rows, deleted-workspace warning | no | confirmed | test; blank rows dropped |
| 9 | A stale form says it is stale | no | confirmed | test; M2 → it fails |
| 10 | Two roots edit at once: the first save wins | no | confirmed | `Promise.allSettled` probe → 1 fulfilled on SQLite, PostgreSQL, MySQL |
| 11 | Test connection answers in words; a failure marks *Failing* | no | confirmed | db test on all four |
| 12 | Test sign-in: a plain POST form in a new tab; root only; Origin checked | no | confirmed | component test; db tests (403; non-root 303 `&test=unavailable`); M4 → fails |
| 13 | Test sign-in changes nothing | no | confirmed | db test; probe with an existing user and a mapped group: snapshots equal on SQLite, PostgreSQL, MySQL |
| 14 | A test counts only for its root, in their browser, for its version | no | confirmed | db tests; M3, M5 → fail |
| 15 | Turn on needs the test (UI and server), cleared by a retest edit | no | confirmed | test; M1 → fails; probe |
| 16 | The phone sweep passes | no | can't check here | `next build` in the scratch copy fails on symlinked `node_modules`; not built in the repository |
| 17 | Component tests cover each state | no | partly | not covered: the form after a preset is chosen, Test connection's result notice, a failed Test sign-in, the `?test=` notices, the Delete confirm |
| 18 | The new HTTP routes are the callback and Test sign-in's start; the allowlist unchanged | no | confirmed | `find src/app/api/auth -name route.ts`; `better-auth.ts:32`; 42 passed |

**Overall:** not met: the Add form's Copy gives a `<id>` placeholder, several states lack component tests, and the phone sweep couldn't be run here.

### Re-check 1 (blind: rows 4, 5, 16, 17)

Witnessed: 2026-10-17 00:20 EDT, by a fresh agent (blind). Commit: 16f7ed0e + uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | Choosing a preset card fills the form: the id starts as the preset's, a fixed issuer is filled in | no | not met | only on a fresh page load: a card click (client navigation) keeps the cards view's state (`useState` already ran with no preset). Playwright probe: click "Google Workspace" → id `""`, issuer `""`, Copy `…/callback/<id>`; after a reload, `google` and the Google issuer |
| 5 | The redirect URI follows the id as it's typed (`<id>` only while empty) | no | confirmed | probe: `abc-1` → `…/callback/abc-1`; tests pass; M6 → fails |
| 16 | The phone sweep passes | no | confirmed | `pnpm test:e2e -- --project=phone --project=phone-webkit --project=tablet identity-providers mobile-sweep` from the repository → 153 passed (3.9m), exit 0 |
| 17 | Component tests cover each state | no | partly | 22 passed; M7, M8 → fail. Not covered: reaching the chosen-preset form by clicking a card (row 4) |

**Overall:** not met: a preset chosen by clicking its card leaves the id and the fixed issuer empty until a reload.

### Re-check 2 (blind: rows 4 and 17)

Witnessed: 2026-10-17 00:13 EDT, by a fresh agent (blind). Commit: 16f7ed0e + uncommitted working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | Choosing a preset card fills the form: the id, a fixed issuer, and the redirect URI follows | yes | confirmed | `ProviderPage.tsx:67` `key={provider?.id ?? \`new:${preset ?? ""}\`}`; after `next build`, the Playwright probe: click "Google Workspace" → id `google`, issuer `https://accounts.google.com`, `<id>` shown 0 times; typing `abc-1` → `…/callback/abc-1` (before the fix: `""`, `""`, 1) |
| 17 | Component tests cover each state, including a preset reached by a card click | yes | confirmed | 22 passed; the card click is covered by the phone e2e (`identity-providers.mobile.e2e.ts:25-31`) → 3 passed on phone, phone-webkit, tablet; the probe saw it fail before the fix |

**Overall:** met. Every row of task 6 is now confirmed (rows 1-3, 6-15, 18 in the first pass, 5 and 16 in re-check 1, 4 and 17 here).

## Task 7 — The sign-in page and the password policy

Witnessed: 2026-10-17 00:24 EDT, by a fresh agent (blind). Commit: d592e5be (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0. Mutations only in its scratch copy.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's own tests pass on SQLite | no | confirmed | 6 files, 76 passed; db: 3 files, 30 passed |
| 2 | The same db tests pass on PostgreSQL, MySQL and MariaDB | no | confirmed | 30 passed on each |
| 3 | *Everyone*: a non-root signs in with a password on the web and through rmk | no | confirmed | "Everyone (the default)" test; fallback `everyone` |
| 4 | *Root only*: a non-root's right password on the web gets the same `invalid_credentials`, audited `password_disabled` | no | confirmed | test; M1, M6 → fail; probe: moderator and unknown email → the same, SQLite and PostgreSQL |
| 5 | *Root only*: root keeps the password on the web and through rmk | no | confirmed | test; probe `"  ROOT@Acme.com "` → ok on both |
| 6 | Token exchange: 403 for a non-root's right password, 401 for a wrong one, no token | no | confirmed | `api-v1.db.test.ts`, `password-policy.db.test.ts`; M2 → both fail; the check runs after the password matches |
| 7 | *Root only* holds only while a provider is on | no | confirmed | M5 → test fails; U1 → UI test fails |
| 8 | *Root only* can't be chosen without an enabled, tested provider (server and form) | no | confirmed | 3 db cases; M3 → fails; form test; U2 → fails |
| 9 | The confirm, with the count; audited `instance.password_sign_in_changed { from, to }` | no | confirmed | test; M4 → fails; `passwordUsersAffected` tested; count text read (client state, not rendered by a test); summary probe |
| 10 | Only root may change it; junk refused | no | confirmed | test; probe: no session → ForbiddenError, `"ROOT_ONLY"` → InvalidPasswordSignInPolicyError |
| 11 | Sign-in page: Continue with … under the form with *Everyone*, carrying `next` | no | confirmed | sign-in test; `signInProviders` filters `enabled` |
| 12 | *Root only*: buttons first, the form behind `<details>` "Use your password (root)" | no | confirmed | sign-in test; `app/sign-in/page.tsx:36-50` |
| 13 | Plain provider error messages; disabled = no account; unknown codes show nothing | no | confirmed | sign-in test; U3 → fails; `Object.hasOwn` |
| 14 | Provider buttons 44px on a coarse pointer | no | confirmed | test regex; `Button.tsx:31` |
| 15 | The Sign-in methods panel lists the password rule and each provider | no | confirmed | probe rendering the page (root only, one provider on, one off); no repo test covers it |

**Overall:** met. Remarks: no repo test of the panel listing; `Help.tsx:302` still says "Today with their email and password."; under *Root only* a refused non-root isn't hashed but root is (timing could tell root's email); a disabled non-root is audited `password_disabled`, not `disabled`.

Witnessed: 2026-10-17 00:31 EDT, by a fresh agent (adversarial). Commit: d592e5be + working tree. Machine: macOS 27.0.1, Node v24.0.0. Mutations only in its scratch copy.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | *Root only*: a non-root's password refused on the web with the usual answer, audited `password_disabled`; root still signs in | no | confirmed | 8 files, 100 passed; email case and whitespace variants refused, `" ROOT@ACME.COM "` signs in; M1, M6, M9 → fail |
| 2 | *Everyone*: both sign in, web and rmk | no | confirmed | test; timing equal (~10 ms) |
| 3 | The exchange: 403 only for a non-root's right password; 401 for a wrong one; no token; root gets one | no | confirmed | tests; variants; disabled stays 401; M2, M8 → fail |
| 4 | *Root only* needs an enabled, tested provider | no | confirmed | 3 cases; M3, M7, M13 → fail |
| 5 | The confirm, with the count | no | confirmed | M4 → fails. Gap: M14 (Save without the confirm in the UI) passes the UI tests; the server still enforces it |
| 6 | Only root may change it; crafted values refused | no | confirmed | `"ROOT_ONLY"`, `" root_only"`, `["root_only"]`, `null`, `"none"`, `1` throw; no session throws; M10 → fails |
| 7 | *Root only* holds only while a provider is on | no | confirmed | M5 → fails; a junk stored value reads as `everyone` |
| 8 | Root's password can't be turned off | no | confirmed | two values only; a promoted root signs in, demoted is refused; M6 → fails |
| 9 | Under *Root only*, no other password route for a non-root | no | partly | HTTP routes 404 except the allowlist; but a two-factor challenge issued before the switch completes afterwards (`completeTwoFactorSignIn` doesn't read the policy) → `ok: true` on all four databases |
| 10 | The policy doesn't reveal which accounts exist | no | partly | answers identical; but on the web a non-root or unknown email returns before any hashing and root's doesn't: medians (unknown / non-root / root) SQLite 0.1/0.1/11.0 ms, PostgreSQL 4.8/4.2/19.7, MySQL 5.9/5.0/21.3, MariaDB 2.6/3.5/17.1 |
| 11 | The sign-in page; `?error=` looked up in a list; `next` carried safely | no | confirmed | 24 tests; M11, M15 → fail; odd codes and an HTML provider name escaped; `safeNextPath` cases. Gap: M12 (`in` for `Object.hasOwn`) passes every test |
| 12 | The Sign-in methods panel lists the rule and each provider | no | confirmed | probe; no suite test renders it with providers |
| 13 | Audit: the action and reasons, with summaries | no | confirmed | exact metadata test; summaries present |
| 14 | SQLite: the provider check runs outside the transaction | no | confirmed | `settings.ts`; tests pass on in-memory SQLite |
| 15 | It holds on the servers | no | confirmed | 4 files, 38 passed on each |

**Overall:** not met: a two-factor challenge from before the switch finishes a non-root's password sign-in, and on the web timing shows which email is root's.

### Re-check 1 (blind: row 15 and the diff)

Witnessed: 2026-10-17 00:35 EDT, by a fresh agent (blind). Commit: d592e5be (+ uncommitted working tree). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 15 | The Sign-in methods panel lists the rule and each provider, and drops the *Root only* note with no provider on | no | confirmed | 5 files, 66 passed; R4, R5 → fail |
| 16 | Under *Root only*, a non-root's pre-switch two-factor challenge can't finish; root's does | no | confirmed | `services/two-factor.ts:380-385`; test passes on all four (53 each with the two-factor and session suites); R1 → fails |
| 17 | A refused web sign-in runs a dummy argon2 check | no | confirmed | `actions/session.ts`; R2 → fails; timing probe medians: root wrong 11.5 ms, non-root 10.0, unknown 9.8 |
| 18 | A disabled non-root is audited `disabled` | no | confirmed | `services/session.ts:110`; R3 → fails |
| 19 | Save needs a change, and the confirm (`canSave`) | no | confirmed | `PasswordPolicyForm.tsx:14-18`; R6 → fails |
| 20 | Odd `?error=` codes show nothing; Help and SPEC say the new behaviour | no | confirmed | sign-in test; `Help.tsx:302`; `SPEC.md:187-189` |

**Overall:** met.

### Re-check 1 (adversarial: rows 5, 9, 10, 11, 12 and the diff)

Witnessed: 2026-10-17 00:37 EDT, by a fresh agent (adversarial). Commit: d592e5be + working tree. Machine: macOS 27.0.1, Node v24.0.0. Mutations only in its scratch copy.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | *Root only* needs the confirm, and the form won't save without it | no | confirmed | M14 (`canSave` ignores the confirm) → fails. Gap: M14b (button not using `canSave`) passes the UI tests; the server still refuses |
| 9 | No other password route for a non-root, including a pre-switch two-factor challenge | no | confirmed | probe → `false` on all four (was `true`); `two-factor.ts:382-385`; R1 → fails; 54 passed on each |
| 10 | The policy doesn't reveal which accounts exist, timing included | no | partly | the large gap is gone (SQLite equal); on the servers root is still 2–3.5 ms slower (31-attempt medians, MySQL 13.0/13.2/16.8): Better Auth's own lookups on root's path; two extra lookups on the refused path in the copy brought MySQL to 14.0/13.7/15.5. Low severity (5 attempts a minute) |
| 11 | Odd `?error=` values handled safely | no | confirmed | M12 → now fails the test; 85 passed |
| 12 | The panel lists the rule and each provider, tested | no | confirmed | P1, P2 → fail |

**Overall:** not met: root's wrong-password sign-in is still 2–3.5 ms slower on the database servers under *Root only*.

### Re-check 2 (adversarial: row 10, and M14b)

Witnessed: 2026-10-17 00:41 EDT, by a fresh agent (adversarial). Commit: d592e5be + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | Under *Root only*, nothing tells which accounts exist, timing included | yes | partly | with `findCredentialByEmail` on the refused path, 31-attempt medians (unknown / non-root / root): SQLite 10.1/9.7/11.0, PostgreSQL 13.1/13.3/15.9, MySQL 14.4/15.0/17.6, MariaDB 13.0/13.2/15.6; under *Everyone* within ~1.5 ms. Inference: the rest is Better Auth's own `signInEmail` work, which only root's attempt does. 28 passed on each database |
| 5 | M14b: the Save button's use of `canSave` isn't tested | yes | confirmed | accepted as a known test gap: the server enforces the confirm (M4 fails its test) and `canSave` is tested (M14 fails) |

**Overall:** not met: root's attempt is still 2–4 ms slower on the servers. After two re-checks the owner chose one more round (2026-10-17), with the fix the witness suggested: the refused path runs Better Auth's own sign-in for a reserved address.

### Re-check 3 (adversarial: row 10, the reserved-address fix; owner-approved third round)

Witnessed: 2026-10-17 12:16 EDT, by a fresh agent (adversarial). Commit: d592e5be + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10a | A refused attempt counts once against the limit, writes one audit event, opens no session | yes | confirmed | one `limiter.consume`, before the policy check; the reserved call is server-side; probe → 0 new sessions, 1 audit; 29 passed on each database |
| 10b | Nothing can be reached through the reserved address | yes | not met | root can create the user `refused@sign-in.invalid` (`normalizeEmail` accepts it); then under *Root only* a sign-in typed as `ana@acme.com` with that account's password → a new session for it on all four databases, unaudited |
| 10c | Timing doesn't reveal root's address | yes | partly | 31-attempt medians (unknown / non-root / root): SQLite 10.3/10.5/10.8, PostgreSQL 14.3/14.6/15.7, MySQL 14.4/15.7/15.9, MariaDB 13.9/14.2/15.4 (re-runs alike); root 0.2–1.7 ms slower than a non-root (was 2–4) |

**Overall:** not met: an account at the reserved address opens a session on every refused attempt typed with its password. The owner chose (2026-10-17): fix it, a fourth round on that fix only, and accept the ~1 ms timing residual (10c) as known (low severity: 5 attempts a minute per email, at the edge of what localhost can measure).

### Re-check 4 (adversarial: row 10b; owner-approved fourth round)

Witnessed: 2026-10-17 12:21 EDT, by a fresh agent (adversarial). Commit: d592e5be + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10b | Nothing can be reached through the reserved address: no account can have it, and a refused attempt never leaves a lasting session | yes | confirmed | probe on all four: `adminCreateUser` refuses `refused@sign-in.invalid` and `"REFUSED@Sign-In.INVALID "`; a refused attempt → 0 new sessions, 1 audit. On MySQL and MariaDB an accented look-alike (`…inválid`) is found by the reserved lookup; the fallback ends its session (`sessions left 0`, the log line). A provider's first sign-in runs `normalizeEmail` and refuses it (`sso-sign-in.ts:64-68`, read). Identity, setup and http suites → 799 passed |

**Overall:** met. Every row of task 7 is confirmed, but for 10c: the ~1 ms timing residual, accepted by the owner (2026-10-17). The comment at `services/session.ts:117` was corrected and `docs/knowledge/collations.md` added after this pass.

## Task 8 — Terminal commands

Witnessed: 2026-10-17 12:34 EDT, by a fresh agent (blind). Commit: 86af8465 + working tree. Machine: macOS 27.0.1, Node v24.0.0. Mutations only in its scratch copy.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The script tests pass for disable-sso, rotate-secret, backup and restore (real entry points, SQLite) | no | confirmed | 2 files, 11 passed |
| 2 | `disable-sso` turns every provider off and password sign-in back to everyone, each audited `via: "cli"`, signing nobody out, keeping settings and secrets | no | confirmed | script test; a second run says "Nothing to do"; mutation (`"root_only"`) → the db and script tests fail |
| 3 | `disable-sso` asks first; without a terminal exits 2 unless `--yes`; `--help` works | no | confirmed | script test; strict parseArgs; the "no" path read (needs a TTY) |
| 4 | Wired into every form: pnpm run, root package.json, the Docker image, rmk-server with its service verb | no | confirmed | each file; packages/server → 99 passed incl. `parseArgs(["disable-sso","--yes"])`; gap: `service/args.ts:167-168` help doesn't list it |
| 5 | `rotate-secret` re-encrypts the providers' secrets in the same transaction, never printing them | no | confirmed | script test; inside `repo.transaction`; mutation (no rekey) → the script test fails |
| 6 | Round trip: rotate, backup, restore with settings → the secret still readable, not failing | no | confirmed | script test passes |
| 7 | A restore under another AUTH_SECRET marks each unreadable provider and says so, without printing the secret | no | confirmed | `restore.db.test.ts` on SQLite and the three servers (15/15 each); mutation → fails |
| 8 | The panel then shows *Failing* with "Enter the client secret again" | no | partly | behaviour holds (`identity-provider.ts:93-97`, `ProviderPage.tsx:59`), but removing the `secret_unreadable` clause breaks no repo test, and the notice isn't rendered by one |
| 9 | The db code works on all three servers | no | confirmed | disable-sso 2/2, instance-access 12/12, two-factor-reset 13/13, restore 15/15 on each |
| 10 | The restore and incident runbooks are updated | no | confirmed | `backup.md`, `incident-response.md` (the entry and the new incident) |

**Overall:** not met: no test covers the *Failing* badge or the notice for `secret_unreadable`.

### Re-check 1 (blind: rows 4 and 8)

Witnessed: 2026-10-17 12:43 EDT, by a fresh agent (blind). Commit: 86af8465 + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | `disable-sso` is wired into every form, including the service help | yes | confirmed | `packages/server/src/service/args.ts:167-169`; 99 passed |
| 8 | *Failing* with "Enter the client secret again" after a restore under another AUTH_SECRET, both tested | yes | confirmed | 52 passed; status mutation → `identity-provider.test.ts` fails ("expected 'on' to be 'failing'"); notice mutation → `providers.test.tsx` fails; `ProviderPage.tsx:68` renders `UnreadableSecretNotice` |

**Overall:** met. Every row of task 8 is confirmed.

## Task 9 — End-to-end

Witnessed: 2026-10-17 13:12 EDT, by a fresh agent (blind). Commit: ce8afa00 + working tree (e2e/mobile.ts, two-factor-hold.e2e.ts, users.ts modified; sso.ts, sso.e2e.ts, sso.mobile.e2e.ts new). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm test:e2e` passes the new spec on desktop | no | confirmed | `pnpm test:e2e` → `157 passed (4.5m)`, exit 0; `✓ [chromium] › e2e/sso.e2e.ts:6:1` |
| 2 | …and on phone (and tablet) | no | confirmed | same run → `✓ [phone]`, `✓ [phone-webkit]`, `✓ [tablet] › e2e/sso.mobile.e2e.ts:6:1`; chromium ignores `*.mobile.e2e.ts`, the device projects match only them |
| 3 | It goes through the fake OIDC provider, not a stub | no | confirmed | `sso.ts` `startFakeOidc({…groups})`; its issuer, client id and secret typed into the form; Ann signs in with `Continue with <name>` and lands on `/catalogue` |
| 4 | Root adds a provider from a preset | no | confirmed | Add provider → the Other OpenID Connect card → the redirect URI `/api/auth/sso/callback/<id>` shows → `provider=<id>`, "Secret saved" |
| 5 | Turn on disabled until tested; Test connection and Test sign-in pass; the test creates nothing | no | confirmed | `Turn on` disabled; "The connection works."; popup "Your Test sign-in passed.", `Create the account ann@…`, `join <workspace> as moderator`; the users search then finds no Ann |
| 6 | A new person signs in and is created | no | confirmed | a fresh context signs in through the provider; Admin › Users shows Ann's row |
| 7 | A group grants a role | no | confirmed | `e2e-sso-team` → e2e-team / moderator; Ann's row has a `moderator` badge (only one workspace is mapped) |
| 8 | Root chooses *Root only*: others are refused a password, the provider button shows | no | confirmed | Save scoped to the Password sign-in form → "Password sign-in saved."; signed out: the button shows, the member's right password gets "Email or password is wrong" |
| 9 | `disable-sso` restores password sign-in | no | confirmed | the real `scripts/disable-sso.ts --yes` against the instance's env; output matched; then no provider button, and the member signs in |
| 10 | The two-factor-hold change keeps that test on its own Save button | no | confirmed | scoped to `form "Two-factor sign-in"`; passed in the full run |
| 11 | Minds the sign-in limit: own users per project | no | partly | desktop root and member are its own; the device flow reuses `phoneRoot`/`phoneWebkitRoot`/`tabletRoot`, already signed in by five files: the 6th sign-in, passing only because its timing straddled two windows |
| 12 | A mutation shows the spec fails without the feature | no | can't check here | not done in budget |

**Overall:** not met: the device flow reuses the project's root as its sixth sign-in.

### Re-check 1 (blind: rows 11, 12 and a new row 13)

Witnessed: 2026-10-17 13:27 EDT, by a fresh agent (blind). Commit: ce8afa00 + working tree. Machine: macOS 27.0.1, Node v24.0.0. Mutations only in its scratch copy.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm test:e2e` passes the new spec on desktop | no | confirmed | rerun → `157 passed (4.1m)`, exit 0; `✓ [chromium] › e2e/sso.e2e.ts:6:1` |
| 2 | …and on phone (and tablet) | no | confirmed | same run → `✓ [phone]`, `✓ [phone-webkit]`, `✓ [tablet] › e2e/sso.mobile.e2e.ts:6:1` |
| 11 | Minds the sign-in limit: own users per project | no | confirmed | `phone-sso-root@`, `phone-webkit-sso-root@`, `tablet-sso-root@` in `E2E_ROOTS`, mapped as `ssoRoot` in `mobile.ts`, used by `sso.mobile.e2e.ts`; grep: each SSO root and member is used only by the sso specs, at most twice a run |
| 12 | Mutation: the spec fails without the feature | no | confirmed | `disableSso` mutated to print the same and roll back → `✘ … toHaveCount(expected) Expected: 0 Received: 1` (the button still there); restored (`cmp` identical) → `1 passed` |
| 13 | A failure after choosing Root only no longer leaves it on for later tests | no | confirmed | `cleanUp` set after the save, cleared after disable-sso, `if (cleanUp) disableSso()` in `finally`; gap: set only after the message assertion (since moved before the Save click) |

**Overall:** met. Every row of task 9 is confirmed.

## Task 10 — Documentation

Witnessed: 2026-10-17 13:34 EDT, by a fresh agent (blind). Commit: a0f1762d + working tree (ronne-web: branch docs/106-oidc-sign-in, uncommitted). Machine: macOS 27.0.1, Node v24.0.0. Mutations only in its scratch copy.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The docs render tests pass in ronne-web | no | confirmed | `pnpm lint` 230 files clean; `pnpm typecheck` clean; `pnpm test` 140 passed; mutation (fr `okta` → `oktaX`) → `docs.test.ts` fails "has every topic and section in fr" |
| 2 | Both `topics.ts` have the same slugs and section ids | no | confirmed | probe → "topics app 26 web 26 diffs 0" |
| 3 | Every helper's link lands on a real section | no | confirmed | every href through typed `docsHref(topic, SectionOf<topic>)`; row 2; `DocsPage.tsx:52` renders each section id |
| 4 | The helpers as the spec lists them | no | confirmed | `presetGuide` covers the 7 presets (`other` → `other-oidc`); `password-lockout`; `vitest src/components/help src/features/admin-settings` → 55 passed |
| 5 | Each guide's redirect URI example matches `PUBLIC_URL/api/auth/sso/callback/<id>` | no | confirmed | `Redirect` in en/pt/fr, 8 uses each; `redirectUriFor` at `identity-provider.ts:105` |
| 6 | The Authentication topic in en, pt and fr | no | confirmed | three files, registered in each `index.ts`, DocLink targets identical |
| 7 | Facts match the code (spot checks) | no | confirmed | `planSsoSignIn`, `PROVIDER_ID`, `providerStatus`, retest, delete to user in global, Root only's checks, 30 days, the presets' claims, the UI strings |
| 8 | Signing in explains each message back | no | partly | 6 of 8 `SSO_ERRORS`: `unavailable` and `rate_limited` missing |
| 9 | Each guide has the spec's shape, the usual mistakes included | no | partly | only `other-oidc` has them |
| 10 | admin, security, incidents, rmk, backups updated and true | no | confirmed | each diff against `actions/disable-sso.ts`, `docker/pnpm`, `packages/server/src/cli.ts`, `token-exchange.ts` |
| 11 | pt and fr for every changed en section | no | confirmed | DocLink-target md5 identical across locales for all 7 topics |
| 12 | MVP §14.3 and §15 record what was built | no | confirmed | §14.3 "Built (106)", §15 SSO row, §10 tables match migration 0026 |

**Overall:** not met: two Documentation lines of the spec only partly met (rows 8 and 9).

### Re-check 1 (blind: rows 8, 9 and what the diff touched)

Witnessed: 2026-10-17 13:36 EDT, by a fresh agent (blind). Commit: a0f1762d + working tree. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The docs render tests pass in ronne-web | no | confirmed | lint clean, typecheck clean, 140 passed |
| 2 | Both `topics.ts` still match | no | confirmed | probe → diffs 0 |
| 8 | Signing in explains every message, both new ones included | no | confirmed | all 8 `SSO_ERRORS` in en/pt/fr; `unavailable` at sso.ts:130 and :244; 30 a minute per IP at sso.ts:50 and :125 |
| 9 | Each guide links to the usual mistakes in `providers` (the updated SPEC shape) | no | confirmed | paragraph in `providers` (en:181, pt:183, fr:197); `Claims` ends with a DocLink to it, 7 uses per locale; SPEC.md describes it |
| 10 | rmk#login no longer says a password-less account gets `password_sign_in_disabled` | no | confirmed | split sentence in en/pt/fr; `token-exchange.ts`: no hash → `invalid_credentials` |
| 11 | pt and fr match en in structure and DocLink targets | no | confirmed | md5 identical for authentication, account, rmk |
| 12 | MVP full stop | no | confirmed | MVP.md:662 |

**Overall:** met. Every row of task 10 is confirmed.


## Task 11 — Link by email within the provider's domains

Witnessed: 2026-10-17 16:52 EDT, by a fresh agent (adversarial). Commit: 8bdf8403 + working tree (ronne-web: branch docs/106-oidc-sign-in, 6e37f67). Machine: macOS 27.0.1, Node v24.0.0. Mutations only in its scratch copy.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | An existing account in a listed domain is linked | no | confirmed | `vitest run --project db sso.db.test.ts test-sign-in.db.test.ts` → 45 passed; "links an existing account by verified email" (ana@acme.com). Probe P1: `ANA@ACME.COM` from the provider links ana@acme.com. P7: list `example.org, Gmail.com` → ana@gmail.com links |
| 2 | An existing account in an unlisted domain is not linked (`not_allowed`, no link, no session) | no | confirmed | `sso-sign-in.ts:89` `emailInDomains` before the link. Test asserts no `account` row, the `auth.sso_failed` reason and no `user.sso_linked`. Mutation (check removed) → 3 tests fail. Probes P2 `ana@eu.acme.com` (subdomain), P3 `acme.com.evil.io` / `evilacme.com`, P6 `" ana@gmail.com "` / `ana@gmail.com.` → all refused, no link |
| 3 | Root's account links like any other | no | confirmed | "lets root sign in when linked by email" (root@acme.com, listed) passes. Mutation `if (existing.role === "root") return notLinked(...)` → that test fails. Probe P4: root under an unlisted list → refused, `notLinked: "domain_not_listed"`, no link |
| 4 | An empty list links nobody by email | no | confirmed | "links nobody by email when no domain is listed" (`domains: ""`, linkByEmail on) → `not_allowed`, no `user.sso_linked`. It fails under the row 2 mutation. Probe P5: an account linked before the list was emptied still signs in by its known link, which SPEC 3 allows ("only accounts already linked") |
| 5 | Edge case: another provider links an account only if it lists the domain too | no | confirmed | Probe P8 (`planSsoSignIn`, account already linked at acme): second provider listing `example.org` → refuse `domain_not_listed`; listing `acme.com` → link; empty list → refuse |
| 6 | The form says so | no | confirmed | `ProviderForm.tsx:328` "Email domains this provider signs in", the hint at :339–341, the checkbox at :351 "…in these domains only". `vitest run src/features/admin-settings/authentication` → 29 passed. `e2e/sso.ts:88` uses the new label (e2e not run, as instructed). No unit test asserts the wording |
| 7 | The Test sign-in result says which check stopped the link | no | confirmed | `test-sign-in.ts:43-48` texts for `link_off`, `domain_not_listed` and `linked_to_another`. The new test asserts the `domain_not_listed` sentence and fails under the row 2 mutation. The `link_off` and `linked_to_another` texts are untested |
| 8 | The Documentation says so (en, pt, fr) | no | partly | 6e37f67 updates authentication (the decision list and "Who may sign in") and account (first sign-in) in all three languages. www `pnpm test` → 140 passed, `tsc` exit 0. **But** account.tsx:42-44 (en, same in pt/fr) still explains "You can't sign in here with that account" as "There's no account for your email and its domain isn't allowed, or the account is disabled". An existing account in an unlisted domain now gets that message, and it doesn't fit either explanation |
| 9 | SPEC matches the code (form item 3, step 4, edge case) | no | confirmed | The SPEC diff matches `planSsoSignIn` and its comment at `sso-sign-in.ts:14-17`. `tsc --noEmit` in apps/web → exit 0 |

**Overall:** not met: the domain rule holds and is tested for a listed domain, an unlisted one, root and an empty list (each test fails under its mutation), but the Signing in page's explanation of "You can't sign in here with that account" misses the new case.

### Re-check 1 (blind: row 8 and the diff)

Witnessed: 2026-10-17 16:55 EDT, by a fresh agent (blind). Commit: 8bdf8403 + working tree (ronne-web: branch docs/106-oidc-sign-in, ea97cd3). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 8 | The Documentation says so (en, pt, fr): the Signing in page explains "You can't sign in here with that account" for an existing account the provider can't link | no | confirmed | `git show ea97cd3` touches only `www/src/content/docs/{en,pt,fr}/account.tsx`. en account.tsx:42-46: no account and the domain isn't allowed; or one the provider can't link (domain not listed, linking off, linked to someone else); or disabled. Matches the three `notLinked` refusals in `sso-sign-in.ts:88-92`. pt and fr say the same. The in-app message (`sign-in/types.ts:36-37`) fits |
| 10 | The fix leaves ronne-web building and its tests green | no | confirmed | In www, `pnpm test` → 140 passed; `pnpm exec tsc --noEmit` → exit 0; ronne-web clean at ea97cd3 |
| 11 | Task 11's database tests still pass on SQLite (listed, unlisted, root linked, empty list) | no | confirmed | `vitest run --project db sso.db.test.ts test-sign-in.db.test.ts` → 45 passed; tests at `sso.db.test.ts:229-269` and `test-sign-in.db.test.ts:146-154` |

**Overall:** met. Every row of task 11 is confirmed.

### Re-check 1 (adversarial: row 8 and the diff)

Witnessed: 2026-10-17 16:58 EDT, by a fresh agent (adversarial). Commit: 8bdf8403 + working tree (ronne-web: branch docs/106-oidc-sign-in, ea97cd3). Machine: macOS 27.0.1, Node v24.0.0. No mutations, and no processes started that kept running.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 8 | The Documentation says so (en, pt, fr): the Signing in page explains "You can't sign in here with that account" for an existing account the provider can't link | no | confirmed | en `account.tsx:42-46` gives "linking is off", "its domain isn't one the provider lists" and "linked to someone else at that provider", the three `notLinked` refusals at `sso-sign-in.ts:88-92`, all `not_allowed` (:84), so that message (`sign-in/types.ts:36`). pt and fr say the same three things, in the same order |
| 10 | The fix leaves ronne-web green | no | confirmed | `git show --stat ea97cd3` → only `account.tsx` ×3; `pnpm test` in www → 140 passed; working tree clean |
| 12 | Every case that shows that message fits the page's explanation (all 3 languages) | no | partly | Two cases older than task 11 don't: (a) a non-ASCII address in a listed domain (`sso-sign-in.ts:67`; `sso.db.test.ts:345` → `error=not_allowed`): "its domain isn't allowed" is false; (b) on MySQL/MariaDB, an address the collation calls equal to an existing one (:78-79) fits none of the explanations |
| 13 | What task 11 changed is described truly in the other places that name `not_allowed` | no | partly | `admin-audit/summary.ts:99` says `not_allowed: "no account, and the email's domain may not create one"`, and the `auth.sso_failed` row records only `reason` (`sso.ts:216-221`), so `domain_not_listed`, `link_off` and `linked_to_another` read as "no account". The Test sign-in fallback (`test-sign-in.ts:52`) is false for 12(a) |

**Overall:** not met: the three unlinked cases are explained correctly in en, pt and fr, but two older refusals don't fit the page's words, and the audit log calls an existing account "no account".

### Re-check 2 (adversarial: rows 12, 13 and the diff)

Witnessed: 2026-10-17 17:02 EDT, by a fresh agent (adversarial). Commit: 8bdf8403 + staged changes (ronne-web: branch docs/106-oidc-sign-in, 7ad9256). Machine: macOS 27.0.1, Node v24.0.0. Mutations only in its scratch copy; no processes left running.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 12 | Every case that shows "You can't sign in here with that account" fits the Signing in page's explanation (en, pt, fr) | no | partly | 7ad9256 adds "or your address can't be used here (Ronne only takes plain ASCII email addresses)", which fits a non-ASCII address in a listed domain (probe: Kelvin `Kate@acme.com`, `josé@acme.com` → `unusable_email`). But the MySQL/MariaDB collation twin is also `unusable_email` (`sso-sign-in.ts:93`): the provider's address is plain ASCII and the stored account is the non-ASCII one (probe with an accent-folding fake repo: `kåte@`/`kate@`, `straße@`/`strasse@`). So is a malformed ASCII address (`a@acme`, `a@acme.invalid`). The other cases fit |
| 13 | What task 11 changed is described truly in the other places that name `not_allowed` | no | partly | The audit log is true for each unlinked case and `domain_not_allowed`; the Test sign-in names the account for each. But for `a@acme` the audit says "the address isn't plain ASCII, or isn't exactly the account's" and the Test sign-in "Ronne only matches and creates plain ASCII email addresses": neither is the real reason |
| 14 | The audit row records `why` for every `not_allowed`, and only then | no | confirmed | `sso.ts:224`; `sso-sign-in.ts:76-81`; probe: 10 refusals, `why` on each `not_allowed`, none on `disabled`. db tests → 58 passed. Mutation (drop `why: outcome.why`, sso.ts:286) → 2 tests fail; restored, `cmp` identical |
| 15 | The audit summary uses `why` first and falls back to `reason` | no | confirmed | `summary.ts:207`; `vitest run src/features/admin-audit` → 17 passed. Hostile `why` (`__proto__`) prints oddly, but only code writes it, and `reason` had the same lookup |
| 16 | The Test sign-in texts match the plan for each `why` | no | confirmed | probe: each of the 5 values gives its sentence; asserted in `test-sign-in.db.test.ts:146-163` |
| 17 | SPEC step 4 matches the code | no | confirmed | SPEC.md:159-163 and `sso-sign-in.ts:30-35, 82-104`; ronne-web `pnpm test` → 140 passed |

**Overall:** not met: `unusable_email` also covers the MySQL/MariaDB collation twin and malformed ASCII addresses, where "not plain ASCII" is false. Two adversarial re-checks done: the owner decides (state-witness.md).

### Re-check 3 (adversarial: rows 12, 13 and the diff)

Witnessed: 2026-10-17 17:20 EDT, by a fresh agent (adversarial). Commit: 8bdf8403 + staged changes (ronne-web: branch docs/106-oidc-sign-in, e4e3828). Machine: macOS 27.0.1, Node v24.0.0. Mutations only in its scratch copy (each file restored and checked with `cmp`); no processes started that kept running.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 12 | Every case that shows "You can't sign in here with that account" fits the Signing in page's explanation (en, pt, fr) | no | partly | e4e3828 names "not plain ASCII / not a valid address / differs only by accents or letter forms". Probe over `planSsoSignIn`: `kåte@` twin and `ﬁn@` twin → `lookalike_email`; `a@acme`, `"a b"@acme.com`, `a@acme.invalid`, 300 characters → `invalid_email`; `ana@acme.com.` → `domain_not_allowed`; subdomain → `domain_not_listed`; all fit. Open, from MySQL 8.4's documented collation (no server here): a stored `ka­te@` (soft hyphen) or zero-width space twin may compare equal to `kate@`, and "accents or letter forms" would then be false |
| 13 | What task 11 changed is described truly in the other places that name `not_allowed` (audit summary, Test sign-in) | no | partly | Each `why` has its own true sentence (`summary.ts:112-120`, `test-sign-in.ts:43-55`) for the inputs of row 12; the same invisible-character twin reads "differs only by accents or letter forms" in both |
| 18 | The split into `non_ascii_email` / `invalid_email` / `lookalike_email` follows the input (`sso-sign-in.ts:85-99`) | no | confirmed | Probe as row 12. Mutations: drop the non-ASCII check → "not plain ASCII" fails; drop the domain check → 2 fail; `lookalike` → `invalid` → 1 fails |
| 19 | `services/sso-sign-in.test.ts` covers every `why`, root linked and an empty list | no | confirmed | unit + admin-audit → 27 passed; db `sso.db.test.ts` + `test-sign-in.db.test.ts` → 46 passed (SQLite); rows at `sso-sign-in.test.ts:63-107`, root :113, empty list :93 |
| 20 | `said` reads only a table's own entries; SPEC step 4 matches the code | no | confirmed | Probe: `why` = `__proto__`, `constructor`, `toString` → the fallback sentence. No test covers it (plain indexing still passes). SPEC.md:159-164 lists the 7 values in `sso-sign-in.ts:31-37`. ronne-web `pnpm test` → 140 passed |

**Overall:** not met: every `not_allowed` input run fits the page, the audit log and the Test sign-in; one MySQL-only wording case (an invisible-character twin) is open. Third adversarial re-check: the owner decides. Also seen, older than task 11: `trim()` drops Unicode whitespace before the ASCII check, so `kate@acme.com` + no-break space links to `kate@acme.com`, against SPEC "never matched".

### Re-check 4 (adversarial: rows 12, 13 and the diff)

Witnessed: 2026-10-17 17:47 EDT, by a fresh agent (adversarial). Commit: 8bdf8403 + staged diff (ronne-web: branch docs/106-oidc-sign-in, 8a1bf43). Machine: macOS (Darwin 27.0.0), Node v24.0.0. Mutations only in its scratch copy, put back afterwards; no servers started. The owner allowed this round after re-check 3.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 12 | Every case that shows "You can't sign in here with that account" fits the Signing in page's explanation (en, pt, fr) | yes | confirmed | `account.tsx:42-52` (en, pt, fr) say the database "compares it as equal to another account's address, which differs by accents, letter forms or invisible characters". Probe (fold drops accents, NFKD forms, soft hyphen, ZWSP, ZWJ, BOM): soft-hyphen, ZWSP, ligature and disabled `kåte@` twins → `lookalike_email`, fits; NBSP and BOM → `non_ascii_email`; `.invalid`, quoted local part, 300 characters → `invalid_email`. ronne-web `pnpm test` → 140 passed |
| 13 | Same for the audit summary and the Test sign-in texts | yes | confirmed | `summary.ts` and `test-sign-in.ts` lookalike sentences name invisible characters; probe audit lines print them; `sso.ts` passes `why` into `auth.sso_failed`. db `sso.db.test.ts` + `test-sign-in.db.test.ts` → 46 passed |
| 14 | Only ASCII spaces are trimmed, so Unicode whitespace is never matched (SPEC "An email that isn't plain ASCII") | yes | confirmed | `sso-sign-in.ts:86`. Probe with `kate@acme.com`: trailing NBSP / U+3000 → `non_ascii_email`; `\v`, `\f`, NUL → `invalid_email`; `" \r\nKATE@acme.com\t "` → link. Mutation back to `trim()` → 2 tests fail. SPEC says exactly this |
| 15 | `sso-sign-in.test.ts` covers each `why`, and root links like anyone | yes | confirmed | unit + admin-audit + probe → 30 passed; one case per `why`, empty list included; both mutations fail it |
| 16 | `summary.test.ts` covers the `said` own-key guard | yes | confirmed | `__proto__`, `constructor`, `toString` as `why`, `constructor` as `reason`; mutating `said` to `table[key]` → 1 failed |

**Overall:** met. Every row of task 11 is confirmed (rows 1–7 and 9 in the first pass, 8 in re-check 1, 12 and 13 here, 10–11 and 14–20 along the way). Gap, not a bug: no test asserts the lookalike sentence's words.

## Task 12 — Limit and lighten the start without a trusted proxy

Witnessed: 2026-10-17 18:00 EDT, by a fresh agent (blind). Commit: ccd1075d + staged diff. Machine: macOS (Darwin 27.0.0), Node v24.0.0. Mutations only in its scratch copy.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Without a trusted proxy (address unknown), all starts share one bucket for the instance, whatever `x-forwarded-for` says | no | confirmed | `sso.ts` `allowed()` uses `sso-start:unknown` on `sharedLimiter` when `ip` is null. Test "shares one bucket…": 3 starts from 3 forwarded IPs, max 2 → third `rate_limited`. Mutation M1 (no-IP always allowed) → fails |
| 2 | Callbacks get a bucket of their own, separate from starts | no | confirmed | `sso-callback:unknown`; same test: 2 callbacks pass after the start bucket is full, the third is `rate_limited`. Mutation M2 (one key) → fails |
| 3 | A known client address is limited per IP and never counted in the shared bucket | no | confirmed | Test "keeps a known address out of the shared bucket". Mutation M6 (always shared) → 3 tests fail |
| 4 | In production the shared buckets are 300 a minute each, the per-IP ones 30 | no | confirmed | `appSharedLimiter()` max 300; default `windowMs = 60_000` (`login-rate-limiter.ts:20`); callers pass no options (`features/sign-in/actions.ts:65`, `api/auth/sso/callback/[id]/route.ts:14`). By reading |
| 5 | The discovery document is cached for sign-ins | no | confirmed | `discovered` map in the singleton type; 2 sign-ins → 1 request. Mutation D1 → fails |
| 6 | The cache expires after 10 minutes | no | confirmed | `discoveryTtlMs = 600_000`; clock +600000 → asks again. Mutation D2 → fails |
| 7 | *Test connection* never uses the cache | no | confirmed | `discover(provider, { fresh: true })`; 2 tests → 2 requests. Mutation D3 → 2 tests fail |
| 8 | Only a good discovery answer is kept | no | confirmed | `set` only after `processDiscoveryResponse`; wrong issuer refused, next start asks again. The comment "drops the good one" isn't backed (the good entry had expired): mutation D4 (no `delete` in `catch`) → still passes |
| 9 | Expired sign-ins in progress are deleted by a later start; live ones and Better Auth's rows stay | no | confirmed | `pruneStates`: `identifier LIKE 'sso-state:%'` and `expires_at < now`. Mutations M3 (no call), M4 (no prefix), M5 (no expiry) → the test fails each time |
| 10 | Pruning runs at most once a minute | no | confirmed | `abs(now - __ronneSsoPrunedAt) >= 60_000`. By reading; no test |
| 11 | The task's tests pass on SQLite | no | confirmed | oidc-provider-type → 47 passed; `--project db src/server/domains/identity` → 280 passed, 1 skipped |
| 12 | The pruning and limiter tests pass on PostgreSQL, MySQL and MariaDB | no | can't check here | told not to start the servers; the implementer reports 36 passed on each |
| 13 | SPEC states decision 11 and the limiter and state details | no | confirmed | SPEC.md:141, :233–239, :364–366 |
| 14 | The Documentation's "Too many attempts" explains the instance-wide limit (en, pt, fr) | no | confirmed | 8c4a366 `account.tsx:68` each: 30 per address, or 300 from everyone together; the password still works |

**Overall:** not met: everything checked holds and each test fails without its fix; row 12 waits for a run on the servers. Test gap: nothing checks that a failed discovery drops a still-valid cached document.

Witnessed: 2026-10-17 18:00 EDT, by a fresh agent (adversarial). Commit: ccd1075d + staged diff. Machine: macOS (Darwin 27), Node v24.0.0. Mutations and probes only in its scratch copy; no servers started.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass | no | confirmed | oidc-provider-type → 47 passed; `--project db src/server/domains/identity` → 280 passed, 1 skipped (SQLite) |
| 2 | With the address unknown, starts share one bucket, and a spoofed header without TRUST_PROXY doesn't get out of it | no | confirmed | Probe P3: rotating `x-forwarded-for`, `x-real-ip`, `forwarded`, max 2 → ok, ok, rate_limited, rate_limited; with TRUST_PROXY, unparsable headers also land in the shared bucket. Mutation M1 → fails |
| 3 | Callbacks have their own shared bucket | no | confirmed | `sso-callback:unknown`; mutation M2 → fails. Probe P5: a rate-limited callback leaves the state row in place |
| 4 | A rate-limited start calls no provider and writes no row | no | confirmed | the limit check comes first; probe P4: verification rows 0 → 0 |
| 5 | A known address stays out of the shared bucket | no | confirmed | test "keeps a known address out"; `allowed()` |
| 6 | 300 a minute shared, 30 per IP | no | confirmed | `appSharedLimiter` 300, `appLimiter` 30, `windowMs = 60_000`; both on `globalThis` |
| 7 | Discovery cached 10 minutes for start and callback | no | confirmed | probe Q5: +599 999 ms → 1 request, +600 000 → 2. Mutations D1, D2 → fail |
| 8 | Test connection always fetches again | no | confirmed | `fresh: true`; mutation D3 → 2 fail |
| 9 | Only a good document is kept; no cached document outlives an issuer change | no | confirmed | mutation D7 (keep a bad answer) → fails; probe Q2: a changed issuer is asked at once (key `url.href`) |
| 10 | Pruning deletes expired sign-ins, never a live one | no | confirmed | probe P1: a row expiring exactly at `now` is kept. Mutations M4, M5 → fail |
| 11 | Pruning leaves other `verification` rows alone | no | confirmed | probe P1: `sso-test:…`, `two-factor-setup:…`, `two-factor-used:…`, an email, `sso-stateX`, `sso_state:abc` survive; mutation M3 → fails. `SSO-STATE:abc` is deleted on SQLite (case-insensitive LIKE); nothing writes it |
| 12 | Pruning at most once a minute, coping with the clock | no | confirmed | probe P2: +59 s keeps, +60 s deletes, a jump back prunes (`Math.abs`). No test: mutation M6 (`>= 0`) → still passes |
| 13 | SPEC covers the shared bucket, the cache and pruning | no | confirmed | staged SPEC diff; decision 11 at SPEC.md:364 |
| 14 | The Documentation explains it in en, pt, fr | no | confirmed | 8c4a366 `account.tsx` |

**Overall:** met. Gaps, not blocking: no test for a failed discovery dropping a still-valid cached document (D4 passes), none for the once-a-minute pruning (M6 passes); concurrent starts with an empty cache each fetch (Q4), bounded by the buckets.

### Re-check 1 (blind: row 12 and the diff)

Witnessed: 2026-10-17 18:14 EDT, by a fresh agent (blind). Commit: ccd1075d + staged diff. Machine: macOS 27.0.1 (Darwin 27.0.0), Node v24.0.0. Mutations only in its scratch copy, each restored and checked with `cmp`. It started only the `ronne-test-databases` servers and stopped them with `pnpm test:db:down`.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 8 | Only a good discovery answer is kept, and a failed discovery (a failed *Test connection* included) drops a still-valid cached document | no | confirmed | new lines in "is kept for 10 minutes…": `asked()` = 3 after the failed test. Mutation (no `delete` in the `catch`) → fails "expected 2 to be 3"; `fresh: false` → 2 fail. Unmutated → 47 passed |
| 10 | Pruning runs at most once a minute | no | confirmed | new part of "deletes sign-ins in progress that expired…": kept at +59 s, gone at +60 s. Mutations `PRUNE_EVERY_MS = 0`, `61_000`, `>=` → `>` → each 1 failed. Unmutated → 36 passed |
| 12 | The pruning and limiter tests pass on PostgreSQL, MySQL and MariaDB | no | confirmed | `pnpm test:db:up`, `pnpm test:db:{postgres,mysql,mariadb} -- src/server/domains/identity/actions/sso.db.test.ts` → 36 passed each, 0 skipped |

**Overall:** met. Every row of task 12's blind pass is now confirmed, and its adversarial pass is met.

## Task 13 — 24-hour provider sessions

Witnessed: 2026-10-17 18:18 EDT, by a fresh agent (blind). Commit: d5a7e900 + staged diff. Machine: macOS 27.0.1, Node v24.0.0. Mutations only in its scratch copy, restored and checked with `cmp`.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A provider sign-in makes a session that expires 24 hours after it opens, not 30 days | no | confirmed | `better-auth-sso-session.ts:39` `createSession(user.id, true)`; Better Auth `db/internal-adapter.mjs:271` (24 hours for `dontRememberMe`). Mutation back to `false` → the test fails (about 30 days) |
| 2 | The cookie lasts only for the browser session and carries the signed `dont_remember` mark | no | confirmed | `setSessionCookie(ctx, { session, user }, true)`; `cookies/index.mjs:171-177`. Dropping `, true` → fails on Max-Age |
| 3 | Using the session doesn't extend it | no | confirmed | `api/routes/session.mjs:170` returns before the refresh with `dont_remember`. Probe: without that cookie the test fails (moved about 30 days), so the assertion catches an extension and the SPEC's caveat is accurate |
| 4 | The audit records `auth.signed_in` with `remember: false` | no | confirmed | `sso.ts:322`; asserted in the test |
| 5 | A test shows the expiry and no extension, passing on SQLite | no | confirmed | `--project db src/server/domains/identity` → 281 passed, 1 skipped; `sso.db.test.ts:151` |
| 6 | SPEC.md is consistent with decision 12 | no | not met | decision 12 (:373) and :170-177 say 24 hours, but the out-of-scope item at :89-90 still says "SSO sessions last as long as "Remember me" ones (30 days)" |
| 7 | The Documentation says 24 hours, ends with the browser, in en, pt and fr | no | confirmed | ronne-web 9a06c79: `account.tsx:27-28` and `authentication.tsx:86-87` in each |

**Overall:** not met: the code, the test and the Documentation hold, but SPEC.md:89-90 still says 30 days.

Witnessed: 2026-10-17 18:18 EDT, by a fresh agent (adversarial). Commit: d5a7e900 + staged diff. Machine: macOS (Darwin 27), Node v24.0.0. Mutations and probes only in its scratch copy.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A provider sign-in opens a session whose stored expiry is 24 hours | no | confirmed | `createSession(user.id, true)` → `internal-adapter.mjs:271`; probe P1: 23.99 h. `--project db src/server/domains/identity` → 281 passed, 1 skipped |
| 2 | Its cookie lasts only as long as the browser, with the signed `dont_remember` cookie | no | confirmed | probe P6 Set-Cookie: no Max-Age or Expires, plus `ronne.dont_remember`. Mutation M2 → the test fails at `:158` |
| 3 | Using the session (HTTP get-session and Ronne's own reads) doesn't extend it | no | confirmed | probe P3: 1 h left, `GET /api/auth/get-session` → no Set-Cookie, still 1 h; P4 `getCurrentUser` → still 1 h; no cookie cache configured. Mutation M1 → fails at `:166` |
| 4 | The 24-hour expiry is enforced on the server | no | confirmed | probe P5: `expires_at` in the past → `getSession` null, row deleted |
| 5 | The session can't be extended past 24 hours through any path Ronne serves | no | not met | probe P1: provider session, then `changePassword` → new session 720 h (`update-user.mjs:176` `createSession(userId)`); probe P2: two-factor turned on → 720 h (`totp/index.mjs:210`); off goes the same way (`two-factor/index.mjs:229`, by reading) |
| 6 | The SPEC's caveat is true and complete | no | partly | true: without `dont_remember`, get-session moves 1 h → 720 h; incomplete: row 5's paths need no tampering |
| 7 | The SPEC is consistent with decision 12 | no | not met | `SPEC.md:89-90` still says 30 days |
| 8 | The sign-in is audited as `remember: false` | no | confirmed | `sso.ts:322`; asserted |
| 9 | Password sign-ins are unaffected: Remember me still 30 days | no | confirmed | probe P7: `Max-Age=2592000`, 720 h stored, also with a leftover `dont_remember` cookie |
| 10 | A test shows the expiry and that use doesn't extend it | no | confirmed | `sso.db.test.ts:151-182`; M1 and M2 fail it |
| 11 | The Documentation says so (en, pt, fr) | no | partly | "24 hours at most and ends when the browser closes" in all six files, but "loses access within a day" is false after row 5's paths |

**Overall:** not met: a password change or two-factor on/off from a provider session makes a 30-day session; the SPEC is stale and its caveat incomplete; the Documentation's "within a day" is wrong. Minor: a Remember-me password sign-in doesn't clear a leftover `dont_remember` cookie, so that 30-day session isn't extended.

### Re-check 1 (blind: row 6 and the diff)

Witnessed: 2026-10-17 18:26 EDT, by a fresh agent (blind). Commit: d5a7e900 + staged diff. Machine: macOS (Darwin 27), Node v24.0.0. Tests and mutations only in its scratch copy, refreshed from the staged state; every restore checked with `cmp`.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | SPEC.md is consistent with decision 12 | no | confirmed | `SPEC.md:89-90` now says every provider's sessions last 24 hours; `grep "30 days"` finds only :174 (what Better Auth would do without the cap) and :376 ("not 30 days") |
| 14 | A session made to replace the request's current one (password change, two-factor on or off) never outlives it | no | confirmed | `better-auth.ts:115-117`. Mutation (cap off) → the new test fails at the password change (about 29 days over); skipping it only on `verify-totp` → fails at `:236`; only on `disable` → fails at `:243` |
| 15 | The cap doesn't shorten a new provider session opened while an older session exists | no | confirmed | By reading: `better-auth-sso-session.ts:31-41`: no session middleware, so `context.session` is unset |
| 16 | The new test passes with the old ones (SQLite) | no | confirmed | `--project db src/server/domains/identity` → 282 passed, 1 skipped; `vitest run src/server/domains/identity` → 469 passed, 1 skipped. The servers weren't run here (afterwards the implementer ran `sso.db.test.ts` on PostgreSQL, MySQL and MariaDB: 38 passed each) |
| 17 | The SPEC's text about the cap and its caveat is accurate | no | confirmed | `SPEC.md:173-180` matches the hook (every session); disabling is the hard cut-off (`token-exchange.ts:126`); `remember: false` at `sso.ts:322` |
| 18 | The Documentation still matches after ronne-web 403ff45 | no | confirmed | "normally loses access within a day", and "disable their account in Ronne: that ends their sessions and tokens" (en, pt, fr) |

**Overall:** met. Every row of task 13's blind pass is now confirmed.

### Re-check 1 (adversarial: rows 5, 6, 7, 11 and the diff)

Witnessed: 2026-10-17 18:30 EDT, by a fresh agent (adversarial). Commit: d5a7e900 + staged diff. Machine: macOS 27.0.1, Node v24.0.0. Probes and the one mutation only in its scratch copy, checked with `cmp`.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | No path Ronne serves can extend the session past 24 hours | no | confirmed | P1: password change → 23.99 h (was 720 h); P2/R2: two-factor on → 24 h, off → 24 h, then get-session with 1 h left → still 1 h; R1: 1 h left, password change → 1.00 h. Only `/get-session` and `/ok` over HTTP. R6: concurrent calls don't leak context (`dispatch.mjs:196-200`). Mutation (cap off) → the new test fails |
| 5a | The cap doesn't shorten a legitimate session | no | confirmed | R3: Remember-me, password change → 720 h; R3b: two-factor on → 720 h; R4: Remember-me sign-in while holding a provider session → 720 h; R5: two-factor step at sign-in, fresh browser → 720 h; setup and reset-root-password create no capped session |
| 6 | The SPEC's caveat is true and complete | no | confirmed | SPEC.md:170-180; P3: token only → 1 h becomes 720 h, as stated |
| 7 | The SPEC is consistent with decision 12 | no | confirmed | SPEC.md:89-90, :170-173 |
| 8 | The audit records `remember: false` | no | confirmed | `sso.ts:322`; asserted |
| 9 | A test shows the expiry and no extension through these paths | no | confirmed | 282 passed, 1 skipped; the new test fails under the row 5 mutation |
| 10 | A Remember-me password sign-in is unaffected by a provider session earlier in the same browser | no | partly | R5b: with two-factor and a leftover `dont_remember`, step 2 → 24.00 h, browser-session cookie (`verify-two-factor.mjs:23,31`); without two-factor, 720 h but never extended |
| 11 | The Documentation says so, and the new sentence matches the code | no | confirmed | 403ff45; `user-admin.ts:193-196` |

**Overall:** not met: the leftover `dont_remember` cookie makes a later Remember-me password sign-in with two-factor a 24-hour browser session (row 10).

### Re-check 2 (adversarial: row 10 and the diff)

Witnessed: 2026-10-17 18:38 EDT, by a fresh agent (adversarial). Commit: d5a7e900 + staged diff. Machine: macOS (Darwin 27), Node v24.0.0. Probes and the one mutation only in its scratch copy, checked with `cmp`.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10 | A Remember-me password sign-in is unaffected by a provider session earlier in the same browser | no | confirmed | R5b: step 1 sends `ronne.dont_remember=…; Max-Age=0`, step 2 → 720 h; X1 (no two-factor): 720 h and extended. Mutation (hook returns early) → the new test fails |
| 10a | A sign-in without Remember me still gets its 24-hour browser session, two-factor included | no | confirmed | X2, X3, X3b → 24.00 h, browser-session cookie plus `dont_remember`, not extended |
| 10b | A failed sign-in changes nothing, and can't make a provider session extendable | no | not met | X4: provider session with 1 h left, wrong password (`rememberMe: true`) → 401 with `dont_remember` Max-Age=0; get-session → 720.00 h. Unknown email → the same. After hooks run on errors too (`dispatch.mjs:234-245`); `nextCookies` applies it in a server action |
| 10c | The server-side `Max-Age=0` reaches the browser from a server action | no | confirmed | By reading: `nextCookies` last (`better-auth.ts:137`), reads `responseHeaders` (`dispatch.mjs:129`), `cookies().set(…, { maxAge: 0 })` |
| 5 | No path Ronne serves can extend the session past 24 hours | no | not met | P1, P2/R2, R1 still hold; row 10b is a new path |
| 5a | The cap doesn't shorten a legitimate session | no | confirmed | R3, R3b, R4 → 720 h |
| 6–9 | SPEC caveat and consistency, `remember: false`, the test | no | confirmed | 283 passed, 1 skipped; SPEC :179 doesn't say failed attempts clear it too |
| 11 | The Documentation says so | no | confirmed | Unchanged: true once 10b is fixed |

**Overall:** not met: a failed password sign-in in a browser holding a provider session clears `dont_remember`, and that session then grows to 30 days (rows 10b and 5). Two adversarial re-checks done: the owner decides (state-witness.md).

### Re-check 3 (adversarial: rows 5, 10b and the diff)

Witnessed: 2026-10-17 18:43 EDT, by a fresh agent (adversarial). Commit: d5a7e900 + staged diff. Machine: macOS (Darwin 27), Node v24.0.0. Probes and the one mutation only in its scratch copy, refreshed from the index and checked with `cmp`. The owner allowed this round after re-check 2.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 10b | A failed sign-in changes nothing and can't make a provider session extendable | no | confirmed | X4: wrong password and unknown email with `rememberMe: true` → 401, no Set-Cookie; `dont_remember` kept; get-session → still 1.00 h. Test at `sso.db.test.ts:288`; mutation (drop the `isAPIError` check) → fails |
| 10d | No other refused sign-in reaches the hook | no | confirmed | Y1 disabled user → no mark cookie, still 1.00 h; Y2 Ronne's rate limit → Better Auth never called; Y3 root-only policy → `rememberMe: false` call refused, still 1.00 h |
| 10e | Clearing the mark at a two-factor challenge never completed can't extend a provider session | no | confirmed | Y4/Y5: step 1 ends `session_token` and `session_data` in the same response (`two-factor/index.mjs:286`); get-session → null. Only replaying the token without the mark extends it: the SPEC's caveat |
| 10 | A Remember-me password sign-in is unaffected by an earlier provider session | no | confirmed | R5b → 720 h; X1 → Max-Age=2592000, extended; R4 → 720 h |
| 10a | A sign-in without Remember me keeps its 24-hour browser session, two-factor included | no | confirmed | X2, X3, X3b → 24.00 h, not extended |
| 5 | No path Ronne serves can extend the session past 24 hours | no | confirmed | P1 → 23.99 h; P2/R2, R1 → 1.00 h; P3 full cookie → 1.00 h (token only → 720 h, the caveat); P5 → null; R6 no leak; 10b, 10d, 10e |
| 5a | The cap doesn't shorten a legitimate session | no | confirmed | R3, R3b, R4, R5 → 720 h |
| 16 | The tests pass (SQLite) | no | confirmed | `--project db src/server/domains/identity` → 310 passed, 1 skipped (with the probes); the implementer ran `sso.db.test.ts` on PostgreSQL, MySQL and MariaDB: 40 passed each |
| 17 | The SPEC matches | no | confirmed | `SPEC.md:176-177` matches `better-auth-sso-session.ts:57` |

**Overall:** met. Every row of task 13's blind and adversarial passes is now confirmed.
