# 101 — Witness

Passes by the [state witness](../../knowledge/state-witness.md), newest last.

## Task 2 — The SDK, off by default

Witnessed: 2026-10-14 22:12 EDT, by a fresh agent (blind). Commit: a56f21b9 (checked at f49599d2, which only merges main). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Next.js 16's guide documents both ways; `@vercel/otel` is the lighter | yes | confirmed | `open-telemetry.md:31,101`; lockfile-only installs: 22 against 72 packages (23.9 against 34.3 MB unpacked), sdk-node bringing gRPC, Zipkin, Prometheus, Jaeger |
| 2 | Latest stable versions | yes | confirmed | `npm view`: only `-rc` or `-development` newer |
| 3 | No SDK module loaded without an endpoint; the test catches an eager import | yes | confirmed | 15 passed; two mutations each fail it |
| 4 | Built standalone server with no endpoint never loads the SDK chunk | no | confirmed | `Module._load` recorder: the 357,088 B chunk loaded 0 times |
| 5 | `OTEL_SDK_DISABLED=true` keeps it off with an endpoint | yes | confirmed | Standalone run: no telemetry line, chunk loaded 0 times |
| 6 | An invalid endpoint: one warning, the server starts, the endpoint not logged | yes | confirmed | `collector:4318` and `not a url`: one `telemetry.endpoint_invalid` each |
| 7 | A real request's trace reaches an in-process OTLP/HTTP receiver | yes | confirmed | Standalone `server.js`: protobuf posts with the configured headers and Next.js's `/api/health` spans |
| 8 | Traces go out once, through the one exporter | no | not met | Two identical `/v1/traces` posts: `@vercel/otel`'s default span processors add an env-built exporter beside `traceExporter` |
| 9 | Metrics go out over OTLP/HTTP on a periodic reader | yes | confirmed | `start.test.ts` asserts `ronne.test` reached `/v1/metrics` |
| 10 | Settings from the settings file reach the SDK; the environment wins | yes | confirmed | Probe with only the settings file: trace received, `service.name="from-file"`, `deployment.environment="staging"` |
| 11 | The resource: `service.name`, `service.version`, `deployment.environment` when set | yes | partly | Also `cloud.provider="vercel"`, `vercel.runtime`, `node.env`: `@vercel/otel`'s defaults |
| 12 | `telemetry.started` once, without the endpoint | yes | confirmed | `{"event":"telemetry.started","traces":true,"metrics":true}` |
| 13 | Collector down: `export_failed` at most once a minute; requests not slowed | yes | confirmed | 3 lines in 2.2 min; median 3.2 ms |
| 14 | Slow collector: requests not slowed | no | confirmed | Median 3.3 ms |
| 15 | Lockfile, licenses, audit | yes | confirmed | Up to date; 321 allowed; no vulnerabilities; no install scripts |
| 16 | The standalone output and `packages:check` include the packages | yes | confirmed | 2,113 files on the allowlist; the chunk in the packed `app/`; `THIRD_PARTY_NOTICES` lists them |
| 17 | The self-contained bundle includes them | no | can't check here | `pnpm bundle` downloads Node.js |
| 18 | PR #188 answers the six questions truthfully | yes | confirmed | Counts and the list match; sizes differ by method; `@vercel/otel` 2.1.3 is from 2026-06-11 (the PR said 06-19, 1.14.2's date) |

**Overall:** not met: every span exported twice; the resource carries Vercel's attributes. The first was fixed in b9184b7c (task 3: only our span processor; a test counts each span once and fails with the old wiring); the second in the next commit (the resource kept to `service.*`, `telemetry.sdk.*`, `deployment.*` and the operator's `OTEL_RESOURCE_ATTRIBUTES`, for spans and metrics; a test fails without it).

## Task 6 — Documentation

Witnessed: 2026-10-14 22:36 EDT, by a fresh agent (blind). Commit: 50a2b4f3 (ronne-web 765f6f8). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `operations#monitoring` in both `topics.ts`, titled as on the page | no | confirmed | ronne-web `topics.ts:74`; marketplace `help/topics.ts:163`; pt "Monitoramento", fr "Supervision" |
| 2 | The health endpoint's statuses, codes and body; the reason in the log | no | confirmed | `health.ts`: 3 s, the bodies, `storage.unavailable` with `err` |
| 3 | Telemetry on only with an address, from the settings file or environment; OpenTelemetry loaded only then | no | confirmed | `config.ts:54-61`; `telemetry/index.ts`; `start.test.ts` |
| 4 | Docker's `.env` reaches Ronne | yes | confirmed | `docker compose config` with a scratch `.env`; unset keys `""`, counted as unset |
| 5 | The variables, defaults and `OTEL_SDK_DISABLED` | no | confirmed | `start.ts`, `settings.ts`; the sampler read by `@vercel/otel` |
| 6 | `OTEL_EXPORTER_OTLP_PROTOCOL=http/json` gives JSON instead of protobuf | no | partly | Traces only: unset → traces `application/x-protobuf`, metrics `application/json`; the metric exporter is JSON-only |
| 7 | A collector down or slow: background retries, one `export_failed` a minute | no | confirmed | `failures.ts`; batch processor and periodic reader; `start.test.ts` |
| 8 | The metrics table: names, kinds, attributes, values | no | confirmed | `real-hooks.ts`; every `limit` emitter maps to one of the four values |
| 9 | The spans | no | confirmed | Next's `base-server.js:501/510` names; `queryLog` without parameters; the domain spans; `ronne.request_id` |
| 10 | Never sent; the resource | no | confirmed | `sanitize.ts`; a probe: resource keys `deployment.environment service.name service.version` |
| 11 | Logs and traces joined | no | confirmed | `logger.ts`; `real-hooks.ts` `traceIds`; the Logs bullet in en, pt, fr |
| 12 | The events table lists every event, in order, with level and fields | yes | confirmed | `events.mjs`: 26 rows each, same names and order |
| 13 | The collector example is valid for 0.162.0; the `docker run` line | yes | confirmed | Documented components only; the contrib image's config path |
| 14 | en, pt, fr the same, in the site's terms | no | confirmed | Side by side; terms match other pages. Remark: fr "point de santé" new on the site |
| 15 | `.env.example` truthful | no | confirmed | Lines 33-40 |
| 16 | `install.md`'s new row true | no | confirmed | Line 116; compose passes it |
| 17 | Render tests in both repositories | no | confirmed | 138 passed, typecheck exit 0; help tests 3 passed |

