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
