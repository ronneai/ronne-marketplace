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
