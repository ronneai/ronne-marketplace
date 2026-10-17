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