**Overall:** not met: the protocol sentence. Fixed in ronne-web 9e88973 ("to send traces as JSON … metrics always go as JSON", in en, pt, fr; fr "point de terminaison de santé") and in the next commit here (the spec and `.env.example` say the same).

## Task 4 — Metrics

Witnessed: 2026-10-14 22:45 EDT, by a fresh agent (blind). Commit: 50a2b4f3. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The test sees each of the 10 instruments with exactly its attributes, and no other | no | confirmed | 12 passed; an added `user` attribute fails it |
| 2 | Kinds and units match the table | no | confirmed | Own probe: three histograms in `s`, six monotonic sums, a 1/0 gauge |
| 3 | Real sign-ins count once with the right outcome | no | confirmed | Real `signIn`: failure 4, success 2, rate_limited 1; Better Auth's own sign-in endpoint answers 404 |
| 4 | Token exchanges count once; a CLI failure isn't a sign-in failure | no | confirmed | `exchangePassword`: failure 3, success 1, rate_limited 1; sign-ins unchanged |
| 5 | Releases count versions; a bulk release isn't counted twice | no | confirmed | `publishSubmission` + `releaseMany` of 2 → 3 |
| 6 | Feed builds once each; a cache hit `cached=true`, not timed | no | confirmed | Two `marketplaceAs` → false 1, true 1; one duration |
| 7 | Uploads and rate limits with the right labels; a 429 isn't a refusal | no | confirmed | 201, 400, 429 → accepted 1, refused 1; each `limit` once |
| 8 | `http.server.request.duration` from the API wrapper, route patterns | no | confirmed | 5 requests → 5 points; all 27 `apiRoute` patterns literals |
| 9 | `ronne.db.query.duration` per query | no | confirmed | `create-db.ts` for all three dialects; SQLite points with the two attributes |
| 10 | No attribute holds personal data or unbounded values | no | confirmed | `grep -F` on every metric body → 0; each value's source bounded |
| 11 | `ronne.health` reflects the health endpoint's checks | no | partly | `getSetupState` → `unavailable` (503 `database_unavailable`) returned before any gauge call: database stayed 1. Removing every `hooks().health` call left all tests green |
| 12 | Off: the hook does nothing, costs a call | no | confirmed | 0 OpenTelemetry modules resolved; ~4.5 ns per call |

**Overall:** not met: `ronne.health` stale on the setup-state path, and no test of the health check's recording. Fixed in the next commit: the path sets the database check to 0; a health test with a recording hook drives ok, storage failing and the database unavailable, and fails without the call.

## Task 2 — The SDK, off by default (re-check)

Witnessed: 2026-10-14 22:41 EDT, by a fresh agent (blind). Commit: 50a2b4f3. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Next.js 16's guide documents both ways; `@vercel/otel` is the lighter | no | confirmed | `open-telemetry.md:31,101`; lockfile-only installs: 71 against 21 packages |
| 2 | Latest stable versions, allowed licenses | no | confirmed | `npm view`: only `-rc`/`-development` newer |
| 3 | No SDK module without an endpoint; the test catches an eager import | no | confirmed | 12 passed; two mutations each fail it |
| 4 | The built standalone server with no endpoint never loads the SDK | no | confirmed | `_compile` recorder: the SDK chunk compiled 0 times; only `@opentelemetry/api`, which Next.js's own tracer requires |
| 5 | `OTEL_SDK_DISABLED=true` keeps it off | no | confirmed | Standalone: chunk 0 times, no telemetry line |
| 6 | An invalid endpoint: one warning, the server starts | no | confirmed | Three invalid forms: one `telemetry.endpoint_invalid` each, no endpoint in the log |
| 7 | A real request's trace reaches an in-process receiver | no | confirmed | Standalone: protobuf posts with the configured header, Next.js's `/api/health` spans |
| 8 | Each trace arrives once | no | confirmed | 79 spans, 79 unique ids; JSON run 73/73 |
| 9 | The resource: `service.*`, `telemetry.sdk.*`, `deployment.*`, the operator's keys, on spans and metrics | no | confirmed | No `cloud.*`, `vercel.*`, `node.env` |
| 10 | Settings from the settings file reach the SDK; the environment wins | no | confirmed | `from-file`, `filestage`; `from-env` over `from-file` |
| 11 | Docker's `.env` reaches the container; empty `OTEL_*` count as unset | no | confirmed | `docker compose config`; all 11 empty → off |
| 12 | `telemetry.started` once, without the endpoint | no | confirmed | Once; the endpoint and header absent |
| 13 | Collector down: `export_failed` at most once a minute; requests not slowed | no | confirmed | 3 lines in 130 s; median 2.4 ms against 2.2 ms |
| 14 | A collector that never answers doesn't slow requests | no | confirmed | Median 2.5 ms; max 25 ms against 27 ms |
| 15 | Lockfile, licenses, audit; no install scripts | no | confirmed | Up to date; 321; none; none |
| 16 | The standalone output has the packages; `packages:check` passes | no | confirmed | One chunk; 2,113 files on an unchanged allowlist |
| 17 | PR #188 answers the six questions truthfully | no | partly | The chunk is 378,883 B now, not 352 KB; 10-13's OpenTelemetry releases were `-rc` (the stable ones 10-06); package counts 21/71 without the root |

**Overall:** not met: #188's dependency answers. Fixed in the PR's description (about 370 KB, 378,883 bytes with tasks 3–5; the last stable release 2026-10-06, 10-13's pre-releases; 21 and 71 packages, from `npm install --package-lock-only`'s lockfile without the root) and in the plan's note.

## Task 3 — Spans

