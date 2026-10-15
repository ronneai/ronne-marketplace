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
OpenTelemetry's, always as JSON. Turbopack bundles them into one server chunk, loaded only when telemetry is on.

**Events (100):** `telemetry.started` (info: `traces`, `metrics`, booleans),
`telemetry.endpoint_invalid` (warn), `telemetry.failed` (error, `err`: the SDK couldn't start; the
server starts without it), `telemetry.verbose_off` (warn: `NEXT_OTEL_VERBOSE` turned off),
`telemetry.export_failed` (warn, `signal`, at most once a minute).

### Traces

- **Requests:** Next.js's spans (the route, the render, the fetches). The request ID (100) is an
  attribute, `ronne.request_id`, on the API route's and the proxy's spans; with tracing on, every
  log line written inside a span carries its `traceId` and `spanId`, so a line leads to its trace.
- **What leaves, sanitized:** every span passes one sanitizing step before export. Only listed
  attribute keys are sent (`SENT_KEYS` in `telemetry/sanitize.ts`): Ronne's own, and those Next.js,
  Better Auth and `@vercel/otel` set that hold no path, address or name of their own; any other key
  is dropped, so `http.target`, `http.url`, `url.*`, a client's address, a user agent, headers,
  `user.*`, and a key a library starts sending tomorrow never leave (a key worth having is added to
  the list). The values of listed keys still pass these rules: any value the logger would change (an
  email, a token, a URL's password, a stored path) is dropped, and so is any value holding an IP
  address (alone, with a port, in a list, after `for=`, beside a sentence's dot). A URL in any value
  or name, whatever its scheme or case (`HTTPS://`, `ws://`, `file://`, `//host`), keeps its origin
  only, without a user name or password. A path in any value or name, wherever it starts (after a
  space, a colon or a dot, with any first character), keeps its segments while they're the app's
  (its static segments, dynamic segments and route groups, checked against `app/` by a test; Better
  Auth's endpoints; Next.js's own) and is cut to `…` from the first other one
  (`/workspaces/hushvault/x` → `/workspaces/…`), losing its query and fragment; a query without a
  path (`?q=…`) is dropped too. A workspace, scope or item named like a route segment is the limit.
  An address in a name becomes `[address]`. An exception event keeps its type only, when it's a
  class name; a status, its code only; a link, its context only; and no span keeps a trace state.
  Next.js's page-render span's `next.route` (the filled-in path) is dropped, and `@vercel/otel`'s
  fetch instrumentation is off (pinned by a test). Next.js still traces a page fetching its own
  origin (a server action's redirect): those spans keep the origin only.
- **A client's trace context isn't taken:** `traceparent`, `tracestate` and `baggage` are ignored,
  whatever `OTEL_PROPAGATORS` says, so each request is its own trace and nothing joins a caller's.
  A public client's context is its own input, and `@vercel/otel` ends a trace's open spans when its
  first span ends: requests sharing a client's trace would cut each other's spans short, their late
  attributes lost (task 3's witness, 2026-10-15).
- **`NEXT_OTEL_VERBOSE`**, Next.js's switch for more spans, puts filled-in paths with private names
  in its spans: telemetry turns it off at start and writes `telemetry.verbose_off` (owner,
  2026-10-14). `@vercel/otel`'s own processors aren't used:
  its default adds a second exporter, unsanitized, whenever an endpoint is set.
- **Database:** one span per query, from Kysely's `log` option, set in `create-db.ts` when tracing
  is on: `db.system.name` (`sqlite`, `postgresql`, `mysql`), `db.operation.name`, and the SQL text with
  its placeholders (`db.query.text`). **Never the parameters:** they hold names, emails and hashes.
- **Storage:** `storage.put` / `storage.get` spans with the byte count (`ronne.storage.bytes`), not
  the key (keys hold item names).
- **Domain spans:** `ronne.release` (`ronne.items`, the versions released), `ronne.feed.build`
  (`ronne.tool`, `ronne.feed.plugins`, `ronne.feed.cached`), `ronne.draft.upload`.

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
| `ronne.drafts.uploaded` | counter | `outcome` (`accepted`, `refused`) |
| `ronne.rate_limited` | counter | `limit` (`sign_in`, `upload`, `usage`, `token_exchange`) |
| `ronne.health` | gauge, 1 or 0 | `check` (`database`, `storage`) |

The counters and the request histogram come from the events the server already logs (100), at any
`LOG_LEVEL`: one place maps each event to its instrument, so a count and its log line always agree.
`ronne.tokens.exchanged`'s `outcome` is `success`, `failure` or `rate_limited`;
`ronne.feed.build.duration` records builds, not cache hits.

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
  A link to nothing on the way (a volume that isn't mounted) fails: a put couldn't go through it.
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
- One 4-second deadline for the whole check, under the Dockerfile's 5-second health-check timeout:
  the database has its first 3 seconds, the setup state and its check together (a setup state that
  doesn't come in time is a database that isn't answering), and storage has until the end, at
  least a second, so a slow database is never reported as storage failing.
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
- **Off means off:** no SDK import, no Kysely `log` option, no extra work per query; the per-request cost
  of the off state is a check of one boolean.
- **The storage folder made read-only** (a full or remounted disk): health answers 503
  `storage_unavailable`, so Docker marks the container unhealthy and the service checks say so.
- **The health check under load:** it reads nothing big; the storage check is an access call.
- **Spans from Better Auth** (it depends on `@opentelemetry/api` optionally): they appear when
  tracing is on, nested under the request, and follow the same no-personal-data rule (checked in
  task 3; attributes Ronne can't control are dropped by a span processor if they carry emails).

## Documentation

- **Running Ronne** (`operations`), new section **Monitoring** (`operations#monitoring`): the health
  endpoint (what 200 and 503 mean, the `checks`), turning OpenTelemetry on (the variables, an
  OpenTelemetry Collector example that also exposes Prometheus metrics), the metrics table and the
  spans, what's never sent (a client's trace context isn't taken; spans carry only the listed
  attributes), suggested alerts (health failing, 5xx rate, sign-in failures, slow queries), and
  joining logs to traces.
- **Running Ronne → Logs** (`operations#logs`): `traceId` and `spanId` when tracing is on.
- **`apps/web/.env.example`:** the `OTEL_*` variables, commented.
- **Helpers:** none; nothing changes in the web app's pages.

## Acceptance criteria

- [ ] With no endpoint set, no OpenTelemetry SDK module is loaded, no Kysely `log` option is set, and
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
