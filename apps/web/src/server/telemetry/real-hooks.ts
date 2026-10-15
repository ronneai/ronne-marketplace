// The hooks when telemetry is on (101): spans through OpenTelemetry's API. Loaded only by start.ts.
import { context, isSpanContextValid, SpanStatusCode, trace } from "@opentelemetry/api";
import type { TelemetryHooks } from "./hooks";

const SYSTEM = { sqlite: "sqlite", postgres: "postgresql", mysql: "mysql" } as const;
/** The SQL text on a query span is cut here: a long IN (…) list says nothing more. */
const MAX_SQL = 2_000;

export const realHooks = (): TelemetryHooks => {
  const tracer = trace.getTracer("ronne-marketplace");
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
    traceIds: () => {
      const span = trace.getActiveSpan()?.spanContext();
      return span && isSpanContextValid(span)
        ? { traceId: span.traceId, spanId: span.spanId }
        : undefined;
    },
  };
};