Witnessed: 2026-10-14 22:32 EDT, by a fresh agent (blind). Commit: 50a2b4f3. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Off: nothing from OpenTelemetry imported; the cost a function call | yes | confirmed | `hooks.ts:27-35`; standalone with no endpoint: the SDK chunk never loaded |
| 2 | Off: no query hook, no storage wrapper | yes | confirmed | `create-db.ts`; `storage/index.ts:20`; 0 `traceId` in the log |
| 3 | On: a span per query under the request, back-dated | yes | confirmed | `spans.test.ts`; two mutations fail it; real server: every `db *` span under its route or Better Auth's span |
| 4 | The query text never carries a parameter | no | confirmed | `sql.lit`/`sql.raw` only constants; 59 query texts from a real server |
| 5 | Storage spans carry bytes, never the key | no | confirmed | `spans.test.ts`; a mutation fails 2 tests; real server |
| 6 | The three domain spans exist, each under its request, with their attributes | no | confirmed | Real server and the privacy scenario |
| 7 | `ronne.request_id` on the API route's and proxy's spans | no | confirmed | Real server. Remark: a page's proxy span is in its own trace (Next.js's layout) |
| 8 | Log lines carry the span's `traceId` and `spanId` | no | confirmed | `logger.ts:215`; a mutation fails the test; real server |
| 9 | The tests see each span under its request | no | partly | Domain spans: started detached (`ROOT_CONTEXT`), all 20 tests passed |
| 10 | The domain spans' attributes and the proxy's request id are tested | no | partly | Removing `ronne.feed.cached`, `ronne.feed.plugins`, `ronne.items` or the proxy's annotation left every test passing |
| 11 | What leaves is sanitized | no | confirmed | `sanitize.test.ts`; two mutations fail it; real server, 718 spans: none of 18 needles |
| 12 | Each span leaves once | yes | confirmed | 718/718 unique; `ONCE 1`; adding `"auto"` fails it |
| 13 | Better Auth's spans carry nothing personal and nest | no | confirmed | Only route, operation, hook, context, collection attributes |
| 14 | No regressions | no | confirmed | 805 + 41 + 20 tests passed |

**Overall:** not met: the domain spans' nesting and attributes, and the proxy's request id, weren't tested. Fixed in the next commit: the privacy test checks each domain span's parent is its request's span and its attributes (`ronne.items`, `ronne.tool`, `ronne.feed.cached` both ways, `ronne.feed.plugins`), the scenario building the feed twice; a proxy test with a recording hook checks `ronne.request_id` is the answer's `X-Request-Id`. Each of the witness's five mutants now fails a test.

## Task 1 — Health checks storage

