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
