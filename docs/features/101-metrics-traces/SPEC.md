# 101 — Metrics, traces and health

> Milestone: M14 · Depends on: 100 · Design: [MVP §14.4](../../MVP/MVP.md#144-other-future-topics), [§15](../../MVP/MVP.md#15-decision-log) (Operations) · Contracts: none changed

## Goal

A company that already watches its services with OpenTelemetry sees Ronne there too: how many
requests and how slow, time spent in the database, sign-ins, releases and feed builds, and a trace
per request (owner, 2026-10-06). Nothing is sent, and no OpenTelemetry code is loaded, unless the
instance is pointed at a collector. The health endpoint, which the image, the services and the
install scripts already wait on, also says whether storage works.

## Scope

**In:**
- **OpenTelemetry, off by default:** on only when `OTEL_EXPORTER_OTLP_ENDPOINT` (or a
  signal-specific `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` / `…_METRICS_ENDPOINT`) is set. Then traces
  and metrics go over OTLP/HTTP to that collector, configured with OpenTelemetry's standard
  `OTEL_*` variables.
- **Traces:** each HTTP request (Next.js's own spans, which it emits when a tracer is registered),
  each database query, storage reads and writes, and spans for release and feed builds.
- **Metrics:** the instruments below, with low-cardinality attributes only.
- **Logs and traces joined:** with tracing on, 100's lines carry `traceId` and `spanId`.
- **The health endpoint** (`GET /api/health`) checks storage as well as the database, and says
  which failed.

**Out** (and where it goes instead):
- **A Prometheus `/metrics` endpoint.** The OpenTelemetry Collector exposes one from OTLP; the
  Documentation shows the collector config. Keeping one path means one thing to secure.
- **Sending logs over OTLP.** Logs stay on stdout (100); collectors read them from there.
- **Dashboards and alerts.** The Documentation suggests a few alerts; building dashboards is the
  operator's.
- **Usage telemetry about items** (046, 047): that's for moderators, inside Ronne; this is for
  whoever runs the server.
- **Anything sent to the Ronne project.** Nothing goes anywhere but the operator's own collector.

## Behaviour

### Turning it on

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_SERVICE_NAME=ronne-marketplace        # optional; this is the default
OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer%20…   # optional, the collector's
```

Set in the environment or the settings file, like `LOG_LEVEL`. On start, `instrumentation.ts`'s
`register()` checks for an endpoint: without one it returns at once, and the OpenTelemetry SDK
packages are never imported (a test proves it). With one, it starts the Node SDK with the OTLP/HTTP
trace and metric exporters, the resource (`service.name`, `service.version`,
`deployment.environment` from `OTEL_RESOURCE_ATTRIBUTES` if set), and logs one line,
`telemetry.started` (100), without the endpoint's value (an environment value, never logged).
`OTEL_SDK_DISABLED=true` turns it off even with an endpoint. The SDK's other standard variables
(sampler, export interval, timeouts) work as OpenTelemetry documents them.

**Packages:** `@vercel/otel` (MIT) with its OpenTelemetry peers (`@opentelemetry/api`, `api-logs`,
`instrumentation`, `resources`, `sdk-logs`, `sdk-metrics`, `sdk-trace-base`) and
`@opentelemetry/exporter-metrics-otlp-http` (Apache-2.0): the lighter of the two ways Next.js 16's
guide documents (the plan's notes have the comparison). Traces go through `@vercel/otel`'s OTLP/HTTP
exporter (`http/protobuf`, or `http/json` with `OTEL_EXPORTER_OTLP_PROTOCOL`), metrics through
OpenTelemetry's. Turbopack bundles them into one server chunk, loaded only when telemetry is on.

**Events (100):** `telemetry.started` (info: `traces`, `metrics`, booleans),
`telemetry.endpoint_invalid` (warn), `telemetry.failed` (error, `err`: the SDK couldn't start; the
server starts without it), `telemetry.export_failed` (warn, `signal`, at most once a minute).

### Traces

- **Requests:** Next.js's spans (the route, the render, the fetches). The request ID (100) is an
  attribute, `ronne.request_id`, so a log line leads to its trace.
- **Database:** one span per query, from a Kysely plugin added in `create-db.ts` when tracing is
  on: `db.system.name` (`sqlite`, `postgresql`, `mysql`), `db.operation.name`, and the SQL text with
  its placeholders (`db.query.text`). **Never the parameters:** they hold names, emails and hashes.
- **Storage:** `storage.put` / `storage.get` spans with the byte count, not the key (keys hold item
  names).
- **Domain spans:** `ronne.release` (with the number of items), `ronne.feed.build` (tool, plugin
  count, from cache or not), `ronne.draft.upload`.

### Metrics

| Instrument | Kind | Attributes |
|---|---|---|
| `http.server.request.duration` | histogram, seconds | `http.request.method`, `http.route` (the pattern), `http.response.status_code` |
| `ronne.db.query.duration` | histogram, seconds | `db.system.name`, `db.operation.name` |
| `ronne.sign_ins` | counter | `outcome` (`success`, `failure`, `rate_limited`) |
| `ronne.tokens.exchanged` | counter | `outcome` |
| `ronne.releases` | counter (versions released) | — |
| `ronne.feed.builds` | counter | `tool`, `cached` |
| `ronne.feed.build.duration` | histogram, seconds | `tool` |
| `ronne.drafts.uploaded` | counter | `outcome` |
| `ronne.rate_limited` | counter | `limit` (`sign_in`, `upload`, `usage`, `token_exchange`) |
| `ronne.health` | gauge, 1 or 0 | `check` (`database`, `storage`) |

**Low cardinality, nothing personal:** no user ids, emails, IP addresses, item, scope or workspace
names, or tokens in any attribute, metric or span. The collector may be a third party's.
`http.server.request.duration` comes from 100's API wrapper (route patterns only); pages are
counted by Next.js's own spans.

### The health endpoint

`GET /api/health` keeps its statuses, which the Dockerfile's `HEALTHCHECK`, the services, the
install scripts and the end-to-end tests rely on: 200 when the instance can serve, 503 otherwise.
What changes:
- **Storage is checked** after the database: the storage adapter gets a `check()` method; the local
  adapter checks the storage folder is a folder it can write to (an access check, no file
  written). A folder that doesn't exist yet counts when its nearest existing parent can take it:
  the first artifact stored creates it, as it always has (a `STORAGE_PATH` nothing has made yet).
  110's S3 adapter will check its bucket the same way.
- **The body says which:**

  ```json
  {"status":"ok","checks":{"database":"ok","storage":"ok"}}
  {"error":{"code":"storage_unavailable","message":"Storage isn't writable.","details":{"checks":{"database":"ok","storage":"failed"}}}}
  ```

  A failure keeps the API's one error shape (MVP §11), as `setup_required` and
  `database_unavailable` do today.

  `setup_required` and `database_unavailable` stay as they are (storage isn't checked before the
  database answers). No version, no paths, no timings: the endpoint is public, and shouldn't help
  an attacker fingerprint the instance.
- Each check has a 3-second limit, as the database's has today; the two together stay under the
  Dockerfile's health-check timeout.
- A failed storage check writes `storage.unavailable` (error, with `err`; 100), as a failed
  database writes `db.unavailable`: the reason is in the log, never in the public answer.
- When OpenTelemetry is on, each health check also sets `ronne.health`.

## Edge cases

- **The collector is down or slow:** exports retry in the background with the SDK's limits and are
  then dropped; requests never wait on them. One `telemetry.export_failed` warning per minute at
  most (100), not one per batch.
- **An invalid endpoint** (not a URL): one `warn` line at start, telemetry stays off, the server
  starts.
- **The standalone build:** the SDK packages are traced into the standalone output (or listed in
  `serverExternalPackages`) so `rmk-server`, the bundles and the image have them; the packages
  check (`packages:check`) allowlist grows with them, and the bundle size change is noted.
- **Off means off:** no SDK import, no Kysely plugin, no extra work per query; the per-request cost
  of the off state is a check of one boolean.
- **The storage folder made read-only** (a full or remounted disk): health answers 503
  `storage_unavailable`, so Docker marks the container unhealthy and the service checks say so.
- **The health check under load:** it reads nothing big; the storage check is an access call.
- **Spans from Better Auth** (it depends on `@opentelemetry/api` optionally): they appear when
  tracing is on, nested under the request, and follow the same no-personal-data rule (checked in
  task 3; attributes Ronne can't control are dropped by a span processor if they carry emails).

## Documentation

- **Running Ronne** (`operations`), new section **Monitoring** (`operations#monitoring`): the
  health endpoint (what 200 and 503 mean, the `checks`), turning OpenTelemetry on (the variables,
  an OpenTelemetry Collector example that also exposes Prometheus metrics), the metrics table and
  the spans, what's never sent, suggested alerts (health failing, 5xx rate, sign-in failures,
  slow queries), and joining logs to traces.
- **Running Ronne → Logs** (`operations#logs`): `traceId` and `spanId` when tracing is on.
- **`apps/web/.env.example`:** the `OTEL_*` variables, commented.
- **Helpers:** none; nothing changes in the web app's pages.

## Acceptance criteria

- [ ] With no endpoint set, no OpenTelemetry SDK module is loaded, no Kysely plugin is added, and
      nothing is sent (tested).
- [ ] With an endpoint, a test collector receives a trace per request with the database and storage
      spans under it, and the metrics in the table with only the listed attributes.
- [ ] No span, attribute or metric contains a query parameter, a user id, an email, an IP address, a
      token, or an item, scope or workspace name (a test inspects everything the test collector
      received).
- [ ] Log lines carry `traceId` and `spanId` when tracing is on.
- [ ] `GET /api/health` answers 503 `storage_unavailable` when storage isn't writable, reports
      `checks`, and keeps every existing status and code; the Dockerfile's health check, the
      server checks and the e2e tests still pass.
- [ ] A collector that's down never slows a request or stops the server.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Open questions

- None.