Witnessed: 2026-10-14 23:07 EDT, by a fresh agent (blind). Commit: fea1a956. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `StorageAdapter` declares `check()` | no | confirmed | `storage-adapter.ts:15-19` |
| 2 | The local adapter's `check()` writes no file | no | confirmed | `stat` and `access` only; a probe: 0 entries after, a missing path not created |
| 3 | A folder not made yet passes when its nearest parent can take it | no | confirmed | Probe; the test fails with two mutations |
| 4 | A file in its place, a read-only folder, a missing folder under a read-only parent, a path under a file all fail | no | confirmed | Probe: each fails with its error |
| 5 | Every other implementer has `check()` | no | confirmed | `instanceStorage`, `tracedStorage`; `tsc` exit 0 |
| 6 | Database first, then storage; storage skipped when setup or the database fails | no | confirmed | `health.ts:43-68`; checking storage first fails 8 tests |
| 7 | Each check gets a 3 s limit | no | confirmed | `withinTimeout`; two mutations fail the timeout test |
| 8 | The two together stay under the Dockerfile's health-check timeout | no | partly | `--timeout=5s`, but 3 s + 3 s run one after the other (up to 6 s), and `getSetupState` had no limit |
| 9 | The 200 body exactly, `no-store`, nothing else | no | confirmed | `toEqual`; an extra field fails it |
| 10 | The 503 `storage_unavailable` body | no | confirmed | `toEqual` on four failures |
| 11 | `setup_required` and `database_unavailable` unchanged | no | confirmed | Tests; e2e, Dockerfile, install scripts and workflows unchanged |
| 12 | `storage.unavailable` written, no stored item path | no | confirmed | Removing the line fails the test. Remark: the test didn't assert the path is hidden |
| 13 | `health.db.test.ts` covers read-only and missing folders, and fails when the check breaks | no | confirmed | Three mutations fail it. Remark: removing `isDirectory()` survived (an executable file in the folder's place) |
| 14 | Database tests on three servers | no | confirmed | CI jobs on mariadb, postgres, mysql; read-only cases ran |
| 15 | The Dockerfile's health check passes unchanged | no | confirmed | Image job: `setup_required`, then 200s |
| 16 | The server checks pass | no | confirmed | Install and run ×4, systemd, launchd |
| 17 | The e2e tests pass unchanged | no | confirmed | 72 and 72 |

**Overall:** not met: the two 3-second limits added up past the Dockerfile's 5 seconds, and the setup state had none. Fixed on `bugfix/101-witness-fixes`: one 4-second deadline, the setup state and the database's check at most 3 seconds each, storage what's left; tests for a hung storage (answers by about 4 s), a database that never answers (`database_unavailable` within 3 s), an executable file in the folder's place, and the logged path hidden. Passes on SQLite, PostgreSQL, MySQL and MariaDB.

## Task 4 — Metrics (re-check)

Witnessed: 2026-10-14 23:20 EDT, by a fresh agent (blind). Commit: fea1a956. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Every instrument, kind and unit | no | confirmed | Probe: exactly 10 |
| 2 | Exactly the listed attributes | no | confirmed | Two mutations fail the test |
| 3 | Sign-ins once, right outcome | no | confirmed | success 2, failure 1, rate_limited 1 |
| 4 | Token exchanges, right outcome | no | confirmed | 1 / 1 / 1 |
| 5 | Releases, single and bulk, once | no | confirmed | 3 |
| 6 | Feed builds and cache hits; duration for builds | no | confirmed | 2 / 2; count 2 |
| 7 | Uploads accepted or refused; a 429 not a refusal | no | confirmed | 1 / 1 |
| 8 | Rate limits with the four values | no | confirmed | One each |
| 9 | Request histogram from the API wrapper, patterns only | no | confirmed | Points with literal patterns. Remark: whole milliseconds, so fast requests record 0 |
| 10 | Query histogram, dialect and operation | no | confirmed | SQL verbs only |
| 11 | `ronne.health` on every path | no | confirmed | Each path probed. Remark: storage keeps its last value when the database fails |
| 12 | A test fails when any health recording is removed | no | partly | The query-failure call (`health.ts:54`) removed → every test passed |
| 13 | No personal data, no unbounded values | no | confirmed | 19 metric bodies |
| 14 | Off costs a function call | no | confirmed | 0 OpenTelemetry modules |

**Overall:** not met: the query-failure recording unpinned. Fixed on `bugfix/101-witness-fixes`: the gauge test drives a setup state that says ready and a query that fails; without the call it fails.

## Task 6 — Documentation (re-check)

Witnessed: 2026-10-14 23:03 EDT, by a fresh agent (blind). Commit: fea1a956 (ronne-web 9e88973, the same tree as main 2592d8d). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `operations#monitoring` in both `topics.ts`, titled as on the page | no | confirmed | Both; 7 sections in the same order |
| 2 | The health endpoint's statuses, codes, body; reasons in the log | no | confirmed | `health.ts:10,44-71`; tests |
| 3 | Docker's health check, the services and the install scripts wait on it | no | confirmed | `Dockerfile:70`, `install.sh:415,417`, the server package |
| 4 | Off unless an endpoint is set; settings file or environment; read at start | no | confirmed | `settings.ts`, `index.ts`, `config.ts`, `register()` |
| 5 | Docker: `OTEL_*` in the `.env` next to `compose.yaml` | no | confirmed | `docker compose config`; empty counts as unset |
| 6 | The example variables | no | confirmed | `start.ts:61`, `settings.ts:76-79` |
| 7 | Signal endpoints, sampler, export interval | no | confirmed | `settings.ts`; `@vercel/otel`'s `buildSamplerFromEnv` |
| 8 | The protocol sentence: traces only; metrics always JSON | no | confirmed | `settings.ts:65-68`, `start.ts:33-34`, the metric exporter's serializer; pt and fr the same |
| 9 | `OTEL_SDK_DISABLED`; an invalid endpoint reported, off | no | confirmed | `settings.ts:57-60`, `index.ts:26` |
| 10 | A collector down or slow never slows a request; one `export_failed` a minute | no | confirmed | `failures.ts`; two tests |
| 11 | The collector config is valid for contrib 0.162.0 | no | confirmed | The release's manifest and components' READMEs |
| 12 | The `docker run` line | no | confirmed | The release's Dockerfile config path; the tag exists |
| 13 | The metrics table | no | confirmed | `real-hooks.ts`; every `limit` value maps |
| 14 | The spans | no | confirmed | Next's names; `real-hooks.ts`; `api-route.ts` |
| 15 | Never sent; the resource | no | confirmed | `sanitize.ts`; a probe of the resource keys |
| 16 | The suggested alerts use real instruments | no | confirmed | `health.ts`, the instruments |
| 17 | Logs and traces joined | no | confirmed | `logger.ts:216`; `spans.test.ts` |
| 18 | The events table matches `events.ts` | no | confirmed | 26 rows each, same order |
| 19 | en, pt, fr the same, in the site's terms | no | confirmed | The diffs side by side |
| 20 | `.env.example` | no | confirmed | Commented, correct |
| 21 | `install.md`'s new row | no | confirmed | Line 116 |
| 22 | Render tests in both repositories | no | confirmed | 138 passed, typecheck exit 0; help 3 passed |

**Overall:** met.

## Task 3 — Spans (re-check)

Witnessed: 2026-10-14 23:12 EDT, by a fresh agent (blind). Commit: fea1a956. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Off: nothing from OpenTelemetry imported | no | confirmed | Resolve-hook probe: 0 modules |
| 2 | Off: no query hook, no storage wrapper | no | confirmed | `queryLog` undefined; `tracedStorage(ls) === ls` |
| 3 | On: a span per query under the request, placeholders only | no | confirmed | Two mutants fail; real server: 1,173 `db *` spans, all parented, only constant literals |
| 4 | Storage spans: bytes, never the key | no | confirmed | Two mutants fail; real server: 60 spans |
| 5 | The domain spans under their requests with their attributes (real server) | no | confirmed | Single and bulk `ronne.release`, `ronne.feed.build`, `ronne.draft.upload` each under its route |
| 6 | `ronne.request_id` on route and proxy spans (real server) | no | confirmed | Every route span, all 105 middleware spans |
| 7 | Log lines carry `traceId`/`spanId` | no | confirmed | 27/27 match an exported span |
| 8 | Tests pin each domain span's nesting | no | partly | Detaching the bulk `releaseMany`'s `ronne.release` → 134/134 pass |
| 9 | Tests pin each domain attribute | no | partly | Dropping the bulk `ronne.items` (`bulk-release.ts:136`) → 134/134 pass |
| 10 | Tests pin the proxy's and route's request id | no | confirmed | Each mutant fails |
| 11 | Tests pin the log's trace IDs | no | confirmed | Mutant fails |
| 12 | Tests see each span under its request | no | partly | Not for the bulk `ronne.release` |
| 13 | What leaves is sanitized (real server) | no | confirmed | 2,558 spans, JSON and protobuf: 0 hits for 20 needles; no events or status messages |
| 14 | Each span leaves once | no | confirmed | 2,558 unique |
| 15 | No regressions | no | confirmed | 134 + 1 tests passed |

**Overall:** not met: the bulk release's span and count untested. Fixed on `bugfix/101-witness-fixes`: the privacy scenario releases two more items together under `POST /reviews`, and the test expects two `ronne.release` spans (under `POST /release` and `POST /reviews`) with `ronne.items` 1 and 2; detaching the bulk span or dropping its count fails it. Passes on SQLite, PostgreSQL, MySQL and MariaDB. Remark from the pass: its first server run sent data to another witness's receiver (task 5's adversarial, port 4399), so that pass's counts may include it.

## Task 5 — Nothing personal in telemetry

Witnessed: 2026-10-14 23:15 EDT, by a fresh agent (blind). Commit: fea1a956. Machine: macOS 27.0.1 (arm64), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `privacy.db.test.ts` passes (SQLite) | no | confirmed | 4 of 4 runs |
| 2 | It passes on PostgreSQL, MySQL and MariaDB in CI | no | confirmed | Database run 38673349546: ✓ in all three |
| 3 | It drives each listed flow for real, with tracing and metrics on | no | partly | Real calls throughout; but the request spans had none of Next.js's attributes, and the released item was a rule, so the feed was empty (`ronne.feed.plugins` 0) |
| 4 | It inspects everything the collector received | no | confirmed | Every body stored; 16 values searched |
| 5 | It catches a planted leak in each category | no | confirmed | 10 mutations each fail it |
| 6 | It catches a leak through Next.js's request attributes (the sanitizer bypassed) | no | not met | Bypassing the sanitizer, or keeping every attribute, passes it; a real build then sends `http.target` naming the workspace, scope, item and an email. Plugin names on `ronne.feed.build` pass too (empty feed) |
| 7 | A collector that never answers leaves request times unchanged | no | confirmed | 4 of 4 runs; CI on Node 22 and 24 |
| 8 | The black-hole test catches an export that blocks a request | no | confirmed | Two mutations fail it |
| 9 | A real standalone server sends nothing personal | no | confirmed | 195 bodies, 1,528 spans: every needle absent |

**Overall:** not met: the test didn't exercise the sanitizer and its feed was empty; the shipped code leaked nothing. Fixed on `bugfix/101-witness-fixes`: the scenario's request spans carry Next.js's attributes (`http.target`, `url.full`, `url.path` with the workspace, scope and item names and an email, `http.client_ip`, `client.address`, the user agent); it releases skills, so the fresh feed holds 3 plugins (asserted); every searched value must be non-empty. Bypassing the sanitizer or putting plugin names on the span now fails it. Passes on SQLite, PostgreSQL, MySQL and MariaDB.

## Task 2 — The SDK, off by default (second re-check)

Witnessed: 2026-10-14 23:20 EDT, by a fresh agent (blind). Commit: fea1a956. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | No SDK module without an endpoint; the test catches an eager import | no | confirmed | 16 passed; two mutations fail it |
| 2 | A built standalone server with no endpoint never loads the SDK chunk | no | confirmed | `_compile` recorder: the chunk 0 times |
| 3 | `OTEL_SDK_DISABLED=true` keeps it off | no | confirmed | `true` and `" TRUE "`: 0 posts |
| 4 | An invalid endpoint: one warning, the server starts | no | confirmed | Four forms |
| 5 | A real request's trace reaches a receiver | no | confirmed | Protobuf traces with the configured header; JSON metrics |
| 6 | Each trace once, only the allowed resource keys | no | confirmed | 81/81 unique; resource as allowed on both signals |
| 7 | Settings from the file; environment wins; empty counts as unset | no | confirmed | As expected; all empty → off |
| 8 | Docker's `.env` reaches the container | no | confirmed | `docker compose config` |
| 9 | `telemetry.started` once, without the endpoint or headers | no | confirmed | One line |
| 10 | Collector down: `export_failed` once a minute | no | confirmed | 3 lines in 135 s |
| 11 | Down or never answering doesn't slow requests | no | confirmed | Medians 2.03 / 2.04 ms against 1.80 |
| 12 | Lockfile, licenses, audit | no | confirmed | All pass |
| 13 | `packages:check` passes; the packed server has the SDK | no | confirmed | 2,113 files; the chunk in `npm pack --dry-run` |
| 14 | The bundle and `release:smoke` | no | confirmed | CI run 38673349541 |
| 15–21 | #188's answers: need, license, health, advisories, install scripts, weight, chunk size | no | confirmed | `npm view`, osv.dev, lockfile-only installs, `npm pack` tarballs, `stat` |
| 22 | #188: "no new `node_modules` in the standalone output" | no | partly | `@opentelemetry/api` (45 files, 192 KiB) is new in the standalone output and the packed server; the allowlist passes because it's a pattern over `app/` |

**Overall:** not met: the weight answer's `node_modules` sentence, and #188's stale "not witnessed yet" lines. Fixed in #188's description and the plan's note (the new package and its size; why the allowlist passes).

## Task 5 — Nothing personal in telemetry (adversarial)

Witnessed: 2026-10-14 23:21 EDT, by a fresh agent (adversarial). Commit: fea1a956. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The privacy and telemetry tests pass | no | confirmed | 19 passed |
| 2 | One test drives the listed flows and checks everything received | no | confirmed | In-process flows under hand-made request spans |
| 3 | A real standalone server, default settings, hostile requests: nothing personal | no | confirmed | 133 bodies: only row 4's hits |
| 4 | No request header reaches the collector as sent | no | not met | A client's `tracestate: ronne=user-rootwit@example.com` exported as every span's `traceState` |
| 5 | Next.js's own attributes never name an item, scope or workspace | no | not met | With `NEXT_OTEL_VERBOSE=1` (Next.js's documented switch), the page-render span's `next.route` holds the filled-in path, private workspaces included |
| 6 | The whole e2e suite with telemetry on, default settings: nothing personal | no | confirmed | 470 bodies against 969 database values: false positives only |
| 7 | Better Auth's spans and errors carry nothing personal | no | confirmed | Operation, hook, context, collection; no status messages |
| 8 | Database spans: placeholders, never values | no | confirmed | Only constant literals; PostgreSQL and MySQL compiled offline parameterized |
| 9 | Events, status messages, links, span names | no | confirmed | Exception types only, no messages, no links, route patterns |
| 10 | Metric attributes only the listed ones | no | confirmed | e2e and standalone dumps |
| 11 | The resource carries nothing beyond the service | no | confirmed | `service.name`, `service.version` |
| 12 | Log lines add only `traceId`/`spanId` | no | confirmed | `server.log` |
| 13 | The default protocol (protobuf) is sanitized | no | confirmed | 0 hits in raw bodies |
| 14 | The sanitizer drops what could be personal | no | partly | Kept: URLs in `next.span_name` and `resource.name` (fetch spans, reachable once the server fetches), IPs under other keys, header and `user.*` attributes, event names, free-text `exception.type`, link attributes, trace state |
| 15 | A collector that doesn't answer leaves request times unchanged | no | confirmed | Real server: 5.0 against 4.2 ms medians |
| 16 | The tests would catch what's found here | no | partly | With the attribute filter removed, the privacy test still passed; neither test runs Next.js or sends `tracestate` |

**Overall:** not met: a client's `tracestate` exported verbatim; `NEXT_OTEL_VERBOSE` exposing filled-in paths; the sanitizer's gaps. Fixed on `bugfix/101-witness-fixes`: no span keeps a trace state; `NEXT_OTEL_VERBOSE` is turned off at start with `telemetry.verbose_off` (owner, 2026-10-14), and the page-render span's `next.route` is dropped; a URL in any value or name keeps its origin; IP values, header and `user.*` keys, link attributes and free-text exception types are dropped; event names sanitized; the fetch instrumentation off. The privacy scenario's requests inherit a client's `tracestate` holding an email; keeping the trace state, removing the attribute filter, or leaving verbose spans on each fails a test. A real standalone server with a client `tracestate` and `NEXT_OTEL_VERBOSE=1`: 78 spans, no trace state, no names or email. The Logs table and Monitoring section (ronne-web) gain `telemetry.verbose_off`.

## Task 6 — Documentation (second re-check)

Witnessed: 2026-10-14 23:42 EDT, by a fresh agent (blind). Commit: b9533928 (ronne-web cf48001). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `operations#monitoring` is in both `topics.ts` | no | confirmed | ronne-web `topics.ts:74`; marketplace `help/topics.ts:163` |
| 2 | Health: 200 with `checks`; 503 `setup_required`, `database_unavailable`, `storage_unavailable` with `details.checks`; no version, path or timing; the reason in `db.unavailable` / `storage.unavailable` | no | confirmed | `health.ts:52-90` |
| 3 | `database_unavailable` when the database doesn't answer within 3 seconds | no | confirmed | `health.ts:11-13,53-70`, `Dockerfile:69`. Remark: a slow setup state and a slow query could leave storage almost no time |
| 4 | Off without an endpoint; OpenTelemetry loaded only with one | no | confirmed | `instrumentation.ts:7-11`, `index.ts:25-28`; 26 tests passed |
| 5 | Settings file or environment; Docker's `.env` | no | confirmed | `config.ts:43,54-61`; `docker compose -f compose.yaml config` |
| 6 | The variables, protocols, interval, `OTEL_SDK_DISABLED`, default service name | no | confirmed | `settings.ts:58-90`, `start.ts:48,59`, `@vercel/otel` dist |
| 7 | `NEXT_OTEL_VERBOSE` turned off, `telemetry.verbose_off` | no | confirmed | `index.ts:36-39`; Next reads it per span; the start test passed |
| 8 | A collector that's down never slows a request; one `export_failed` a minute | no | confirmed | `failures.ts:9-21`; black-hole, failures and start tests passed |
| 9 | The metrics table | no | confirmed | `real-hooks.ts:23-35,96-148` |
| 10 | The spans | no | confirmed | `real-hooks.ts:55-94`, `publish.ts:627`, `bulk-release.ts:61`, `plugin-feed.ts:403`, `drafts-api.ts:241`, `api-route.ts:24`, `proxy.ts:23` |
| 11 | What's never sent | no | confirmed | `sanitize.ts`; sanitize tests passed. Remark: trace state isn't named |
| 12 | The resource | no | confirmed | `sanitize.ts:133-150`. Remark: `telemetry.sdk.*` is sent and not listed |
| 13 | Logs and traces joined | no | confirmed | `logger.ts:171,216`; `traceId` in each language |
| 14 | The Logs events table is `events.ts` | no | confirmed | 27 events, same order, names, levels and fields in en, pt, fr |
| 15 | The collector example; its run in the notes | yes | confirmed | The three parse to the same object; PLAN.md notes contrib 0.162.0 |
| 16 | en, pt and fr say the same, in the site's terms | no | confirmed | Read all three |
| 17 | `.env.example` has the `OTEL_*` variables | no | confirmed | `.env.example:33-41` |
| 18 | `install.md` has the row | no | confirmed | `install.md:116` |
| 19 | The render tests pass in both repositories | yes | confirmed | ronne-web 138 passed, typecheck 0; marketplace help 3 passed |

**Overall:** met. On `bugfix/101-close`: the health deadline gives the database its first 3 seconds and storage at least the last one; Monitoring names the ignored trace context and `telemetry.sdk.*` (ronne-web `docs/101-close`).

## Task 4 — Metrics (second re-check)

Witnessed: 2026-10-14 23:43 EDT, by a fresh agent (blind). Commit: b9533928. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Each of the 10 instruments with exactly its attributes, no other | no | confirmed | `metrics.test.ts` passed; 8 mutants each fail it |
| 2 | Kinds and units match the table | no | confirmed | Own receiver: histograms in `s`, monotonic sums, a 1/0 gauge. Remark: no test checks units |
| 3 | Real sign-ins count once, with the right outcome | no | confirmed | failure 4, success 2, rate_limited 1 |
| 4 | Token exchanges count once; a CLI failure isn't a sign-in failure | no | confirmed | failure 4, success 1, rate_limited 1; sign-ins unchanged |
| 5 | Releases count versions; a bulk release isn't counted twice | no | confirmed | 3 from a single and a bulk of 2 |
| 6 | Feed builds once each; cache hits `cached=true`, not timed | no | confirmed | 1 fresh, 2 cached, 1 duration. Remark: no test pins "not timed" |
| 7 | Uploads accepted or refused; 429 and 401 aren't refusals | no | confirmed | accepted 1, refused 1 |
| 8 | Rate limits carry the four `limit` values | no | confirmed | each once |
| 9 | Request duration from the API wrapper, route patterns only | no | confirmed | 29 `apiRoute(` literals. Remark: whole milliseconds |
| 10 | Query duration: one point per query | no | confirmed | 700 recordings, SQL verbs only |
| 11 | `ronne.health` on every health path | no | confirmed | ok, storage failing, query failing, setup state failing, hung database. Remark: storage keeps its last value when the database fails |
| 12 | A test fails when any health recording is removed | no | confirmed | Each of 5 removed → 1 failed |
| 13 | No personal or unbounded attribute | no | confirmed | 55 bodies, 0 hits |
| 14 | Off costs a function call | no | confirmed | No modules resolved; ≈5 ns per call |
| 15 | No regressions | no | confirmed | 144 tests passed |

**Overall:** met. On `bugfix/101-close`: the metrics test checks each instrument's kind and unit, and that a cache hit isn't timed (each mutant fails it).

## Task 1 — Health checks storage (re-check)

Witnessed: 2026-10-14 23:50 EDT, by a fresh agent (blind). Commit: b9533928. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `StorageAdapter` declares `check()` | no | confirmed | `storage-adapter.ts:15-19` |
| 2 | Every adapter has `check()` | no | confirmed | local, `instanceStorage`, `tracedStorage`; `tsc` 0 |
| 3 | The local `check()` writes nothing | no | confirmed | Probe: 0 entries; a missing folder not created |
| 4 | A folder not made yet passes when its nearest parent can take it | no | confirmed | Probe; mutant M5 fails a test |
| 5 | Read-only, under a read-only parent, a file, an executable file, under a file, without `x`: fail | no | confirmed | Probe; M3, M4, M6 fail tests |
| 6 | Order: setup state, database, storage | no | confirmed | `health.ts:50-69`; M11 → 7 fail |
| 7 | 200 body exactly, `no-store` | no | confirmed | M8 fails |
| 8 | 503 `storage_unavailable` | no | confirmed | M13 → 4 fail |
| 9 | `setup_required`, `database_unavailable` unchanged | no | confirmed | 4 tests; no diff in Dockerfile, e2e, scripts, server, workflows |
| 10 | A hung storage answers by about 4 s | no | confirmed | 4,013 ms; M1, M12 fail |
| 11 | A database that never answers → within 3 s | no | confirmed | 3,002 ms |
| 12 | Nothing past Docker's 5 s | no | confirmed | Worst 4,004 ms |
| 13 | The setup state is bounded | no | confirmed | Twice (`state.ts` has its own 3 s) |
| 14 | `storage.unavailable`, path hidden | no | confirmed | M7 fails |
| 15 | The test covers read-only and missing folders | no | confirmed | 13/13. Survivors: M9, M10, M14 |
| 16 | Database tests pass on the servers | no | confirmed | Run 38676978957; main 38677516781 |
| 17 | The e2e tests pass unchanged | no | confirmed | 72 and 72, on f9f1bd2c and b9533928 |
| 18 | The Dockerfile's health check passes unchanged | no | confirmed | Image run 38677516771, amd64 and arm64 |
| 19 | The server checks pass on this code | no | can't check here | They didn't run on #190 (no server files) or on main's push; last passed on fea1a956, before #190's `health.ts` |

**Overall:** not met: only the server checks are left, for the nightly run (owner: wait, 2026-10-15). On `bugfix/101-close`, the survivors each fail a test now: the check's own 3 s (M9: a ready setup state, then a hung query), one deadline (M10: a 2 s setup state, then hung storage), and `X_OK` (M14: a folder without `x`); and the database's 3 seconds are shared, the setup state and its check together, so storage keeps at least a second.

## Task 5 — Nothing personal in telemetry (re-check)

Witnessed: 2026-10-14 23:57 EDT, by a fresh agent (blind). Commit: b9533928. Machine: macOS 27.0.1 (arm64), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The privacy and black-hole tests pass | no | confirmed | 23 passed; 4 more runs |
| 2 | On PostgreSQL, MySQL and MariaDB in CI | no | confirmed | Run 38676978957 |
| 3 | It drives each flow for real | no | confirmed | 17 bodies, 814 spans; `ronne.items` [1, 2]; cached [false, true]; 3 plugins |
| 4 | Next.js's attributes and a client `tracestate` | no | confirmed | `privacy-scenario.ts:55-79` |
| 5 | It inspects everything received | no | confirmed | 18 non-empty values absent from 890 KB |
| 6 | It catches a planted leak per category | no | confirmed | 19 of 20 mutations fail; the fetch instrumentation on passed (no leak) |
| 7 | The sanitizer bypassed | no | confirmed | Privacy test fails |
| 8 | Its attribute filter removed | no | confirmed | 6 tests fail |
| 9 | The trace state kept | no | confirmed | Privacy and sanitize tests fail |
| 10 | Verbose spans left on | no | confirmed | Start and sanitize tests fail |
| 11 | A collector that doesn't answer leaves request times unchanged | no | confirmed | Black-hole test; real server 1.26 against 1.38 ms |
| 12 | A real standalone server sends nothing personal | no | confirmed | 315 bodies, 0 hits |
| 13 | `NEXT_OTEL_VERBOSE` turned off | no | confirmed | `telemetry.verbose_off`; no render spans |
| 14 | What leaves, sanitized | no | confirmed | `sanitize.ts:96-121`, `start.ts:56`; fetch spans keep the origin |

**Overall:** met. On `bugfix/101-close`: a test pins the fetch instrumentation off, and the spec says Next.js still traces a page fetching its own origin.

## Task 2 — The SDK, off by default (third re-check)

Witnessed: 2026-10-15 00:00 EDT, by a fresh agent (blind). Commit: b9533928. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Next.js documents both; `@vercel/otel` lighter | no | confirmed | 21 against 71 packages; 33.4 against 49.4 MiB |
| 2 | Current stable, allowed licenses, no install scripts | no | confirmed | `npm view`; lockfile |
| 3 | Off imports nothing; the test catches an eager import | no | confirmed | Mutants fail |
| 4 | A standalone server with no endpoint never loads the SDK | no | confirmed | Chunk compiled 0 times |
| 5 | `OTEL_SDK_DISABLED` | no | confirmed | 0 posts |
| 6 | An invalid endpoint: one warning, off, starts | no | confirmed | 5 forms |
| 7 | A real request's trace arrives | no | confirmed | JSON and protobuf |
| 8 | Each span once | no | confirmed | 151 unique |
| 9 | The resource, allowed keys only | no | confirmed | Both signals |
| 10 | Settings from the file; environment wins; empty unset | no | confirmed | Endpoint, headers, protocol, resource, interval from `RONNE_ENV_FILE`; `OTEL_SERVICE_NAME=from-env` beat the file; all empty → off |
| 11 | Docker's `.env` | no | confirmed | `docker compose config` |
| 12 | `telemetry.started` once, no endpoint or headers | no | confirmed | Exactly one `telemetry.started` line; neither the endpoint nor the header value in stdout |
| 13 | `telemetry.verbose_off` | no | confirmed | Standalone with `NEXT_OTEL_VERBOSE=1`: one warn line, then `telemetry.started` |
| 14 | `export_failed` once a minute | no | confirmed | Closed port, 125 s: lines at 03:49:40, 03:50:41, 03:51:42 |
| 15 | Requests not slowed | no | confirmed | 300 requests each: off 1.70 ms, down 1.89, hang 1.86 (medians) |
| 16 | Lockfile, licenses, audit | no | confirmed | 321 allowed, no vulnerabilities |
| 17 | Standalone and packed server include the SDK; `packages:check` | no | confirmed | 2113 files allowed |
| 18 | `release:smoke` and the bundles | no | confirmed | Main run 38677516802; bundles on #188 |
| 19–24 | #188's six answers | no | confirmed | Need, licenses, health, advisories, install scripts, weight |
| 25 | Plan note: "352 KB with task 2" | no | partly | a56f21b9 builds 357,088 bytes |

**Overall:** not met: only the plan note's size. On `bugfix/101-close` it says 357,088 bytes.

## Task 5 — Nothing personal in telemetry (adversarial re-check)

Witnessed: 2026-10-15 00:00 EDT, by a fresh agent (adversarial). Commit: b9533928. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The tests pass | no | confirmed | `npx vitest run src/server/telemetry src/proxy.test.ts` → 30 passed; `--project db` privacy → 1 passed |
| 2 | On the servers | no | confirmed | `gh run view 38677516781`: postgres, mysql, mariadb ✓ |
| 3 | A real server through every flow, private workspace, hostile headers | no | confirmed | 180 bodies, 6,937 spans, 46 values absent |
| 4 | Protobuf too | no | confirmed | 16 protobuf bodies: 0 of `hush`, `zelda`, `198.51`, `HushAgent`, `example` |
| 5 | A client's trace context never reaches the collector as sent | no | confirmed | 0 trace states; the client's trace id kept as the parent |
| 6 | `NEXT_OTEL_VERBOSE` off | no | confirmed | Started with `NEXT_OTEL_VERBOSE=1` → `telemetry.verbose_off`; no `BaseServer.renderToResponse` span |
| 7 | Route patterns only, hostile paths too | no | confirmed | 93 `next.span_name`, 35 `http.route`, 33 `next.route`, 41 `resource.name`: patterns only; 11 hostile paths, 0 hits |
| 8 | Better Auth's spans | no | confirmed | `better_auth.*` and `db.collection.name` keys; `exception.type` `APIError` only |
| 9 | Placeholders only | no | confirmed | 100 distinct `db.query.text`: no quoted literal |
| 10 | Errors send their type only | no | confirmed | Storage swapped for a file: 0 of `ENOTDIR`, the path, `hush`; `exception.type` only |
| 11 | Events, links, status, resource | no | confirmed | Links 0; status messages 0; resource `service.name`, `service.version` |
| 12 | Metrics' attributes | no | confirmed | 10 instruments, exactly the spec's attributes; `tool` only the served tools |
| 13 | The sanitizer for every value, name and key | no | partly | Kept: `HTTPS://`, `ws://`, `file://`, `//host` URLs; addresses with a port, in a list, after `for=`; paths in names and values; keys never checked; `url.domain`, `url.scheme` |
| 14 | The tests would catch what's found | no | partly | 16 of 17 mutations fail; the fetch instrumentation on passed |
| 15 | A collector that never answers (real server) | no | confirmed | 150 requests × 4 routes: receiver, black hole and off medians within 0.2 ms |
| 16 | The black-hole test checks it | no | confirmed | `blackhole.test.ts` passes: median within 5 ms of off, maximum under 1 s |

**Overall:** not met: nothing personal from real traffic; the sanitizer's gaps and the unpinned fetch instrumentation. On `bugfix/101-close`: a URL of any scheme or case, or `//host`, keeps its origin; any value holding an address is dropped (in a name, `[address]`); a path in a value or name is cut at its first segment that isn't the app's (static segments checked against `app/` by a test, Better Auth's, Next.js's, patterns and groups); keys that aren't dotted names and every `url.*` are dropped; a test pins the fetch instrumentation off; the spec says Next.js still traces a page fetching its own origin. Each rule's mutant fails a test. A real standalone server: no span name cut on ordinary pages, nothing personal.

## Task 3 — Spans (second re-check)

Witnessed: 2026-10-15 00:04 EDT, by a fresh agent (blind). Commit: b9533928. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Off: nothing from OpenTelemetry | no | confirmed | Only Better Auth's semantic-conventions constants |
| 2 | Off: no query hook, no storage wrapper | no | confirmed | Same probe → `telemetryOn() false`, `queryLog` undefined, `tracedStorage(ls) === ls` |
| 3 | One span per query, placeholders only | no | confirmed | 1,848 spans. Remark: Kysely's `log` option, not a plugin |
| 4 | Storage spans: bytes, never the key | no | confirmed | One lost its bytes (row 6's bug) |
| 5 | The domain spans under their requests (real server) | no | confirmed | Single under `POST /submissions/[id]`, bulk under `POST /submissions`, builds and uploads under their API routes |
| 6 | Their attributes (real server) | no | partly | With a page and a fresh feed build under one client `traceparent`, the build lost `ronne.feed.cached`/`plugins` (2/2) |
| 7 | `ronne.request_id` | no | confirmed | 17/17, 213/213 |
| 8 | Log lines' IDs | no | confirmed | 32/32 |
| 9–12 | Tests catch detached spans, dropped attributes and IDs, added keys | no | confirmed | Each mutant fails |
| 13 | Sanitized (real server) | no | confirmed | 4,318 spans, 0 hits. Remark: Next.js's `AppRender.fetch` to its own origin |
| 14 | Each span once | no | confirmed | 4,318 of 4,318 unique; `spanProcessors: ["auto", …]` mutant fails the start and privacy tests |
| 15 | Better Auth's spans | no | confirmed | `better_auth.context`, `.hook.type`, `.operation_id`, `db.collection.name`; 310 `db find…` spans parented |
| 16 | The suites pass | no | confirmed | 30 passed |

**Overall:** not met: `@vercel/otel` takes a trace's first span as its root and ends the trace's open spans when it ends, so requests sharing a client's trace cut each other's spans short. On `bugfix/101-close`: a client's trace context isn't taken (`propagators: []`, whatever `OTEL_PROPAGATORS` says), so each request is its own trace; a test sending two requests under one `traceparent` failed before (`ronne.feed.plugins` lost) and passes now. A real standalone server, a page and a fresh feed build under one `traceparent`, three rounds: every build kept its attributes, the client's trace id appeared nowhere. The spec says Kysely's `log` option.
