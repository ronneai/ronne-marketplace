# 100 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. The logger.** [risky] `apps/web/src/server/log/`: levels, `child({ domain })`, JSON and
  text formats, the request context (`AsyncLocalStorage`), redaction (keys, token and URL values,
  error messages), the length cut, never throwing; `LOG_LEVEL` and `LOG_FORMAT` in `config.ts`;
  the event names in one module. No new dependency.
  *Done when:* unit tests cover each level, both formats, the context, every redaction rule
  (fields, nested, arrays, errors, strings), cycles and `BigInt`, and an invalid `LOG_LEVEL`.

- [x] **2. Requests.** The API wrapper in `server/http/` (request ID, context, `http.request` with
  the route pattern, `X-Request-Id`, unexpected errors as `http.error`) and every route in
  `app/api/**` through it; the server-action wrapper and every exported action through it;
  `proxy.ts` sets the ID for pages; `instrumentation.ts` with `onRequestError`.
  *Done when:* tests show the header on every route (a guard test lists the route files and fails
  on one not wrapped), the ID on lines from a service called by a route and by an action, the
  incoming ID used only with `TRUST_PROXY=true` and when well formed, and one error line per
  unexpected error.

- [x] **3. The events.** Each domain writes the spec's events with their fields: start and
  migrations (`prepare-start.ts`, `start.ts`), sign-in and token exchange, release and yank,
  drafts and their limits, usage limits, feed builds (replacing `deps.log`), submit's checks
  failing, the health check's database failure; Better Auth's `logger` option routed to ours.
  `console.*` in `apps/web/src/server` is gone, and a lint rule or guard test keeps it out.
  *Done when:* tests assert each event's line and fields; the guard fails on a new `console.*`.

- [ ] **4. Nothing secret, nothing personal.** [risky] A test drives sign-in (right and wrong
  password), token exchange, an authenticated API call, a draft upload and a failed database
  connection with a password in its URL, captures stdout, and finds no password, token, cookie,
  `AUTH_SECRET`, database password, email or IP address. The e2e harness checks the server's output
  for the same at the end of a run.
  *Done when:* both pass, and CodeQL reports nothing new on the pull request.

- [ ] **5. Where they go.** `pnpm dev` writes text (the default when `NODE_ENV` is `development`,
  and `LOG_LEVEL` and `LOG_FORMAT` from the shell reach it); the image, the services and the
  packages run with JSON; `rmk-server service logs` shows them; `server-probe.js` checks every
  server line starting `{` parses as JSON, with a `server.started` line carrying this run's exact
  version and port (Next's banner and `server.started` come in either order).
  *Done when:* the server checks and the image's smoke test pass.

- [x] **6. Documentation.** In `../ronne-web`: **Logs** in Running Ronne (both `topics.ts`), in
  English, Portuguese and French, with the events table from the module; here,
  `apps/web/.env.example` and the install guide's settings and Troubleshooting lines.
  *Done when:* the docs render tests pass in both repositories, and the witness finds every event
  in the module listed in the three languages.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
