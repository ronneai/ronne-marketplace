// The hooks when telemetry is on (101): spans through OpenTelemetry's API. Loaded only by start.ts.
import { context, isSpanContextValid, metrics, SpanStatusCode, trace } from "@opentelemetry/api";
import type { TelemetryHooks } from "./hooks";

const SYSTEM = { sqlite: "sqlite", postgres: "postgresql", mysql: "mysql" } as const;
/** The SQL text on a query span is cut here: a long IN (…) list says nothing more. */
const MAX_SQL = 2_000;

/** A rate limit's name as `ronne.rate_limited` says it (the events' own are finer). */
const LIMITS: Record<string, string> = {
  sign_in: "sign_in",
  token_exchange: "token_exchange",
  uploads: "upload",
  submits: "upload",
  usage_reports: "usage",
};

export const realHooks = (): TelemetryHooks => {
  const tracer = trace.getTracer("ronne-marketplace");
  // The spec's instruments (101), with low-cardinality attributes only: never a user, an email,
  // an address, a name or a token.
  const meter = metrics.getMeter("ronne-marketplace");
  const requestDuration = meter.createHistogram("http.server.request.duration", { unit: "s" });
  const queryDuration = meter.createHistogram("ronne.db.query.duration", { unit: "s" });
  const signIns = meter.createCounter("ronne.sign_ins");
  const tokensExchanged = meter.createCounter("ronne.tokens.exchanged");
  const releases = meter.createCounter("ronne.releases");
  const feedBuilds = meter.createCounter("ronne.feed.builds");
  const feedBuildDuration = meter.createHistogram("ronne.feed.build.duration", { unit: "s" });
  const draftsUploaded = meter.createCounter("ronne.drafts.uploaded");
  const rateLimited = meter.createCounter("ronne.rate_limited");
  const health = new Map<string, number>();
  meter.createObservableGauge("ronne.health").addCallback((result) => {
    for (const [check, value] of health) result.observe(value, { check });
  });
  const number = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  const inSpan: TelemetryHooks["inSpan"] = (name, attributes, work) =>
    tracer.startActiveSpan(name, { attributes }, async (span) => {
      try {
        return await work();
      } catch (error) {
        // The status, not the error's message: a domain's message can name an item.
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
  return {
    inSpan,
    // A query's span, from Kysely's log after it ran: under the active span, back-dated by its
    // duration. The SQL with its placeholders; never the parameters (names, emails, hashes).
    queryLog: (dialect) => (event) => {
      const end = Date.now();
      const sql = event.query.sql;
      const operation = /^\s*\(?\s*(\w+)/.exec(sql)?.[1]?.toLowerCase() ?? "unknown";
      const span = tracer.startSpan(
        `db ${operation}`,
        {
          startTime: end - event.queryDurationMillis,
          attributes: {
            "db.system.name": SYSTEM[dialect],
            "db.operation.name": operation,
            "db.query.text": sql.length > MAX_SQL ? `${sql.slice(0, MAX_SQL)}…` : sql,
          },
        },
        context.active(),
      );
      queryDuration.record(event.queryDurationMillis / 1000, {
        "db.system.name": SYSTEM[dialect],
        "db.operation.name": operation,
      });
      if (event.level === "error") span.setStatus({ code: SpanStatusCode.ERROR });
      span.end(end);
    },
    // Puts and gets as spans with their byte count; never the key (it names an item).
    tracedStorage: (storage) => ({
      put: (key, bytes) =>
        inSpan("storage.put", { "ronne.storage.bytes": bytes.length }, () =>
          storage.put(key, bytes),
        ),
      get: (key) =>
        inSpan("storage.get", {}, async () => {
          const bytes = await storage.get(key);
          trace.getActiveSpan()?.setAttribute("ronne.storage.bytes", bytes?.length ?? 0);
          return bytes;
        }),
      exists: (key) => storage.exists(key),
      size: (key) => storage.size(key),
      check: () => storage.check(),
    }),
    annotate: (key, value) => {
      trace.getActiveSpan()?.setAttribute(key, value);
    },
    onEvent: (name, fields) => {
      switch (name) {
        case "http.request":
          requestDuration.record(number(fields.ms) / 1000, {
            "http.request.method": String(fields.method),
            "http.route": String(fields.route),
            "http.response.status_code": number(fields.status),
          });
          return;
        case "auth.signed_in":
          signIns.add(1, { outcome: "success" });
          return;
        case "auth.sign_in_failed":
          (fields.via === "cli" ? tokensExchanged : signIns).add(1, { outcome: "failure" });
          return;
        case "token.exchanged":
          tokensExchanged.add(1, { outcome: "success" });
          return;
        case "auth.rate_limited":
          if (fields.limit === "sign_in") signIns.add(1, { outcome: "rate_limited" });
          if (fields.limit === "token_exchange")
            tokensExchanged.add(1, { outcome: "rate_limited" });
          rateLimited.add(1, { limit: LIMITS[String(fields.limit)] ?? "other" });
          return;
        case "upload.rate_limited":
        case "usage.rate_limited":
          rateLimited.add(1, { limit: LIMITS[String(fields.limit)] ?? "other" });
          return;
        case "version.released":
          releases.add(number(fields.count));
          return;
        case "feed.built":
          feedBuilds.add(1, { tool: String(fields.tool), cached: fields.cached === true });
          if (fields.cached !== true)
            feedBuildDuration.record(number(fields.ms) / 1000, { tool: String(fields.tool) });
          return;
        case "draft.uploaded":
          draftsUploaded.add(1, { outcome: "accepted" });
          return;
        case "draft.upload_refused":
          draftsUploaded.add(1, { outcome: "refused" });
          return;
      }
    },
    health: (check, ok) => {
      health.set(check, ok ? 1 : 0);
    },
    traceIds: () => {
      const span = trace.getActiveSpan()?.spanContext();
      return span && isSpanContextValid(span)
        ? { traceId: span.traceId, spanId: span.spanId }
        : undefined;
    },
  };
};
