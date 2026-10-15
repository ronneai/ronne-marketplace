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
