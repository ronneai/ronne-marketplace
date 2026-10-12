# 101 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Health checks storage.** `check()` on the `StorageAdapter` interface and the local
  adapter (folder exists, writable, no file written); `/api/health` checks the database then
  storage, each within 3 s, answers `storage_unavailable` with `details.checks`, and adds `checks`
  to the 200 body. Existing statuses and codes unchanged.
  *Done when:* `health.db.test.ts` covers a read-only and a missing storage folder; the Dockerfile's
  health check, the server checks and the e2e tests pass unchanged.

- [ ] **2. The SDK, off by default.** Check Next.js 16's OpenTelemetry guide and the current SDK
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

- [ ] **3. Spans.** The Kysely plugin (added only when tracing is on: system, operation, SQL with
  placeholders, never parameters), storage spans (bytes, no key), `ronne.release`,
  `ronne.feed.build`, `ronne.draft.upload`, `ronne.request_id` on the request span; 100's logger
  adds `traceId` and `spanId`; a span processor drops attributes that look like emails (Better
  Auth's spans).
  *Done when:* tests against the test collector see each span under its request, and the log lines
  carry the trace's IDs.

- [ ] **4. Metrics.** The spec's instruments, recorded in 100's API wrapper, the database plugin,
  the identity, submissions, feeds and usage services, and the health check.
  *Done when:* tests see each instrument with exactly the listed attributes.

- [ ] **5. Nothing personal in telemetry.** [risky] One test drives sign-in, token exchange, a
  release in a private workspace, a feed build and a draft upload with tracing on, and inspects
  everything the test collector received: no parameter values, user ids, emails, IP addresses,
  tokens, or item, scope or workspace names.
  *Done when:* it passes, and a collector that doesn't answer leaves request times unchanged (a
  test with a black-hole endpoint).

- [ ] **6. Documentation.** In `../ronne-web`: **Monitoring** in Running Ronne (both `topics.ts`)
  and the Logs line, in English, Portuguese and French, with a Collector config example that was
  run against a real collector (written in the notes); here, `apps/web/.env.example`.
  *Done when:* the docs render tests pass in both repositories.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
