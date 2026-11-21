# 189 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Decision

Witnessed: 2026-11-21 02:25 EST, by a fresh agent (blind). Commit: 8a591c14 + working-tree diff (docs/MVP/MVP.md, docs/features/README.md, 189 SPEC.md, PLAN.md, new WITNESS.md). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MVP §15's "Web sign-in" row no longer says "no email" | no | confirmed | `git diff docs/MVP/MVP.md` → "points to a root reset until a reset by email is built (194). Outgoing email is planned in 189, for security notices and sign-in codes only", as SPEC Goal and Decision 11 |
| 2 | A new §15 "Email" row covers SMTP and the four web APIs | no | confirmed | "SMTP (nodemailer, with presets) or the web API of Amazon SES, Mailgun, Postmark or Resend (plain `fetch` to fixed hosts, no vendor SDKs)" = SPEC Scope and Decisions 1, 2 |
| 3 | The row says the environment wins, all or nothing | no | confirmed | = SPEC Scope and Decision 3 |
| 4 | TLS always; plain SMTP only where the operator allows it | no | confirmed | "TLS always, certificates always verified", `RONNE_MAIL_HOSTS` and never with credentials, a private address refused unless listed = SPEC Scope, Decision 5 |
| 5 | Sealed credentials and a sealed outbox | no | confirmed | Each part in SPEC (Settings, Outbox, `body_enc`, the job, retries, Decisions 4 and 8, the cap) |
| 6 | Notices can't be turned off, and the other rules | no | confirmed | Decisions 6, 7, 9, 10, 11 and the Out list; the reason column matches Goal and Decision 4 (a wording remark: "keeps codes out of the database and backups" broader than "can't be read … after it's sent") |
| 7 | Nothing is described as built, and the code has no email today | no | confirmed | The Email row starts "Planned (189)", the Web sign-in row "planned in 189", §8's Auth row "(189, planned, …)"; no `nodemailer`, `smtp`, `outbox` or `RONNE_MAIL` in apps/web/src or packages/; no `mail` domain |
| 8 | `docs/features/README.md` lists 189 in M32 | no | confirmed | README.md:527 `### M32 — Open sign-up and email`, the 189 row, status now `in progress`, Depends on matching SPEC.md:3 |
| 9 | The SPEC line on the per-address cap matches the merged 109 limiter | no | confirmed | "counted by 109's limiter in the database", the cap counting outbox rows; `apps/web/src/server/rate-limit/`, `auth-instance.ts:72`; no `LoginRateLimiter` left |
| 10 | `pnpm witness:check` and `pnpm docs:check` pass | no | confirmed | both exit 0 |

**Overall:** met. The wording remark in row 6 was taken: the row now says "out of the database and backups in clear".

## Task 2 — The dependency

