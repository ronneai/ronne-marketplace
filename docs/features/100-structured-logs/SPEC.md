# 100 — Structured logs

> Milestone: M14 · Depends on: 001 · Design: [MVP §14.4](../../MVP/MVP.md#144-other-future-topics), [§15](../../MVP/MVP.md#15-decision-log) (Operations) · Contracts: none changed

## Goal

What the server writes is something a company can collect, search and alert on (owner, 2026-10-06):
one JSON object per line, with a level, the time and the request it belongs to, the same fields in
every domain, and never a secret. Today the server writes almost nothing: eight `console.warn`
calls, no request IDs, and an unexpected error reaches only Next.js's default output.

## Scope

**In:**
- **A logger** in `apps/web/src/server/log/`, with no new dependency: JSON lines on stdout,
  levels, child loggers per domain, and redaction.
- **`LOG_LEVEL`** (`debug`, `info`, `warn`, `error`; `info` by default) and **`LOG_FORMAT`**
  (`json` by default; `text` for a person reading a terminal, which `pnpm dev` sets).
- **A request ID** for every API request and server action, returned as `X-Request-Id`, on every
  line written while it's handled.
- **One line per API request** (method, route, status, time taken).
- **Unexpected errors** logged once, with their stack, wherever they happen: API routes, server
  actions, pages (Next.js's `onRequestError` in a new `instrumentation.ts`).
- **The events that matter to someone running the server** (below), in every domain, with the same
  field names.
- **The existing `console.*` calls in the server** move to the logger.
- **A test that keeps secrets out:** tokens, passwords, cookies, `AUTH_SECRET` and database
  passwords never reach a line, whatever is passed to the logger.

**Out** (and where it goes instead):
- **Metrics and traces:** 101 (the logger adds trace IDs to lines when 101's tracing is on).
- **Where logs are kept and for how long:** the platform's (Docker's logging driver, journald,
  launchd's file, already set up by 005 and 083; no Windows server since 121). Ronne writes to
  stdout and keeps nothing.
- **The terminal commands' output** (`setup`, `migrate`, `reset-root-password`, `backup`, …): they
  talk to a person, with ✓ and ✗, and stay as they are. Only the running server logs JSON.
- **Next.js's and Node.js's own lines** (Next's start banner, Node's warnings): not ours to format;
  they stay plain text in the same stream (Edge cases).
- **The audit log:** it stays the record of who did what (007), in the database. Logs are for
  running the server, not a second audit log.

## Behaviour

### A line

```json
{"time":"2026-10-11T14:03:22.417Z","level":"info","msg":"Released","domain":"submissions","event":"version.released","requestId":"01K7…","userId":"01J9…","items":3}
```

| Field | Always | What it is |
|---|---|---|
| `time` | yes | ISO 8601, UTC, milliseconds |
| `level` | yes | `debug`, `info`, `warn` or `error` |
| `msg` | yes | A short sentence for people, fixed text (no values in it) |
| `event` | for events | A stable name, `<area>.<what>` (`server.started`, `http.request`, `auth.sign_in_failed`), for searches and alerts; documented in the list below |
| `domain` | in a domain | The domain that wrote it (`identity`, `submissions`, `feeds`, …), or `http`, `db`, `server` |
| `requestId` | in a request | The request it belongs to |
| `userId` | when known | The signed-in user's or the token owner's id, never an email or a name |
| `err` | on errors | `{ name, message, stack, code }`, the stack only at `error` |
| others | — | The event's own fields, flat, camelCase, values that are numbers, booleans or short strings |

**No personal data beyond the user's id:** no emails, names or IP addresses in any line. They're
in the database, under 102's retention; logs go to collectors Ronne doesn't control, kept by rules
Ronne doesn't set. The usage report (046) logs nothing about who sent it, as the report stores
nothing about them.

### Levels

`LOG_LEVEL` from the environment or the settings file (`config.ts`), read at start. An unknown
value logs one `warn` line (`event: "log.level_invalid"`) and uses `info`. `debug` adds the lines
nobody needs day to day (cache hits, each feed build's details, database timings above 100 ms);
`info` is the events below; `warn` is what someone should look at (a refused upload's reason,
rate limits reached, feed size warnings, submit's checks failing); `error` is a failure (an
unexpected error, the database unreachable).

### The request ID

- **API routes** (`/api/v1/**`, `/api/health`): one wrapper in `server/http/` that every route
  handler goes through. It takes the request ID, runs the handler in an `AsyncLocalStorage`
  context (so every line in the handler, the services and the repositories carries it without
  passing it), writes the `http.request` line when it's done (`method`, `route` (the pattern,
  `/api/v1/items/[scope]/[name]`, never the filled-in path, so private names don't reach logs),
  `status`, `ms`, `userId`), and sets `X-Request-Id` on the response.
- **Server actions:** a shared wrapper the `actions.ts` files' exported actions go through, with
  the same context; no `http.request` line (a server action is one POST to the page), but every
  line inside carries the ID.
- **Pages:** `proxy.ts` sets the header on the request, so `onRequestError` can log a page's
  failure with it.
- **Where it comes from:** a new ULID per request. With `TRUST_PROXY=true`, an incoming
  `X-Request-Id` (at most 128 characters of `[A-Za-z0-9._-]`) is used instead, so one ID follows
  the request through Caddy or a load balancer; anything else is ignored.
- **Errors** in the API's error body don't change shape (MVP §11); the response's `X-Request-Id`
  header is what someone quotes when they report a problem.

### The events

At least, named in one module so the list in the Documentation can't drift:

| Event | Level | Fields |
|---|---|---|
| `server.started` | info | `version`, `dialect`, `runtime` (docker, npm, bundle, service), `port` |
| `server.migrations_applied` | info | `count`, `latest` |
| `http.request` | info (warn for 4xx rate limits, error for 5xx) | above |
| `http.error` | error | `err`, `route` |
| `auth.signed_in` / `auth.sign_in_failed` | info / warn | `userId` (success only), `reason` |
| `auth.rate_limited` | warn | `limit` (`sign_in`, `token_exchange`) |
| `token.exchanged` / `token.rejected` | info / warn | `userId` / `reason` (`unknown`, `revoked`, `expired`) |
| `version.released` | info | `count` (a bulk release logs one line), `userId` |
| `version.yanked` | info | `userId` |
| `draft.uploaded` / `draft.upload_refused` | info / warn | `files`, `bytes` / `reason` |
| `upload.rate_limited`, `usage.rate_limited` | warn | `limit` |
| `submission.checks_failed` | warn | `err` (today's `console.warn` in `drafts.ts`) |
| `feed.built` | info (debug when from cache) | `tool`, `plugins`, `ms`, `bytes` |
| `feed.size_warning`, `feed.plugin_skipped` | warn | `tool`, `percent` / `reason` (today's `deps.log`) |
| `db.unavailable` | error | `err` (health check, start) |

Item, scope and workspace names aren't logged: a private workspace's names aren't visible to whoever
reads the logs (093), and the audit log already says which item.

### Redaction

The logger, not each caller, keeps secrets out:
- **Keys:** any field named (case-insensitively) `password`, `token`, `secret`, `authorization`,
  `cookie`, `passphrase`, `apiKey`, or ending in one of these, is written as `"[redacted]"`, at any
  depth.
- **Values:** any string containing an access token (`rmk_` and at least 43 characters: the
  whole run goes) has it replaced with `rmk_[redacted]`; a URL with a password has it replaced with
  `***`, by `redactDatabaseUrl`'s rule: after `://`, the user name runs to the first `:` or `/` (an
  `@` in it, as Azure's `admin@server`, stays), and the password from that `:` to the last `@` in
  the string, so no space, `@` or `://` in it can end it early. With two URLs, or an email after a
  URL with a port, more is hidden; never less. Keys go through the same redaction, and so do the
  message, the request's ID and the user id. Not caught: `user:pw@host` without a scheme, and a
  password in a query string.
- **Errors:** an error's `name`, `message`, string `code` and stack go through the same value
  redaction; its other properties (a driver's `config`, `cause`) aren't written; a thrown value
  that isn't an `Error` is logged as its type only.
- **Environment values** are never logged, secret or not
  ([`codeql-logging.md`](../../knowledge/codeql-logging.md)): `server.started` logs the dialect and
  the port, never `DATABASE_URL` or `PUBLIC_URL`.

### `LOG_FORMAT=text`

For a person: `14:03:22.417 INFO  submissions version.released Released items=3 requestId=01K7…`,
colours when stdout is a terminal. `pnpm dev` sets it; the server, Docker, the services and the
packages use JSON.

## Edge cases

**What the logger is hardened against** (owner, 2026-10-14): what the server can actually be
handed. That's request data (strings, plain JSON, however crafted), errors from drivers and
libraries, and our own code's mistakes (a cycle, a big or shared value, a secret passed by
accident). For those, no secret is written, nothing throws, and a line's work and size are bounded,
as below. Hostile objects that only code inside the process could build (Proxies, values with
replaced methods, throwing getters, a patched prototype) are handled where it's cheap (a field
marked, a line still written), but they're out of scope: code that can build them can already
read every secret itself.

- **Next.js's own lines** (`▲ Next.js 16…`, `✓ Ready in…`) aren't JSON. They're few, written at
  start; collectors that parse JSON treat them as text. `server.started` is the line to alert on.
- **A line written outside a request** (start, migrations): no `requestId`.
- **Something logged inside `after()`** (work after the response): the context is kept, so the
  line has the request's ID.
- **A field that can't be serialised** (a cycle, a `BigInt`): the logger writes `"[unserialisable]"`
  for that field and never throws; logging never fails a request.
- **A very long value** (an error message from a driver): cut to 2,000 characters with `…`, after
  redaction, so a cut never leaves part of a token; keys likewise, at 200. A string or key over
  64 KB isn't read at all: it's written as `"[N characters]"` (a key as `"[key N]"`), never part of
  it, which could be part of a secret. At most 100 items of an
  array (then `"[N more]"`) or keys of an object (then `"[more]": N`) are written, 8 levels deep
  (then `"[too deep]"`); bytes (a `Buffer`) are written as `"[N bytes]"`, never their content.
- **A value reached many ways** (shared, not a cycle) is written each time, so a line also has a
  budget, for its bindings and fields together: 1,000 values visited (`undefined` included) and
  50,000 characters of keys and strings, each string charged by its length before it's read, then
  `"[too big]"`, `"[N more]"` or `"[more]": N`. An error's fields and an object's keys are read once
  per line. So the work of a line is bounded whatever it's given (besides listing an object's own
  keys once), and logging takes milliseconds, not seconds or the process's memory.
- **The finished line** is at most 131,072 characters, escaping and quoting included: past it, its
  fields are written as `"fields": "[too big]"`, with the time, level, message, domain, event and
  request kept. The head holds only names and ids: a `domain` or `userId` that isn't a string or a
  number is left out.
- **A secret key** is told by the key's end only (its last letters, `_` and `-` left out, at most
  256 characters read), once per object per line, so a key of any length costs little. A key whose
  end is too long to read that way (a long run of `_` or `-`) counts as a secret.
- **A `__proto__` field** (from request JSON) is written as a field, like any other.
- **A Date or bytes** are read with the built-in methods (`Date.prototype.toISOString`, the
  `byteLength` getters), never the value's own, which could return a secret or something huge.
- **A getter that throws** marks that field `"[unserialisable]"`; the rest of the line is written.
- **Hidden characters**, by Unicode's categories (controls `Cc`, format characters `Cf`, every
  default-ignorable code point, the line and paragraph separators, and the blank braille U+2800:
  a newline, an ANSI escape, C1 controls, bidirectional marks, zero-width, tag and filler
  characters, variation selectors), checked per code point, are escaped as `\uXXXX` (or JSON's `\n` inside a
  quoted value), in text and in JSON alike, so nothing can split a line, forge another one, drive
  the terminal or reorder what it shows. In text, a key or string value with a space, `=` or `"` is
  quoted, an object or array value (JSON) when it holds a space or `=`, and an `=` or `"` in the domain,
  event or message is escaped, so nothing passes for a field.
- **stdout is closed or slow:** writes go through `process.stdout.write` without waiting. A closed
  stdout (`EPIPE`) loses the lines and never crashes the server (the logger listens for its
  `error` event). Node's docs ("A note on process I/O"): on Linux and macOS, writes to a pipe or
  socket (journald, Docker, a service's log) are asynchronous, so Node buffers them in memory if the
  reader falls behind; writes to a file or a terminal are synchronous, so a stalled disk or a slow
  terminal holds the server up. That's Node's behaviour for every program, not the logger's.
- **Settings that can't be read** (`RONNE_ENV_FILE` a folder): the logger uses the environment's
  `LOG_LEVEL` and `LOG_FORMAT` and goes on; the server reports the settings problem itself.
- **Better Auth's own logs:** sent through its `logger` option to ours (`domain: "identity"`),
  at the matching level; checked against Better Auth's current docs when built.
- **`LOG_LEVEL=debug` in production:** allowed; it logs more, never secrets.
- **The service logs** are already collected (journald, `/Library/Logs/rmk-server/server.log`);
  `rmk-server service logs` shows them. JSON is what they now hold.

## Documentation

- **Running Ronne** (`operations`), new section **Logs** (`operations#logs`): where the logs are
  for each way of installing, the line's fields, `LOG_LEVEL` and `LOG_FORMAT`, the events table,
  what's never in a line (secrets, emails, IP addresses, item names), and the `X-Request-Id`
  header for reporting a problem.
- **The install guide** (`docs/runbooks/install.md`): `LOG_LEVEL` in the settings, and the
  Troubleshooting table's "look at the logs" rows point to the section.
- **`apps/web/.env.example`:** `LOG_LEVEL` and `LOG_FORMAT`, commented.
- **Helpers:** none; nothing changes in the web app's pages.

## Acceptance criteria

- [ ] Every line the server writes is one JSON object with `time`, `level` and `msg`, and the
      fields in the table where they apply; `LOG_FORMAT=text` prints the same for people.
- [ ] `LOG_LEVEL` filters lines; an invalid value warns once and uses `info`.
- [ ] Every API response carries `X-Request-Id`, and every line written while handling it (and
      while handling a server action) carries the same ID; an incoming ID is used only with
      `TRUST_PROXY=true` and when it's well formed.
- [ ] Each API request writes one `http.request` line with the route pattern, never the path.
- [ ] An unexpected error in an API route, a server action or a page is logged once, with its
      stack and the request ID.
- [ ] The events in the table are written by their domains with those names and fields, and no
      `console.*` call is left in `apps/web/src/server` outside the logger.
- [ ] A test passes tokens, passwords, cookies, `AUTH_SECRET`, a database URL with a password and
      an `Authorization` header to the logger, as fields, nested, in error messages and in strings,
      and finds none of them in the output; no line contains an email or an IP address.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Open questions

- None.
