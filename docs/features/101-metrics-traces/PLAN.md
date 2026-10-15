# 101 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Health checks storage.** `check()` on the `StorageAdapter` interface and the local
  adapter (the folder, or while it isn't made yet its nearest existing parent, writable; a link to
  nothing fails; no file written); `/api/health` checks the database then storage within one 4 s
  deadline (the database its first 3 s), answers `storage_unavailable` with `details.checks`, and
  adds `checks` to the 200 body. Existing statuses and codes unchanged.
  *Done when:* `health.db.test.ts` covers a read-only and a missing storage folder; the Dockerfile's
  health check, the server checks and the e2e tests pass unchanged.

- [x] **2. The SDK, off by default.** Check Next.js 16's OpenTelemetry guide and the current SDK
  versions; choose `@opentelemetry/sdk-node` or `@vercel/otel` (the lighter that works in the
  standalone build), answering the dependency policy's six questions in the pull request.
  `register()` in `instrumentation.ts` imports nothing without an endpoint; with one, starts the
  SDK (OTLP/HTTP traces and metrics, the resource, `OTEL_SDK_DISABLED`), logs `telemetry.started`,
  and rate-limits `telemetry.export_failed`. The standalone output, `packages:check` and the bundle
  include the packages.
  *Done when:* a test shows no SDK module loaded without an endpoint; with an endpoint and a test
  collector (an in-process OTLP/HTTP receiver), a request's trace arrives; an invalid endpoint
  warns and starts; `pnpm licenses:check`, `pnpm install --frozen-lockfile` and `packages:check`
  pass.

- [x] **3. Spans.** The database spans from Kysely's `log` option (added only when tracing is on:
  system, operation, SQL with placeholders, never parameters), storage spans (bytes, no key),
  `ronne.release`, `ronne.feed.build`, `ronne.draft.upload`, `ronne.request_id` on the request span;
  100's logger adds `traceId` and `spanId`; a span processor drops attributes that look like emails
  (Better Auth's spans).
  *Done when:* tests against the test collector see each span under its request, and the log lines
  carry the trace's IDs.

- [x] **4. Metrics.** The spec's instruments, recorded in 100's API wrapper, the database plugin,
  the identity, submissions, feeds and usage services, and the health check.
  *Done when:* tests see each instrument with exactly the listed attributes.

- [ ] **5. Nothing personal in telemetry.** [risky] One test drives sign-in, token exchange, a
  release in a private workspace, a feed build and a draft upload with tracing on, and inspects
  everything the test collector received: no parameter values, user ids, emails, IP addresses,
  tokens, or item, scope or workspace names.
  *Done when:* it passes, and a collector that doesn't answer leaves request times unchanged (a
  test with a black-hole endpoint).

- [x] **6. Documentation.** In `../ronne-web`: **Monitoring** in Running Ronne (both `topics.ts`)
  and the Logs line, in English, Portuguese and French, with a Collector config example that was
  run against a real collector (written in the notes); here, `apps/web/.env.example`.
  *Done when:* the docs render tests pass in both repositories.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.

- Task 1: a storage folder that doesn't exist yet is healthy when its parent can take it. The
  setup wizard's e2e caught it: its instance's `STORAGE_PATH` (from the environment) isn't made
  until the first artifact is stored, so "the folder must exist" answered 503 after setup.
- Task 2, the SDK (2026-10-14). Next.js 16's guide (`node_modules/next/dist/docs/01-app/02-guides/
  open-telemetry.md`) documents `@vercel/otel` and a manual `NodeSDK`. Measured with npm in an empty
  folder (`npm install --package-lock-only`, the root not counted): `@opentelemetry/sdk-node` 71
  packages, 49 MB installed on disk (it brings gRPC, Zipkin, Prometheus and Jaeger); `@vercel/otel`
  with its peers and the OTLP/HTTP metric exporter 21 packages, 33 MB (34.3 and 23.9 MB unpacked, by
  npm's `dist.unpackedSize`). All MIT, Apache-2.0, BSD-3-Clause or ISC. `@vercel/otel` reads the
  standard variables for traces (endpoint, headers, protocol, sampler, resource attributes,
  `OTEL_SDK_DISABLED`); the metric exporter reads its own; `OTEL_METRIC_EXPORT_INTERVAL` is read in
  `settings.ts`. Chosen: `@vercel/otel`. Turbopack bundles it all into one server chunk (357,088
  bytes at a56f21b9, with task 2; 381,026 bytes at 5fdcfa95; any change to the telemetry code moves
  it). One package is new in the standalone output and the packed server: `@opentelemetry/api` (45
  files, 192 KiB), which Next.js's own tracer now loads, on or off; `packages:check` passes because
  its allowlist is a pattern over `app/`. A request's trace arrived from the standalone `server.js`
  at a local OTLP receiver.
- For tasks 3 and 5: Next.js's request span carries `http.target`, the path with its query, and an
  item page's path names the item (`/items/@team/x`). A span processor must drop or rewrite it.
- Task 3: the hooks live on `globalThis` (`telemetry/hooks.ts`): Next.js loads a module once per
  bundle, and `register()` installs them once for all. Off, they do nothing and import nothing.
  The database spans come from Kysely's `log` option (it runs in the query's async context), so
  they sit under the request's span, back-dated by the query's duration.
- Task 3: `@vercel/otel`'s default span processors (`"auto"`) add their own OTLP exporter whenever
  an endpoint is in the environment, so every span went out twice, once unsanitized (`http.target`
  with an item's name reached a real collector in a run against the standalone server). Telemetry
  now passes `spanProcessors` with only ours; a test checks each span arrives once, sanitized.
- Task 6, the collector example (2026-10-14): run against the OpenTelemetry Collector contrib
  0.162.0 (`ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib`,
  Apache-2.0, from GitHub's registry: no Docker Hub pull) with the Documentation's
  `otel-collector.yaml`: the standalone server, pointed at it, sent traces (in the collector's
  debug log) and metrics; Prometheus's `:8889/metrics` served `http_server_request_duration_seconds`
  with `http_request_method`, `http_route` and `http_response_status_code` only.
- Task 6: `compose.yaml` passes the standard `OTEL_*` settings from its `.env`, empty when unset
  (as `LOG_LEVEL`); an empty one counts as unset, and start drops it from the environment.
- Task 1 adds the event `storage.unavailable`: the Documentation's Logs events table (100) gets
  its row in task 6, in the three languages.