Witnessed: 2026-11-21 02:35 EST, by a fresh agent (blind; it read the task's Notes first, as they are the deliverable). Commit: 87056dcf + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | MIT-0 is in dependency policy §1 and in `license-policy.json`, in the same change | yes | confirmed | `dependencies.md:17` "MIT, MIT-0, …" with the owner's note; `license-policy.json:5` `"MIT-0"`; one diff |
| 2 | nodemailer is added to apps/web with an exact version | no | confirmed | `apps/web/package.json:68` `"nodemailer": "10.6.0"`; lockfile `specifier: 10.6.0`, integrity matching `npm view nodemailer@10.6.0 dist.integrity` |
| 3 | The version is the newest `minimumReleaseAge` allows; 10.6.1 is held back | yes | confirmed | `minimumReleaseAge: 4320`; 10.6.0 2026-11-15T20:09Z, 10.6.1 2026-11-20T09:28Z, nothing between; `latest` = 10.6.1 |
| 4 | 10.6.1's changes are DKIM signing and the `fetch` helper's cookies | yes | confirmed | `npm diff 10.6.0..10.6.1`: dkim/sign, fetch/cookies, package-info and well-known/services (a new "Sendora" preset the note didn't mention) |
| 5 | `pnpm install --frozen-lockfile` passes | yes | confirmed | exit 0, "Lockfile passes supply-chain policies" |
| 6 | `pnpm licenses:check` passes (351 packages), and needs MIT-0 allowed | yes | confirmed | "✓ 351 packages checked"; with MIT-0 removed in a scratch copy → "✗ 1 of 351 … nodemailer@10.6.0: MIT-0" |
| 7 | MIT-0 and no dependencies | yes | confirmed | `npm view` → MIT-0, no dependencies, peers or optional ones; lockfile snapshot `nodemailer@10.6.0: {}` |
| 8 | `pnpm audit --audit-level high` passes, no advisory for nodemailer | yes | confirmed | exit 0, 3 low and 10 moderate, all elsewhere; nodemailer 0 in the JSON |
| 9 | Health: 342 versions since 2011, latest 2026-11-20, frequent November releases, one maintainer, widely used | yes | confirmed | 342 versions, created 2011-01-21, releases on Nov 7, 10, 10, 15, 20; maintainer andris only; 40,478,920 downloads in the week to 2026-11-19 |
| 10 | Published with npm provenance, which `trustPolicy` checks | yes | confirmed | `dist.attestations` SLSA v1; `trustPolicy: no-downgrade`; the frozen install passed |
| 11 | No install scripts for consumers; `allowBuilds` unchanged | yes | confirmed | No install/preinstall/postinstall (`prepare` isn't run for registry packages); `strictDepBuilds` install passed; `pnpm-workspace.yaml` unchanged |
| 12 | Its own types, so no `@types/nodemailer` | yes | confirmed | `probe.ts` with tsc 7.0.2 resolves the types; the note named `dist/cjs/nodemailer.d.ts`, where TypeScript finds `dist/esm/nodemailer.d.ts` beside the ESM entry |
| 13 | Need, matching SPEC Decision 2 | yes | confirmed | `SPEC.md:285-289`; Node has no SMTP module |
| 14 | The §3 checklist answers are in Notes | yes | confirmed | Items 1-6 and the version note; the single maintainer is named as the Health caveat |

**Overall:** met. The two wording points (the types path, the new well-known service) are fixed in the note.

## Task 3 — The transports

Witnessed: 2026-11-21 02:41 EST, by a fresh agent (blind). Commit: 166ae371 + working tree (new `apps/web/src/server/domains/mail/`, PLAN.md notes). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The `mail` domain has a `MailTransport` port and one message type | no | confirmed | `models/message.ts`: `MailMessage`, `MailFailureReason` (8), `SendResult` (3 statuses, `waitSeconds` on retry), `MailTransport { kind, send }`; 63 tests pass |
| 2 | One MIME message from nodemailer's composer, run by every transport | no | confirmed | `compose.ts` (`disableFileAccess`, `disableUrlAccess`, `Auto-Submitted`); SMTP `raw`, SES `Content.Raw.Data`, Mailgun `message`; Postmark and Resend run `composeMime`'s checks, then send JSON |
| 3 | Implicit TLS works; STARTTLS is required, with no fallback | no | confirmed | Tests "sends over TLS from the first byte" and "fails, never falls back"; mutation `requireTLS: false` fails it |
| 4 | Certificates always verified, no switch | no | confirmed | `smtp.ts:116` `rejectUnauthorized: true`; `ca` only adds a CA; mutation fails 2 tests |
| 5 | No TLS only for a listed host, never with credentials | no | confirmed | `smtp.ts:99-104`; mutation dropping the credentials condition fails |
| 6 | The host check reuses 136's rules | no | confirmed | `smtp-host.ts` imports `isInternalAddress`; tests for 10/8, 127/8, 169.254, mixed answers, ::1, ::ffff:10.0.0.1, localhost; mutation (first address only) fails |
| 7 | Checked before each connection; Ronne connects to the checked address, with the typed host as the TLS name | no | partly | Holds (probe `probe-ip.test.ts`: resolve called once per send; a trusted cert for another name → `failed/tls`), but mutations `host: checked.host` (nodemailer resolves again) and dropping `servername` leave 63/63 green |
| 8 | Tests use an SMTP fake with and without STARTTLS, a bad certificate, 535 and a slow greeting | no | confirmed | `testing/smtp-fake.ts`; one test each; mutation timeout → fail is caught |
| 9 | Timeouts 10/10/30 s, a timeout retried | no | confirmed | `SMTP_TIMEOUTS`; probe with an 11 s greeting → retry/timeout after 10007 ms; no test pins the defaults |
| 10 | Each web API maps 200, 4xx, 429 + Retry-After and 5xx | no | confirmed | `apis.test.ts` over all 4; SES throttling 400, Postmark 100/101, Resend 409; mutation dropping `waitSeconds` fails 4 |
| 11 | Fixed https hosts, no redirects, region and domain can't change the URL | no | confirmed | `redirect: "manual"`, `https:`, `evil.example/x` and `x/../../v4` → config with 0 calls |
| 12 | SigV4 passes AWS's published vectors | no | confirmed | Recomputed in plain Python: get-vanilla, post-vanilla and IAM ListUsers match; probe adds query-order-key-case, utf8-query, get-utf8, get-space, all pass; header-value trimming has no vector |
| 13 | Header injection refused before any request; non-ASCII addresses refused | no | confirmed | Tests for compose, SMTP and each provider; mutation of `LINE_BREAK` fails 3; U+2028, U+0085, VT and NUL become encoded-words; `ana@bücher.example` refused |
| 14 | No test output, log or error text carries a credential | no | partly | Verbose log grepped for every secret and its base64 → 0; `logger: false`; but `cleanDetail` removes only the raw secret: a Mailgun 401 echoing `Basic <base64 of api:key>` keeps it |
| 15 | Each API checked against vendor docs, dated in Notes | no | partly | Dated 2026-11-21; the notes say Mailgun's hosts and `api:<key>` weren't seen |

**Overall:** not met (rows 7, 14, 15). Minor: SigV4 header-value trimming and the default timeouts aren't pinned by a test.

### Adversarial pass

Witnessed: 2026-11-21 02:43 EST, by a fresh agent (adversarial). Commit: 166ae371 + working-tree diff (untracked `apps/web/src/server/domains/mail/`). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A port and message type; every transport composes once; the composer reads no file or URL | no | confirmed | `message.ts:52-55`, `compose.ts:14-30` |
| 2 | Header injection refused: CR, LF, a lone `\r`, U+2028, U+0085, a `to` with two addresses | no | confirmed | Lone `\r` throws; U+2028 and U+0085 become encoded-words; two-address and non-ASCII `to` values refused. Test gap: `LINE_BREAK=/\n/` leaves 63 green |
| 3 | STARTTLS required: no plain text when it's left out, refused or broken | no | confirmed | No STARTTLS → `failed/tls`; `454` to STARTTLS → `failed/tls`; non-TLS bytes after `220` → `retry/connection` (minor: not `tls`); nothing sent in each |
| 4 | Plain SMTP only to a listed relay, never with credentials | no | partly | **A `tls` value outside the three** (`"STARTTLS"`, `""`, `undefined`) with credentials, against a server without STARTTLS → `sent`, `AUTH PLAIN` in clear: only `=== "none"` was checked |
| 5 | Certificates verified against the typed host on the IP path | no | confirmed | A cert for another name with the IP's SAN → `failed/tls`; the name normalised |
| 6 | The host check holds for IPv6 forms, odd IPv4 forms, trailing dots, IDN | no | confirmed | `0x7f.1`, `127.1`, `2130706433`, `[::1]`, `::ffff:127.0.0.1`, `localhost.`, `fe80::1%lo0`, `[fd00::1]`, `::`, `0` → internal; IDN, `host:25`, `user@host` → not a host |
| 7 | Connects to the checked address, never resolving again, the typed host as TLS name | no | partly | Holds (a `net.connect` spy sees the checked address), but `host: checked.host` and dropping `servername` leave 63/63 green |
| 8 | Timeouts 10/10/30 s, a slow greeting retried | no | confirmed | Test gap: changing the defaults leaves 63 green |
| 9 | SMTP answers classed right | no | partly | 5xx failed, 4xx retried, 535 auth — **but `454 4.7.0` at AUTH → `failed/auth`** (nodemailer's `EAUTH` won) |
| 10 | Each web API calls only its fixed host | no | confirmed | Every odd domain and region refused with 0 fetches; a 302 not followed. Minor: Mailgun `region:"EU"` went to the US host |
| 11 | HTTP answers mapped | no | partly | **`Retry-After` of `-5`, `+5`, `12.5` → 0** (`Date.parse`); 408 retried against SPEC:108's wording; SES matched `ThrottlingException` anywhere in the body |
| 12 | SigV4 matches AWS's published vectors | no | confirmed | 9 more suite vectors match (incl. get-header-value-trim); repeated keys match an independent reference. Test gap: no whitespace-folding vector in the repo |
| 13 | No credential in any output | no | partly | **Encoded echoes survive `cleanDetail`:** an SMTP 535 echoing the AUTH PLAIN blob, a URL-encoded or base64 password, a Mailgun `Basic` blob, a URL-encoded Postmark token |
| 14 | Every transport tested against local fakes | no | confirmed | 63 passed; each named scenario covered |

**Overall:** not met (rows 4, 7, 9, 11, 13, and the test gaps).

### Re-check 1

Witnessed: 2026-11-21 02:49 EST, by a fresh agent (blind). Commit: 166ae371 + working tree (untracked `apps/web/src/server/domains/mail/`, PLAN.md notes). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | Checked before each connection; connects to the checked address, the typed host as TLS name | no | confirmed | `smtp.ts:106` `deps.check ?? checkSmtpHost`, `:127`, `:133`; M-host and M-servername each fail "connects to the address the check returned…" (`smtp.test.ts:183`) |
| 14 | No credential in any output | no | partly | Holds: raw, URL-encoded, base64 with and without padding, `Basic`, `Bearer` and the AUTH PLAIN blob for `user@x` all redacted across the five transports. But dropping the AUTH PLAIN secret leaves 71/71 green (user `u` lines base64(password) up inside the blob), and so does dropping the unpadded form |
| 15 | Each API checked against vendor docs, dated in Notes | no | confirmed | The Mailgun note cites the API overview and authentication pages, matching `apis.ts:41,54` |
| — | The whole mail suite passes | no | confirmed | 71 passed |
| — | The minor gaps are pinned | no | confirmed | M-timeouts and M-header-trim each fail their test |

**Overall:** not met (row 14's tests).

### Adversarial re-check 1

Witnessed: 2026-11-21 02:46 EST, by a fresh agent (adversarial). Commit: 166ae371 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | Header injection refused, lone `\r` included | no | confirmed | `"a\rBcc: x@y.co"` throws; `LINE_BREAK=/\n/` now caught |
| 3 | STARTTLS required: no plain text when refused or broken | no | confirmed | Non-TLS bytes after `220` → `failed/tls`; `454` to STARTTLS → `retry/server` (SPEC:108); only `EHLO` and `STARTTLS` seen. Test gap: dropping `SSL\|TLS\|wrong version` leaves 71 green |
| 4 | Plain SMTP only to a listed relay, never with credentials | no | confirmed | Probe D → `failed/config`, nothing sent; `"STARTTLS"`, `""`, `"none "`, `undefined` refused; N1 caught |
| 7 | Connects to the checked address, the typed host as TLS name | no | confirmed | `net.connect` gets the checked address; M4, M7 caught |
| 8 | Timeouts 10/10/30 s | no | confirmed | M10, M10b caught |
| 9 | SMTP answers classed right | no | confirmed | `454` at AUTH → retry; 451, 421 → retry; 535 → auth; M11 caught |
| 11 | HTTP answers mapped | no | confirmed | `-5`, `+5`, `12.5`, `1e3`, `0x10`, `٣` → undefined; the SES lookalike → `failed/rejected`; region `"EU"` → config; N3, N4, N5 caught |
| 13 | No credential in any output | no | partly | The named forms are redacted (N2, N8 caught), but hex, quoted-printable, JSON-escaped, `+` for a space, double URL-encoding and an AUTH PLAIN blob split over two `535-` lines survive; N7 (no AUTH PLAIN secret) and N9 (no longest-first sort) leave 71 green |
| 14 | Every transport tested against local fakes | no | confirmed | 71 passed |

**Overall:** not met (row 13, and the test gaps). For the owner, not a bug: a server always answering `454` to STARTTLS is retried, so root's test email names "server" rather than TLS.

### Re-check 2

Witnessed: 2026-11-21 02:58 EST, by a fresh agent (blind). Commit: 166ae371 + working-tree diff (apps/web/src/server/domains/mail/). Machine: macOS 27.2.1, Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 14 | No credential in any output | no | partly | Holds: 72/72; `probe-echo.test.ts` across the five transports, nothing leaked. Making `detailOf` return the cleaned text at AUTH fails its test; dropping the AUTH PLAIN entry stays green (acceptable: AUTH shows codes only). **Gap:** dropping the unpadded base64 form stays green, as `key-123456`'s unpadded base64 equals its base64url |

**Overall:** not met (row 14's test).

### Adversarial re-check 2

Witnessed: 2026-11-21 02:58 EST, by a fresh agent (adversarial). Commit: 166ae371 + working-tree diff (`apps/web/src/server/domains/mail/`, untracked). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | Root's test email and the log never show a credential | yes | partly | At AUTH: codes only (T4, T6 with `u`, `us`, `usr`). Elsewhere, the ten forms are redacted; quoted-printable, JSON `@`, upper case, a fold, a split blob, a prefix, `&#64;`, double URL-encoding are left, as the Notes accept |
| 1 | `detailOf`: codes only at AUTH (`EAUTH` or a command starting with AUTH) | yes | confirmed | `smtp.ts:61-69`; P1 and P11 killed. P2 (no `EAUTH` test) and P3 (no command test) each survive: no test covers either half alone |
| 2 | A handshake that breaks after STARTTLS gives failed/tls, nothing sent | yes | not met | **Flaky:** 2 of 8 runs failed with `retry/timeout`; the fake wrote the `220` and the junk together, so the client read the junk as plain text and waited for a handshake. Nothing was sent either way |
| 3 | `secretForms` lists the ten forms | yes | confirmed | `http.ts:36-52`; leak2-probe redacts each |
| 4 | `cleanDetail` tests cover the new forms | yes | partly | N9, P4, P6 killed; P7 (no base64url), P10 (no unpadded base64), P9 (no upper-case hex), P5 (no plain JSON escaping) survive |
| 5 | Test gaps N6, N7, N9 | yes | partly | N9 killed; N6 and P12 killed only by the flaky test; N7 survives (the blob matters only at the other stages, untested) |
| 6 | PLAN Notes: the limit and the 454 behaviour | yes | partly | 454 accurate; the limit applies to every non-AUTH answer, not only a web API's; "fails at once as TLS" is untrue when the junk comes with the `220` |
| — | Earlier mutations | yes | confirmed | M3, M4, M7, M10, M10b, M11, N1–N5, N8 killed |
| — | SMTP reply-code probes | yes | confirmed | 554, 421, 452, 553, 451, 500-then-HELO as expected; probe D refused |

**Overall:** not met (rows 2, 4, 5, 6, and 13 by row 2). The code holds.

Since then (not yet witnessed): the fake waits for the client's ClientHello before sending its junk (the test passed 10 runs of 10); `cleanDetail`'s tests use `p>?key1` (base64 `cD4/a2V5MQ==`) for the unpadded, base64url and both hex forms, and a secret with `"` and `\`; `detailOf` is exported and tested on each AUTH half alone and on a MAIL-stage reply echoing the blob; the Notes' limit now covers every non-AUTH answer, and the handshake sentence names both cases.

### Re-check 3

Witnessed: 2026-11-21 10:22 EST, by a fresh agent (blind; a third round at the owner's request). Commit: 166ae371 + working-tree diff (untracked `apps/web/src/server/domains/mail/`). Machine: macOS 27.2.1, Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 14 | No credential in any output | no | confirmed | `mut4.sh` → base 74/74. Removing the unpadded form (`http.ts:47`) → 1 failed (`takes every secret out of a provider's answer…`, which now uses `p>?key1`, base64 `cD4/a2V5MQ==`, expecting `cD4/a2V5MQ` redacted). `detailOf` returning cleaned text at AUTH → 2 smtp tests fail. Dropping the AUTH PLAIN entry passes, accepted in re-check 2 (AUTH shows codes only). `probe-unpadded.test.ts` → 1/1 |

**Overall:** met.

### Adversarial re-check 3

Witnessed: 2026-11-21 10:24 EST, by a fresh agent (adversarial; a third round at the owner's request). Commit: 166ae371 + working-tree diff (`apps/web/src/server/domains/mail/`, untracked; PLAN.md). Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | A handshake that breaks after STARTTLS gives failed/tls, nothing sent, and the test is stable | yes | confirmed | ×12 in a row and ×6 at once → all passed; flaky-probe → 12 of 12 `failed/tls`, `received=0`; the fake waits for the client's first bytes (`smtp-fake.ts:123-128`) |
| 4 | `cleanDetail` tests cover the new forms | yes | partly | P7, P9, P10 killed. **P5 (no plain JSON escaping) survives:** `a"b\c` has no `/`, so the `\/` form is the same string |
| 5 | N6, N7, P2, P3, P12 killed by the repo tests | yes | partly | N6, P12 killed by the broken-handshake test; P2, P3 by "shows codes only at AUTH…"; P1, N9 still killed. **N7 survives:** the MAIL-stage test passes its own secrets to `detailOf`, so the transport's list isn't tested |
| 6 | PLAN Notes: the limit for every non-AUTH answer, both STARTTLS cases | yes | partly | The limit, the 454 sentence and the plain-text-after-handshake sentence are accurate; the together case retries as a timeout, but after the **greeting** timeout (1724 ms with greeting 1700, socket 6000), not the socket timeout |

**Overall:** not met (rows 4, 5, 6).

Since then (not yet witnessed): a test through `smtpTransport` whose fake refuses MAIL FROM echoing the earlier AUTH line (user `us`), and JSON tests with `a/"b` escaped both ways; removing the transport's blob entry (N7) and the plain JSON form (P5) each fail a test now (75 passed otherwise). The Notes say "after the greeting timeout (10 seconds)".

### Adversarial re-check 4

Witnessed: 2026-11-21 10:28 EST, by a fresh agent (adversarial; a fourth, short round at the owner's request, rows 4–6 only). Commit: 166ae371 + working-tree diff (mail domain untracked; PLAN.md, SPEC.md, WITNESS.md modified). Machine: macOS 27.2.1, Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | The web APIs' answers are cleaned of a secret's JSON-escaped forms, `/` as it is and as `\/` | yes | confirmed | Baseline 75 passed. P5 (no plain JSON form, `http.ts:44`) → killed; P5b (no `\/` form, `:45`) → killed (`expected '{"m":"bad a\/\"b"}' to be '{"m":"bad [redacted]"}'`). N9, P7, P9, P10 still killed |
| 5 | The AUTH PLAIN blob is cleaned out of a later SMTP reply that echoes it, through the transport | yes | confirmed | The fake's `echoAuthAtMail` answers MAIL FROM `550 5.7.1 not allowed after <AUTH line>`; user `us`; N7 → killed, only by that test. N6, P12, P1, P2, P3 still killed |
| 6 | PLAN Notes: plain text sent with the STARTTLS yes is retried as a timeout after the greeting timeout (10 s), nothing sent | yes | confirmed | `together-timing.test.ts` (greeting 1700, connection 4000, socket 6000) → `retry/timeout`, `received=0`, 1727 ms; `SMTP_TIMEOUTS.greeting` 10 000 |

**Overall:** met. With re-check 3 (blind) met, both latest passes are met.

## Task 4 — Settings and secrets

Witnessed: 2026-11-21 10:45 EST, by a fresh agent (blind). Commit: 31dcddaf + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The `mail_*` keys match SPEC Data | no | confirmed | `mail-settings.ts:9-26` lists all 16 keys of SPEC.md:236-240; `parseLastStatus` holds status, time, reason |
| 2 | The secrets are `_enc` keys sealed through `instance-secrets.ts`, bound to their key | no | confirmed | `sealMailSecret`/`openMailSecret` use `sealSetting`/`openSetting`; an apiKey value opened as `smtpPassword` → `unreadable`; the row matches `^v1.` without the key |
| 3 | Each transport saves and builds a sender | no | confirmed | `mail-setup.db.test.ts` 15 passed on SQLite, and 15/15 on PostgreSQL, MySQL, MariaDB |
| 4 | A secret is never read back | no | confirmed | `mail-setup.ts:84` strips the three; the view and the audit row hold no key; `summary()` leaves out the user name and the access key ID |
| 5 | An unopenable secret → `credentials_unreadable`, `secretProblem: "unreadable"` | no | confirmed | db test; saving under another AUTH_SECRET without retyping is refused, retyping works |
| 6 | `rotate-secret` re-seals the mail secrets | no | confirmed | `endSessionsForNewSecret` → old secret unreadable, new ok; M3 (key off `_enc`) fails it |
| 7 | A kept secret is dropped when its transport or target changes | no | confirmed | Resend → Postmark, another SMTP host, Mailgun domain or region, SES region each refused without a secret; host letter case keeps it. M1, M5 fail "drops a kept secret…" |
| 8 | CR/LF refused in the From name and address, Reply-To, contact, SMTP user and secret | no | confirmed | `\n`, `\r`, U+2028, U+0085, NUL, a comma list → `InvalidMailSetupError`; M2 fails "refuses a line break…" |
| 9 | Non-ASCII addresses refused | no | confirmed | `ä@acme.example`, `a@bü.example`, `help@bücher.example` |
| 10 | The contact is an address or an https URL without credentials, optional; Reply-To required | no | confirmed | `http://`, `https://user:pw@`, `javascript:`, `https://u@…`, "not a contact", empty Reply-To refused. `https://@help.example` (empty userinfo) is accepted, harmless |
| 11 | The SMTP host checked on save | no | confirmed | "refuses an SMTP host on a private network…", "refuses plain SMTP…" |
| 12 | Root alone manages it; only `RONNE_MAIL_HOSTS` read from the server | no | confirmed | Only `config.ts:95` reads a mail env var; `loadConfig({env:{RONNE_MAIL_HOSTS}})` → it; non-root → `ForbiddenError` |
| 13 | `settings.mail` and `mail.test_sent` with sentences in en/pt/fr, a secret only as set/replaced/removed | no | confirmed | 72 passed; probe sentences read "…the transport to Amazon SES, the sender to m@a.example, a credential set", "Sent a test email, which failed (credentials refused)" |
| 14 | `audit-event.test.ts` knows the two actions | no | confirmed | Its "groups cover every action" test does; M4 (no `mail` group) fails it. The fixture's rich `settings.mail` reads "nothing": no repo test runs the mail metadata |

**Overall:** met. Remarks: with no AUTH_SECRET, `mailSetup` shows `secretProblem: null` where `mailSender` says unreadable; no test of the `settings.mail` sentence with real metadata; `https://@host` accepted.

### Adversarial pass

Witnessed: 2026-11-21 10:47 EST, by a fresh agent (adversarial). Commit: 31dcddaf + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Each transport saves, clears the others' fields, builds a sender | no | confirmed | 72 passed; 15/15 on each server |
| 2 | A secret is never read back | no | confirmed | View, audit dump and fixed refusal messages hold no secret, user name or key ID |
| 3 | An unreadable secret sends nothing | no | confirmed | Crafted sealed `{value:5}` and `"plain"` → `credentials_unreadable`; M12 fails 2 tests |
| 4 | `rotate-secret` re-seals every mail secret, and leaves one it can't open untouched | no | confirmed | All three open under the new secret; a wrong `from` leaves the row; M9 fails the rotate test |
| 5 | A kept secret dropped when its transport or target changes, only then | no | partly | Holds (host case, trailing dot, brackets keep it; IP spellings, Mailgun region, SES region, resend→postmark drop it). M10 (Mailgun target without region) and M11 (SES unbound) survive |
| 6 | A value copied between `_enc` keys, or a transport switched under the old secret, doesn't open | no | confirmed | Both → `credentials_unreadable`, `secretSaved:false` |
| 7 | CR/LF and other line breaks refused in the From name and address | no | confirmed | CR, LF, NUL, U+2028, U+0085 refused. M4 (no `CONTROL`) survives: the non-CR/LF controls untested |
| 8 | The contact: an address or an https URL without credentials, bounded | no | partly | Every bad scheme or credential refused; **unbounded:** a 70,000-character contact → `AuditMetadataTooLargeError` (SQLite, PostgreSQL) or `Data too long` (MySQL, MariaDB); `https:/a.example`, `https:\\a.example` stored as typed |
| 9 | SMTP refuses what the transport would, and plain text with credentials | no | confirmed | Ports `0`, `65536`, `-1`, `25.0`, `1e3` refused; `none` to unlisted or with a user refused; M5 fails |
| 10 | Only root saves or reads | no | confirmed | Moderator and user → `ForbiddenError`; M6 fails |
| 11 | Two saves at once can't leave a setup a save would refuse | no | partly | **On PostgreSQL, MySQL, MariaDB a parallel A (public host + user + password) and B (listed relay, `none`) end as `smtp.example.com`, `none`, user and password**: each save wrote only the fields differing from its stale read. Caught at send (`smtp.ts:142`) |
| 12 | The audit records what changed, the secret only as a change kind | no | partly | **`credentialChange: "removed"` recorded when none existed** (SMTP without a user, a password typed, none saved; the typed one silently dropped) |
| 13 | The sentences in en, pt, fr say what changed | no | partly | Only the transport, sender and credential named: a contact, host, port, TLS, region or domain change reads "nothing" |
| 14 | `audit-event.test.ts` knows the two actions | no | confirmed | M8 fails "cover every action"; the fixture has both |
| 15 | `RONNE_MAIL_HOSTS` read in `config.ts`, the only mail setting from the server | no | partly | Read as a raw string; nothing parses it into a normalised set, and no test covers it |
| 16 | `mail_last_status` kept and read back safely | no | confirmed | JSON with no address; `parseLastStatus` returns null on bad input |
| 17 | Mutations of the secret code fail a test | no | partly | M1–M3, M5–M9, M12 fail; M4, M10, M11 survive |

**Overall:** not met (rows 5, 7, 8, 11, 12, 13, 15, 17). Also: a refused secret got the "none is saved" message. For the record: binding SES to its region was over-strict (its endpoint is always AWS's), its access key ID unbound; U+202E accepted in the From name (display spoofing, not injection).

### Re-check 1

Witnessed: 2026-11-21 10:53 EST, by a fresh agent (blind). Commit: 31dcddaf + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| R1 | With no AUTH_SECRET, `mailSetup` shows `secretProblem: "unreadable"` | no | confirmed | `mail-setup.ts:88-95`; probe on SQLite and PostgreSQL. Test gap: M7 (only when an AUTH_SECRET exists) survives |
| R2 | A test runs the `settings.mail` sentence with real metadata | no | confirmed | `sentences.test.ts` "names each part that changed…"; M6 fails it; six real saved rows render every part in en/pt/fr, no secret in the dump |
| R3 | `https://@help.example` refused | no | confirmed | `null` for it, `HTTPS://@…`, `https://:pw@…`; `https://:@…` stored as `https://help.example/` (harmless) |
| 1–2 | Keys and sealed `_enc` secrets bound to their key | no | confirmed | A value copied into another `_enc` key → unreadable; M3 fails the rotate test |
| 3 | Each transport saves and builds a sender | no | confirmed | 155 passed (SQLite); `mail-setup.db.test.ts` + probe 27/27 on SQLite and PostgreSQL |
| 4 | A secret never read back | no | confirmed | `mail-setup.ts:81`; no secret or key ID in the view or the audit |
| 5–6 | Unreadable → `credentials_unreadable`; `rotate-secret` re-seals | no | confirmed | db tests; M3 |
| 7 | A kept secret dropped when its transport or target changes (SES bound to the access key ID) | no | confirmed | SES region change keeps it, a new ID drops it; Mailgun region or domain refused; M1, M5 fail 3 tests |
| 8–9 | CR/LF, control characters, non-ASCII addresses refused | no | confirmed | All injection variants refused; M2 fails 2 |
| 10–11 | Contact rules; SMTP host checked | no | confirmed | `javascript:`, `https://u@` refused; db tests pass |
| 12 | Root alone; only `RONNE_MAIL_HOSTS` from the server | no | confirmed | `loadConfig` probe; db tests |
| 13–14 | The two actions' sentences; `audit-event.test.ts` knows both | no | confirmed | M4 fails "cover every action…" |

**Overall:** met. Remarks: no repo test of the no-AUTH_SECRET view (M7); the sentence doesn't name a new SES access key ID; Resend → SMTP with a new password reads "a credential set".

### Adversarial re-check 1

Witnessed: 2026-11-21 10:51 EST, by a fresh agent (adversarial). Commit: 31dcddaf + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 5 | A kept secret dropped when its transport or target changes, only then | no | confirmed | SES: a region change keeps it, a new ID refused, an ID changed in the DB → unreadable, ses→resend→ses drops it. M10, M11, M11b each fail their test |
| 5a | The SES binding change is sound | no | confirmed | The target is the checked ID (`^[A-Z0-9]{16,128}$`); the secret never goes on the wire (SigV4), the endpoint is always AWS's |
| 7 | Control characters refused in the From name and address | no | confirmed | M4 fails "refuses every line break and control character…" |
| 8 | The contact bounded, `https://` only, stored as parsed | no | confirmed | 500 saved, 501 and 70k → `InvalidMailSetupError` on all 4 dialects; mended spellings and full-width `ｈttps` refused; stored as `href` (IDN as punycode). Mlen, Mhref, Mmend fail |
| 11 | Two saves at once end as one save's whole setup | no | confirmed | 6 races each on PostgreSQL, MySQL, MariaDB: always A, B or C whole, no deadlock. Mwrite fails the race test 2 of 2 on each server (it can't bite on SQLite, which serialises writes) |
| 12 | `credentialChange: "removed"` only when one existed | no | confirmed | A password without a user → `secretWithoutUser`; the audit kinds right over a sequence. Mnouser fails (Mfalse is an equivalent mutant) |
| 13 | The sentences name the sender's name, Reply-To, contact, SMTP server, region, domain | no | confirmed | en, pt, fr all name them. Remark: a TLS-only change doesn't name TLS |
| 15 | `RONNE_MAIL_HOSTS` parsed into a normalised set, tested | no | confirmed | `parseMailRelays` normalises; the test at `mail-setup.db.test.ts:392`. Its caller is the Email tab (task 7) |
| 17 | Mutations of the secret code fail a test | no | confirmed | M4, M10, M11, M11b |
| 18 | The diff's other changes are pinned | no | partly | **Mview** (no AUTH_SECRET → `"elsewhere"`) and **Minvalid** (`secretInvalid` back to `secret`) survive |
| — | mail-setup tests on every dialect | no | confirmed | 26/26 on each of the four |

**Overall:** not met (row 18). Also: typing a secret with no AUTH_SECRET said "none is saved"; a TLS-only change unnamed.

Since then (not yet witnessed): tests "says the saved secret can't be read when the server has no AUTH_SECRET" and "names the field for a secret that can't be kept, or can't be sealed" (Mview and Minvalid each fail one now, 24 passed otherwise); a `noAuthSecret` field and message; the SMTP part of the sentence names the TLS mode. Note: during this pass Node 26's `pnpm` and `pnpx` links had been repointed to Corepack's shim (which can't start pnpm 12); they were restored to the npm-installed pnpm 12.21.0.

### Adversarial re-check 2

Witnessed: 2026-11-21 10:58 EST, by a fresh agent (adversarial). Commit: 31dcddaf + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1 (pnpm 12.6.0, the repository's `packageManager`).

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 18a | With no AUTH_SECRET a saved secret shows as unreadable | no | confirmed | Mview (`mail-setup.ts:93` → `"elsewhere"`) → "says the saved secret can't be read when the server has no AUTH_SECRET" fails |
| 18b | A too-long or multi-line secret names `secretInvalid` | no | confirmed | Minvalid → "names the field for a secret that can't be kept, or can't be sealed" fails |
| 18c | A secret typed with no AUTH_SECRET is refused as `noAuthSecret` | no | confirmed | `mail-setup.ts:233`; MnoAuth and MnoAuthDel each fail the same test; message at `exceptions/errors.ts:36-37` |
| 13 | The SMTP part of the sentence names the TLS mode, a TLS-only change included | no | confirmed | `host:port (tls)`; `sentences.test.ts` 12/12; Mtls fails "names each part that changed, in each language" |
| — | The suite passes on SQLite and one server | no | confirmed | `mail-setup.db.test.ts` 24/24 on SQLite and PostgreSQL |

**Overall:** met. With re-check 1 (blind) met, both latest passes are met. Remark: the field messages are English in `errors.ts`; the Email tab (task 7) turns field codes into screen text in three languages.

After the task 4 passes, before its commit: the pre-commit hook's `pnpm test` failed on `admin-untranslated.test.ts`, the five transport names (SMTP, Amazon SES, Mailgun, Postmark, Resend) reading the same in pt and fr; they were added to its `SAME` list as 136's provider names are. Not witnessed: a test allowlist for this task's own new words.

## Task 5 — The outbox

Witnessed: 2026-11-21 11:21 EST, by a fresh agent (blind). Commit: 9cca5739 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration `mail_outbox` has the spec's columns and four indexes, on all three dialects | no | confirmed | `0045_mail_outbox.ts:24-58`; `pnpm test:db:mysql src/server/db/` → 202 passed; the outbox tests migrate on PG, MySQL, MariaDB |
| 2 | Queued in the caller's transaction: a rolled-back change queues nothing | no | confirmed | `queueMail` writes only through the `db` given; the rollback test passes on 4 databases |
| 3 | Sealed body bound to the row; only an HMAC of the lowercased address in clear | no | confirmed | `models/outbox.ts:35-72`; no clear text in the row; the body won't open on another ID |
| 4 | Each status reached and tested | no | confirmed | queued, sending, sent, failed, dropped; M2 (sent keeps `body_enc`) → fails |
| 5 | Conditional claim: two connections never send one row; tested | no | partly | Code holds (probe, same ID, 1 send on PG); M1 (claim without its condition) → the repo's tests pass on PG |
| 6 | Only the holder finishes; a claim that ran out is taken again | no | confirmed | `finish` checks `claim_id` and `sending`; test passes on 4 databases |
| 7 | Retry schedule, 8 tries | no | confirmed | M8 (3 h→2 h) → fails |
| 8 | Permanent error fails at once, body deleted | no | confirmed | test passes |
| 9 | 429 waits for Retry-After | no | confirmed | M9 → fails |
| 10 | An expired code's email dropped | no | confirmed | M7 → fails; `expiresAt = now` → dropped |
| 11 | Cap of 10 an hour per address | no | partly | Sequential holds (M4 → fails); two concurrent transactions → 11 rows (PG, MySQL); rotate-secret resets the count |
| 12 | No body left after sent, failed or dropped | no | confirmed | `finish` and `dropWaiting`; M2 fails |
| 13 | The job every 30 s under the lease, 50 at a time | no | partly | Probe holds; no repo test of `runMailOutboxJob`, `MAIL_SCHEDULE` or the `startJobsIfOn` entry |
| 14 | Sending at once; retries the scheduler's | no | partly | The kick shares the job lease (skipped during a run) and sends every due row, retries included; no test |
| 15 | db tests pass on SQLite, PG, MySQL, MariaDB | no | confirmed | 43 on SQLite; 41 on each server |
| 16 | Retention purges rows older than the IP days; counted in the CLI and Privacy tab | no | confirmed | M10 → 2 tests fail |
| 17 | Erase deletes the person's rows | no | confirmed | M5 → fails; erase mid-send → `finish` changes nothing |
| 18 | *Your data* lists template, time, status only | no | confirmed | M11 → fails |
| 19 | rotate-secret re-seals; unreadable rows dropped and logged | no | partly | Re-seal holds (M6 → fails); an unreadable body is left in place |
| 20 | `mail.*` events carry no address or body | no | confirmed | `events.ts` field lists; captured lines |
| 21 | Sent to the queued address through the transport as it is at send time | no | confirmed | `deliverDue` builds `mailSender` per row |

**Overall:** not met (rows 5, 11, 13, 14, 19).

### Adversarial pass

Witnessed: 2026-11-21 11:13 EST, by a fresh agent (adversarial). Commit: 9cca5739 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration on all three dialects | no | confirmed | 42/42 on each server |
| 2 | Rolled-back transaction queues nothing | no | confirmed | test on 4 databases; P5, 10 open transactions on separate pools committed |
| 3 | A body copied to another row doesn't open | no | confirmed | P6 → B dropped `unreadable` |
| 4 | `recipient_hmac` keyed and lowercased; lookalikes refused | no | confirmed | P4; M6 → 2 tests fail |
| 5 | At most 10 an hour | no | partly | Sequential holds; 10 concurrent transactions on 10 pools → 15 rows (PG, MySQL, MariaDB) |
| 6 | Concurrent runs never send one row twice | no | partly | P1 holds (6 pools × 30 rows); M2 (claim's `where` removed) → tests pass on PG |
| 7 | Only the holder finishes; a dead claimer changes nothing | no | partly | P2 holds; M1 (`claim_id` condition removed) → tests pass |
| 8 | A process dying mid-try heals | no | confirmed | P8; a crashing try is never counted (loops until the purge) |
| 9 | `mail_last_status` right | no | not met | P2: a dead run's late failure recorded `failing` after another run sent |
| 10 | Retry schedule | no | confirmed | M5, M12 → fail |
| 11 | Permanent errors and thrown sends fail at once | no | confirmed | P10; M11 → 4 fail |
| 12 | 429 waits for Retry-After | no | confirmed | M13 → fails; a huge `waitSeconds` throws `Invalid time value` (the transports cap it today) |
| 13 | `expires_at` | no | confirmed | P3; time zones; M4 (`<=`→`<`) survives |
| 14 | Body deleted on every end | no | confirmed | M3, M11 → fail |
| 15 | rotate-secret re-seals; unreadable dropped and logged | no | partly | Re-seal holds; P7, an unreadable body stays queued, unlogged |
| 16 | Retention purge | no | confirmed | M10 → 5 fail |
| 17 | Erase | no | confirmed | M7 → fails |
| 18 | Data download | no | confirmed | M8 → fails |
| 19 | `mail.*` events | no | confirmed | captured lines |
| 20 | The job every 30 s under the lease | no | partly | J1 holds; M14 (mail tick a no-op) → passes |
| 21 | Sending at once | no | partly | The kick has no caller or test; runs under the lease |
| 22 | db tests on 4 databases | no | confirmed | all pass |

**Overall:** not met (rows 5, 6, 7, 9, 15, 20, 21). Note: the probe `adv-job.db.test.ts` built the real Resend transport and likely made one HTTPS request with a dummy key and `a@example.com`.

Fixes after both passes: only the claim's holder ends a row or writes the status; a try is counted at claim, and a row cut off 8 times fails `interrupted`; the kick sends only the rows handed to it, outside the lease; Retry-After counts up to a day; rotate-secret drops and counts unreadable bodies (result, CLI, audit); tests for each. The cap stays counted, not locked: the spec now says it can be passed by racing queues and that rotate-secret restarts its count (an implementer's decision, raised with the owner).

### Re-check (blind)

Witnessed: 2026-11-21 11:34 EST, by a fresh agent (blind). Commit: 9cca5739 + working-tree diff. Machine: macOS 27.2.1, Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Migration columns and indexes | no | confirmed | `0045_mail_outbox.ts:26-58`; 4 databases |
| 2 | Caller's transaction | no | confirmed | test and probe on SQLite, PG, MySQL |
| 3 | Sealed body, keyed hash | no | confirmed | P6 (no lowercase) → 2 fail |
| 4 | Conditional claim, `claim_id`, holder only | no | confirmed | M2b → fails "two connections…"; M9 → fails "only the claim's holder…" |
| 5 | Each status; body deleted on sent, failed, dropped | no | confirmed | M1 → 2 fail; M8 → 4 fail |
| 6 | Schedule, 8 tries counted at claim, `interrupted` | no | confirmed | M7 → fails; probe 8 sends then failed |
| 7 | Permanent error | no | confirmed | M6 → fails |
| 8 | 429, up to a day | no | confirmed | M4 → fails |
| 9 | `expires_at` | no | confirmed | M5 → 2 fail |
| 10 | Cap | no | confirmed | M3 → fails; probe |
| 11 | Kick: handed rows only, outside the lease, with RONNE_JOBS=off, folding | no | confirmed | `scheduler.test.ts` batches `[["a"],["b","c"]]` |
| 12 | The job every 30 s under the lease, off with RONNE_JOBS=off | no | confirmed | `scheduler.test.ts`; lease behaviour by probe only |
| 13 | rotate-secret re-seals, drops and counts | no | confirmed | P4 → 2 fail; P5 → fails |
| 14 | Retention, erase, data download | no | confirmed | P1, P2, P3 → fail |
| 15 | db tests on 4 databases | no | confirmed | SQLite 779; 98/98 on each server |
| 16 | `mail.*` events | no | confirmed | PG and MySQL lines |

**Overall:** met. Remark: no repo test pins the job's lease behaviour.

### Re-check (adversarial)

Witnessed: 2026-11-21 11:29 EST, by a fresh agent (adversarial). Commit: 9cca5739 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Only the holder ends a row or writes the status | no | confirmed | Mfinish, Mstatus → fail on SQLite and a server |
| 2 | Counted at claim; `interrupted` after 8 | no | confirmed | P3 on 4 databases; Mclaiminc → 3 fail; Minterr → fails |
| 3 | The kick | no | partly | Code holds; a RONNE_JOBS check added to `sendMailNow` → 12/12 pass (the test stubs `run`) |
| 4 | The mail tick at 30 s, not with RONNE_JOBS=off | no | confirmed | Mfirst, Mevery, Mnostart → fail |
| 5 | Retry-After up to a day; NaN safe | no | partly | P2 on 4 databases; `DAY_S = 60*60` → passes |
| 6 | rotate-secret drops and counts (result, CLI, audit) | no | partly | Result pinned; dropping `mailDropped` from the audit → passes; no test of the CLI lines |
| 7 | Two connections, same ID, sent once | no | confirmed | Mclaim → fails on PG and MySQL; P5 |
| 8 | The expiry boundary | no | confirmed | Mexp → fails |
| 9 | The cap documented honestly | no | confirmed | SPEC lines 126-133 and the docblock |
| 10 | Attempts in each end path | no | confirmed | P3 |
| 11 | Data download, purge, erase | no | confirmed | Mexport2, Merase, Mpurge → fail |
| 12 | No address or body in a row, log or audit | no | confirmed | P4, P1 |

**Overall:** not met (rows 3, 5, 6): no behavioural bug. Remark: the last status is last-writer-wins across rows.

Fixes after the re-checks: tests run the real `sendMailNow` with RONNE_JOBS=off, check the day's wait to the second, the mail counts in the audit metadata, and the CLI lines. Each mutation above now fails a test.

### Re-check 2 (adversarial)

Witnessed: 2026-11-21 11:47 EST, by a fresh agent (adversarial). Commit: 9cca5739 + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `sendMailNow` runs with RONNE_JOBS=off, and a test fails if it refuses | no | confirmed | Three refusals in `sendMailNow` and one in `kickMailOutbox` → each fails a test |
| 2 | Retry-After counts up to exactly one day | no | confirmed | `DAY_S` −1 s, +1 s, 12 h, 48 h, `Math.min` removed → each fails "waits at most a day…" |
| 3a | `mailResealed` and `mailDropped` reach the audit metadata | no | partly | Removing either fails; `{ mailDropped: mailResealed }` passes (1 and 1 in the test) |
| 3b | The CLI's mail lines, counts and plurals | no | partly | Probe right for 1/3 and 0/0; four plural mutations pass (the test checks one form of each) |
| 4 | The `test` option on `sendMailNow` isn't reachable in a way that matters | no | confirmed | Callers grep; the kick passes two arguments; no `"use server"` |
| 5 | Mail folder on SQLite and one server | no | confirmed | 163 passed; PG 49 passed |

**Overall:** not met (rows 3a, 3b): test gaps only.

Fixes after re-check 2: the rotate-secret test has 2 re-sealed and 1 dropped and checks `{ mailResealed: 2, mailDropped: 1 }`; the CLI test adds 1 re-sealed and 2 dropped, checking both singular and plural lines. Rerun by the implementer: `{ mailDropped: mailResealed }` and the four plural mutations each fail a test; files restored and `cmp`-checked.

### Re-check 3 (adversarial)

Witnessed: 2026-11-21 12:32 EST, by a fresh agent (adversarial, a third round at the owner's request). Commit: 9cca5739 + working-tree diff. Machine: macOS (Darwin 27.2.0), Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3a | rotate-secret's `mailResealed` and `mailDropped` reach the audit metadata with the right values | no | confirmed | `instance-access.ts:165-186`; 5 mutations (swap, remove each, drop counted as re-seal, +1 in the audit only) → each fails "drops and counts, on rotate-secret…" (1 failed, 24 passed) |
| 3b | The CLI's queued-email lines: counts, wording, plurals | no | confirmed | `rotate-secret.ts:224-230`; 11 mutations (each of the 8 plural forms, both counts swapped, `> 0`→`> 1`) → each fails "says how many queued emails…" (1 failed, 26 passed) |
| 3c | Both test files pass on SQLite; `outbox.db.test.ts` on PostgreSQL | no | confirmed | SQLite 52 passed; PostgreSQL 25 passed; `git status` unchanged |

**Overall:** met. With re-check (blind) met, both latest passes are met.

## Task 6 — Templates

Witnessed: 2026-11-21 12:46 EST, by a fresh agent (blind). Commit: 9234f04d + working-tree diff (namespaces.ts, request.ts, SPEC.md, three new mail.json files, templates.ts, templates.test.ts and its snapshot). Machine: macOS (Darwin 27.2.0), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `mail.json` in en, pt, fr; `mail` registered as a namespace | no | confirmed | three files; `namespaces.ts`; parity "has exactly the namespaces NAMESPACES lists" passes |
| 2 | The i18n key and placeholder tests pass for `mail` | no | confirmed | 437 passed; M1 (pt key deleted) and M2 (fr placeholder renamed) → fail |
| 3 | The test email and the six notices | no | confirmed | `test` and 7 notice keys (on/off are two); subjects match the SPEC table |
| 4 | Snapshots of each template in each language, text and HTML | no | confirmed | 48 snapshots; M4 → fails |
| 5 | A test shows no template holds a sign-in link | no | confirmed | templates.test.ts:24-37; M3b, M3c → fail |
| 6 | Inline styles, no remote content | no | confirmed | templates.ts; snapshots read |
| 7 | Every value escaped in the HTML | no | confirmed | M5 → fails; probe: no ICU re-interpretation |
| 8 | The host appears in every message | no | confirmed | per-template assertion; footer in all 24 renders |
| 9 | Ends with "If this wasn't you…", what to do, the contact | no | confirmed | contact test passes; every `notYou` says what to do |
| 10 | The time in one numeric form, UTC | no | confirmed | `mailTime`; probe at 23:59:59Z |
| 11 | `Auto-Submitted: auto-generated` | no | confirmed | compose.ts:26, apis.ts:106; 69 transport tests |
| 12 | The locale rule | no | confirmed | `mailLocale` → `chooseLocale`; tests and probes |
| 13 | `mail.json` never sent to a page | no | confirmed | request.ts strips `mail`; the provider inherits the config |
| 14 | pt and fr correct, natural, glossary-true, true to the app | no | partly | Glossary followed; four wording nits; `sso_linked` without a provider renders "com ." |

**Overall:** not met (row 14).

Fixes after the pass: `renderMail` refuses `sso_linked` without a provider's name (test added); the footer says "whenever the way you sign in to your account changes" in all three languages; fr says "sur {host}" throughout and "Un root a défini un nouveau mot de passe pour vous"; pt says "Um login da sua empresa foi vinculado à sua conta". Snapshots updated; 438 passed.

### Re-check 1

Witnessed: 2026-11-21 12:46 EST, by a fresh agent (blind). Commit: 9234f04d + working-tree diff. Machine: macOS (Darwin 27.2.0), Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | pt and fr wording correct, natural, glossary-true | no | confirmed | read against `docs/knowledge/i18n.md` glossary; Canadian forms in fr |
| 2 | One preposition for the host in each language | no | confirmed | pt "em {host}" in all 10; fr "sur {host}" in all 10 |
| 3 | True to what the app does | no | confirmed | 7 notice keys match `MAIL_NOTICES` and the SPEC table; the footer line only on notices |
| 4 | `sso_linked` never renders "with ." | no | confirmed | `renderMail` throws when `!values.provider?.trim()` |
| 5 | A test pins it | no | confirmed | `templates.test.ts:64-68` (undefined, "", blank) |
| 6 | Template and i18n tests pass | no | confirmed | 21 files, 438 passed |

**Overall:** met. Remarks: en says "Root sent" in the test email and "A root…" in the notices; the Email tab's pt and fr labels (task 7) should be "E-mail" and "Courriel", as `test.body` names them.

## Task 7 — The Email tab

Witnessed: 2026-11-21 13:06 EST, by a fresh agent (blind). Commit: f38ee589 + working-tree diff. Machine: macOS (Darwin 27.2.0), Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `email` in `SETTINGS_TABS` after Authentication; root only | no | confirmed | `tabs.ts:8`; `page.tsx:55`; `requirePermission` in each service; "is root's only" passes |
| 2 | Each status | no | confirmed | 60/60 across 5 files; mutation `"untested"`→`"xx"` → fails |
| 3 | Each transport's fields and 3 steps | no | confirmed | `email.test.tsx:117-138` |
| 4 | Write-only secrets; a new transport or target asks again; no secret reaches the page | no | confirmed | `typing = true` → 2 fail; target mutation → fails; probe `mailSetup` has no secret value |
| 5 | A relay host refused unless listed; the form points at the host | no | confirmed | `fieldOf` mutation → fails; probe 10.0.0.5 refused, saved when listed |
| 6 | Instance contact: address or `https://`; `http://` and a user name refused; empty allowed | no | confirmed | component test; probe of `instanceContact` and the save |
| 7 | `mailReadiness()` for 190 and 194 | no | confirmed | probe before setup, after save, after stop; no repo test |
| 8 | Reply-To required, filled from the contact, on every message | no | confirmed | probe; fill test and its mutation; `mail-admin.ts:88`, `outbox.ts:188` |
| 9 | The test goes to root's own address; success and failure shown | no | confirmed | `to: user.email`; no address field; `detail` mutation → fails |
| 10 | 5 per root in 10 minutes | no | confirmed | 6/6 on each server; `>=`→`>` → fails |
| 11 | Stop sending: a second click, transport and status cleared, queued mail dropped, the rest kept | no | confirmed | `confirming` state, no `confirm()`; db test on 4 dialects |
| 12 | Screen text in three languages, every field code | no | confirmed | probe: all 16 codes worded in pt and fr; `errors.test.ts`; no-English test |
| 13 | No server-only value in client components; arrows; no raw colours | no | confirmed | grep: type imports only, plus `isMailAddress` from a module with no imports |
| 14 | The phone sweep passes on the tab | no | can't check here | `e2e/pages.ts:189` lists it; Playwright not run (brief) |

**Overall:** not met (row 14 unchecked). Notes: `mailReadiness()` has no repo test; the test limit isn't atomic; a transient test result sets *Failing*, which the spec read as "failed for good".

Fixes after the pass: a db test of `mailReadiness()` (set up, stopped, nothing saved); the spec says a test email that doesn't go, transient or not, sets *Failing*, and that the test count isn't locked (racing clicks only reach root's own inbox).

### Re-check 1

Witnessed: 2026-11-21 13:04 EST, by a fresh agent (blind). Commit: f38ee589 + working-tree diff. Machine: macOS 27.2.1, Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The phone sweep passes on the Email tab, in en, pt and fr | no | confirmed | `e2e/pages.ts:189` lists the tab; `pnpm exec next build`, then `pnpm exec playwright test e2e/mobile-sweep.mobile.e2e.ts --project phone -g "as root"` → 3 passed (28.3s) |
| 2 | `mailReadiness()` has a test that catches `sending: true` without a transport | no | confirmed | 7/7; mutation `sending: true` → fails at line 212; `cmp` after restore |
| 3 | The spec's status and test-limit wording matches `mail-admin.ts` | no | confirmed | `SPEC.md:77-78` and `:95-97` against `mail-admin.ts:70-72,103-118` |

**Overall:** met. With the first pass's rows 1–13 confirmed, every row is met.

## Task 8 — Security notices

Witnessed: 2026-11-21 13:18 EST, by a fresh agent (blind). Commit: ae42a47a + working-tree diff (13 modified files, 2 untracked). Machine: macOS (Darwin 27.2.0), Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass on all four dialects | no | confirmed | security-notices and sso: 48 on SQLite and on each server |
| 2 | `changePassword` queues one, own address, language, contact | no | confirmed | `session.ts` `record`; M1 (removed) → 3 fail |
| 3 | Both password resets queue one | no | confirmed | M7 → the CLI test fails |
| 4 | Two-factor on, new codes, off each queue one in the audit row's transaction | no | confirmed | M6 → fails |
| 5 | Both two-factor resets queue one; one that changes nothing queues none | no | confirmed | probe C |
| 6 | The SSO link queues one, with the provider's name, own address and language | no | confirmed | M4 → fails; fr probe |
| 7 | The contact when set, the reply line when empty | no | confirmed | probes B, B2; M5 → fails |
| 8 | The locale rule | no | confirmed | probes B, E |
| 9 | Address and language from the account; can't be turned off | no | confirmed | `notices.ts` |
| 10 | A failed change queues none | no | confirmed | tests and probe C |
| 11 | None with email off | no | confirmed | probe A on 4 dialects; M2 survives (`queueMail`'s own guard) |
| 12 | A rolled-back change leaves no row | no | confirmed | probe D on 4 dialects |
| 13 | Ids handed on only once committed | no | partly | behaviour holds; M3 (handed on at once) → tests pass |
| 14 | Send-at-once registered at start; terminal notices wait for the scheduler | no | confirmed | `instrumentation.ts`; kick probe |
| 15 | Spec and plan name the API that exists | no | partly | `sendSecurityNotice` named; the function is `queueSecurityNotice` |

**Overall:** not met (rows 13, 15).

### Adversarial pass

Witnessed: 2026-11-21 13:20 EST, by a fresh agent (adversarial). Commit: ae42a47a + working-tree diff. Machine: macOS 27.2.1, Node v26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Each event path queues exactly one | no | confirmed | 8 audit sites, each with its notice; SCIM and the API write none; Better Auth's own endpoints 404 |
| 2 | To the account's own address | no | confirmed | P8 |
| 3 | In the person's language | no | confirmed | P11 |
| 4 | The contact, or the reply line | no | confirmed | tests |
| 5 | In the change's transaction | no | partly | P1 holds; M1 (after the commit) and M3 (outside) → tests pass |
| 6 | None with email off or AUTH_SECRET missing | no | confirmed | P6 |
| 7 | Handed on only once committed | no | partly | P1, P2 hold; M2 → tests pass |
| 8 | No hand-on before an outer commit | no | confirmed | P3: Kysely refuses nested transactions |
| 9 | A refused change queues none | no | confirmed | tests |
| 10 | Nothing leaks into body, logs, audit | no | confirmed | P8, P11 |
| 11 | CLI paths: queued, sent later | no | confirmed | P12; with RONNE_JOBS=off never sent |
| 12 | Send-at-once registered at start | no | confirmed | P12; no repo test |
| 13 | Erased and disabled accounts | no | confirmed | P13 |
| 14 | Tests pass on 4 databases | no | confirmed | 48 each |
| 15 | Removing a notice call fails a test | no | confirmed | M4 |

**Overall:** not met (rows 5, 7). Owner's call raised: terminal notices with RONNE_JOBS=off are never sent. Note: Better Auth commits its changes before the audit-and-notice transaction.

Fixes after both passes:
- Tests: a rolled-back transaction hands on and leaves nothing, and a committed one hands on only after it commits (the early hand-on now fails a test); with the outbox unwritable, a password change and two-factor off leave no audit row; with the audit unwritable, a password change and a root's reset leave no notice. Each notice is now written before its audit row. M1 after, M1 before and M3 each fail a test (rerun by the implementer, files restored and `cmp`-checked).
- Terminal: `reset-root-password` and `reset-two-factor` run through `withNoticesSent`, which reads the instance's own settings file and sends the notices before the command exits (RONNE_JOBS off included); a test sends through a fake.
- Docs: the spec and plan name `queueSecurityNotice(userId, kind, at, provider?)`; the spec states Better Auth's order and the terminal's sending.
- 4175 on SQLite; 112 on each server.

### Re-check (blind)

Witnessed: 2026-11-21 13:32 EST, by a fresh agent (blind). Commit: ae42a47a + working-tree diff (14 modified, 3 untracked). Machine: macOS (Darwin 27.2.0), Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass on all four dialects | no | confirmed | 52 on SQLite and on each server |
| 13 | Ids handed on only once committed | no | partly | Code right; M3 → fails; M3b (hand on after `work`, before COMMIT) and M3 on the SSO repository → pass |
| 15 | Spec and plan name the API that exists | no | partly | 189 fixed; 194, 196 and 197 still say `sendSecurityNotice` |
| 16 | The notice is in the change's transaction | no | confirmed | M1 → 7 fail |
| 17 | The terminal commands send before they exit | no | confirmed | M8 → fails |
| 18 | …from their own settings file | no | partly | probe holds; M9 (`setNoticeConfig` removed) → tests pass |

**Overall:** not met (rows 13, 15, 18): test gaps and a stale name.

### Re-check (adversarial)

Witnessed: 2026-11-21 13:37 EST, by a fresh agent (adversarial). Commit: ae42a47a + working-tree diff. Machine: macOS (Darwin 27.2.0), Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Tests and reset-root pass | no | confirmed | 56 on SQLite; 52 on PostgreSQL |
| 2 | Each of the nine notices in its transaction | no | partly | Code holds; "out" on PostgreSQL caught at 2 of 9 sites |
| 3 | Each written before its audit row | no | partly | By reading; "after" passes everywhere: not observable |
| 4 | Ids handed on only after commit | no | confirmed | test and P2 |
| 5 | The terminal reads its own settings file | no | confirmed | P1, P1b |
| 6 | The override doesn't leak | no | confirmed | P2 |
| 7 | A failed or no-op command sends nothing | no | confirmed | P4 |
| 8 | A throwing or hanging send doesn't hold the command | no | partly | throwing → failed for good (task 5's rule), not "stays queued"; hanging → never returns |
| 9 | Right address and language; nothing leaks | no | confirmed | P6, P1 |
| 10 | Nothing else broken | no | can't check here | over budget |

**Overall:** not met (rows 2, 3, 8).

Fixes after both re-checks:
- Tests: one test changes each of the nine events with `audit_log` unwritable and expects no notice of it (Bea for two-factor on, since Better Auth turns it on before Ronne's transaction; the resets before turning off, which Better Auth commits). The "out" mutation now fails a test at all nine sites on PostgreSQL (rerun by the implementer, files restored and `cmp`-checked); the SSO link has its own audit-away test in `sso.db.test.ts`. A hand-on test counts one per committed transaction and none for a rollback in both repositories (M3 on the SSO repository → fails). A test with AUTH_SECRET, PUBLIC_URL and RONNE_ENV_FILE emptied reads the secret and the public address from `appDir`'s `.env` (M9 → fails).
- M3b is not testable: Kysely resolves `execute()` after COMMIT, and a hand-on placed just before it can't be told apart from outside; the code calls `mailQueued` after `execute()` returns.
- `withNoticesSent` waits at most 30 seconds for its sends (tested with a send that never answers: the command returns and the row stays `sending`, for the server to take again).
- Spec: the notice and the audit row share the transaction (no claim about their order); a terminal try that fails follows the outbox's rules. 194, 196 and 197 name `queueSecurityNotice`.
- 4180 on SQLite; 182 on each server.

### Re-check 2 (blind)

Witnessed: 2026-11-21 13:45 EST, by a fresh agent (blind; it read the implementer's fixes list above to choose the rows, and says so in the notes column). Commit: ae42a47a + working-tree diff (14 modified, 3 untracked). Machine: macOS (Darwin 27.2.0), Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass on SQLite and the servers | yes | confirmed | 57 on SQLite, PostgreSQL and MySQL; MariaDB not run |
| 13 | Ids handed on only once committed, both repositories | yes | confirmed | M3-SSO → fails; M3b checked by reading only |
| 15 | Spec and plan name the API that exists | yes | confirmed | 194, 196, 197 say `queueSecurityNotice` |
| 18 | The terminal reads its own settings file | yes | confirmed | M9 → fails |

**Overall:** met.

### Re-check 2 (adversarial)

Witnessed: 2026-11-21 13:54 EST, by a fresh agent (adversarial). Commit: ae42a47a + working-tree diff (14 modified, 3 untracked). Machine: macOS (Darwin 27.2.0), Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass on all four dialects | no | confirmed | 65 on SQLite; 61 on each server |
| 2 | Each of the nine notices in its change's transaction | no | confirmed | "out" at each of the 9 sites on PostgreSQL → each fails a test |
| 3 | Ids handed on only after the commit, both repositories | no | confirmed | hand-on at queue time → fails in each |
| 4 | The terminal reads its own settings file | no | confirmed | `setNoticeConfig` removed → fails |
| 5 | The terminal waits at most 30 seconds | no | confirmed | timer disabled → the hang test fails at 30 s |
| 6 | No notice for a change that didn't happen | no | confirmed | read; Better Auth's routes limited to `/get-session` and `/ok` |
| 7 | No notice missing for one that did | no | confirmed | exactly 9 writers, each with its notice |
| 8 | Right address, no secret, no injection | no | confirmed | read; provider name trimmed on save |
| 9 | A server that doesn't answer no longer holds the command | no | can't check here | `withNoticesSent` returns at 30 s, but the scripts don't exit, so a trickling SMTP server keeps the process alive; needs a real server |

**Overall:** not met (row 9, unverifiable here). Findings: a send delivered after the 30 s wait isn't recorded and is sent again by the server (a duplicate); remarks on `--database-url` with another instance's database, the cap dropping a notice, and concurrent turn-offs (before this task).

Fixes after re-check 2, at the owner's choice ("Fix, then a short third check"): `withNoticesSent` sets `noticesStillSending()` when its 30-second wait runs out, and `reset-root-password` and `reset-two-factor` then exit at once with their own code, so a server that keeps the connection open can't hold the terminal; the spec says a message the server got after the wait may arrive twice.

### Re-check 3 (adversarial)

Witnessed: 2026-11-21 14:35 EST, by a fresh agent (adversarial, a third round at the owner's request). Commit: ae42a47a + working-tree diff. Machine: macOS 27.2.1, Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The flag is set only when the wait runs out | no | confirmed | `cli-mail.ts:55-64`; probe: sent, throwing, a retry within the wait, a refused command → flag stays false |
| 2 | The scripts exit at once with the right code | no | confirmed | probe `scripts/probe-exit.ts`: hung → 0 in 0 s; refused → 2; finished → 0; without the line, held until killed |
| 3 | The hang test fails without the flag | no | confirmed | mutation `void finished;` → fails; `cmp` after restore |
| 4 | The scripts' own tests pass | no | confirmed | 3 files, 23 passed |
| 5 | The spec's sentence matches | no | confirmed | `SPEC.md:180-183` against `SEND_WAIT_MS`, the exit, the row left `sending` |

**Overall:** met. With re-check 2 (blind) met, both latest passes are met. Gap left: no repo test asserts the flag stays off after a finished send (the probe does).

## Task 9 — The threat model

Witnessed: 2026-11-21 14:41 EST, by a fresh agent (blind). Commit: b9702a7f + working-tree diff of `docs/security/threat-model.md`. Machine: macOS 27.2.1, Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The credentials' keys, sealing and binding | no | confirmed | `mail-settings.ts:19-24,83-125`; `crypto/sealed.ts:27,31` |
| 2 | The queued body sealed to its row, deleted at the end; the address otherwise a keyed hash | no | confirmed | `models/outbox.ts:30-37`; repository `body_enc: null` on each end; migration has `recipient_hmac` only (the HTML is sealed too, not listed) |
| 3 | The setup is `mail_*`, root's alone | no | confirmed | `requirePermission(…,"settings.manage")` |
| 4 | Diagram and boundary 12 | no | confirmed | five transports; only `test` and the notices |
| 5 | The SMTP host check on save and per connection | no | confirmed | `smtp-host.ts:32-56`; `mail-setup.ts:183`; `smtp.ts:129,150,156` |
| 6 | Plain SMTP only for a listed relay; TLS verified; fixed API hosts | no | confirmed | `smtp.ts:142-157`; `apis.ts`; `ses.ts`; `http.ts:110` |
| 7 | The test email's rules | no | confirmed | `mail-admin.ts:21-22,70-83,124-127` |
| 8 | Notices: no link, escaped, no line breaks, the cap | no | confirmed | `templates.ts`; `message.ts`; `outbox.ts` |
| 9 | rotate-secret re-seals, drops and counts | no | confirmed | `instance-access.ts:147-172` |
| 10 | No credential shown; no address or body in logs or audit | no | partly | the `settings.mail` audit records the From, Reply-To and contact addresses |
| 11 | The steps ask for a send-only key | no | partly | true for SES, Mailgun, Resend; not Postmark's server token, nor SMTP |
| 12 | A credential dropped on a new transport or target; Stop sending | no | confirmed | `mail-setup.ts:246-260`; `mail-admin.ts:153-156` |
| 13 | Audited as `settings.mail`, the secret only as *replaced* | no | confirmed | `mail-setup.ts:276-283` |
| 14 | The provider's answer cleaned | no | confirmed | `http.ts:32-67`; `smtp.ts:57` |
| 15 | In the audit row's transaction; claims; retries; expiry; duplicates; Better Auth's order | no | confirmed | `outbox.ts`; repository `claim_id` |
| 16 | §5's new gaps | no | confirmed | no bounce or DKIM code |
| 17 | The cited files exist | no | confirmed | `test -f` each |
| 18 | `pnpm docs:check` passes | no | confirmed | exit 0 |
| 19 | Nothing important left out | no | confirmed | — |

**Overall:** not met (rows 10, 11): wording.

Fixes after the pass: §4.4 says no recipient's address or body is in logs or audit rows, and that `settings.mail` names only the instance's own addresses; §4.9 says the send-only key applies where the provider has one (SES, Mailgun, Resend), not to a Postmark server token or an SMTP password; §1's body lists the HTML too.

### Re-check 1

Witnessed: 2026-11-21 14:43 EST, by a fresh agent (blind). Commit: b9702a7f + working-tree diff. Machine: macOS 27.2.1, Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | §4.4: no credential, recipient's address or body in logs or audit; `settings.mail` names only the instance's own addresses | no | confirmed | `mail-setup.ts:122-139,244-283`; `log/events.ts:180-195`; `mail-admin.ts:121-129` |
| 2 | §4.9: send-only keys for SES, Mailgun and Resend; not Postmark or SMTP | no | confirmed | `settings.email.steps` in `messages/en/admin.json` |
| 3 | §1: the sealed body holds address, subject, text and HTML | no | confirmed | `models/outbox.ts:30-37,57-62` |
| 4 | `pnpm docs:check` passes | no | confirmed | exit 0 |

**Overall:** met.

## Task 10 — Documentation and helpers

Witnessed: 2026-11-21 15:06 EST, by a fresh agent (blind). Commit: e937c3dc + working-tree diff (marketplace); ronne-web ba2ca0d on `docs/marketplace-189-outgoing-email`. Machine: macOS (Darwin 27.2.0), Node 26.13.1.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The `email` topic in en, pt, fr, with the spec's six sections | no | confirmed | `{en,pt,fr}/email.tsx` typed `TopicCopy<"email">`; `tsc --noEmit` exit 0 |
| 2 | The section ids match in both `topics.ts`; `pnpm docs:links` passes | no | confirmed | "Compared 38 topics with the website's."; a renamed id → exit 1 |
| 3 | The website's tests pass | no | confirmed | 33 files, 198 tests; Biome clean |
| 4 | The three helpers point at sections that exist | no | confirmed | `Help.tsx`; help.json in three languages; 467 tests passed |
| 5 | Each helper where it belongs | no | confirmed | `EmailForm.tsx` title and From hint; `TwoFactorPanel.tsx:75` |
| 6 | Labels quoted as the app shows them | no | confirmed | probe `labels.py` against `admin.json` and `common.json` |
| 7 | Facts on the email page match the code | no | confirmed | retries, cap, test limit, ports, TLS, Retry-After 6 h, SES binding, notices, UTC, log events, tab order |
| 8 | `privacy`: the outbox and the provider as a processor | no | confirmed | `retention-purge.ts`, export and erase repositories |
| 9 | `security#encryption` | no | confirmed | `setup/rotate-secret.ts:149-230` |
| 10 | `account`: a sentence on notices | no | confirmed | `en/account.tsx:131-139` |
| 11 | install.md's `RONNE_MAIL_HOSTS` | no | confirmed | `endpoint.ts:49-55`, `smtp.ts:146`, `config.ts:95` |
| 12 | MVP.md's rows no longer say planned | no | confirmed | diff and grep |
| 13 | pt and fr read correctly, glossary followed | no | confirmed | full read of both |

**Overall:** met. Note: "the helper opens its section" checked from the code and docs:links, not in a browser (the branch isn't deployed).
