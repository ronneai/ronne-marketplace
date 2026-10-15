// The OpenTelemetry SDK (101), imported only when an endpoint is set (index.ts).
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import {
  BatchSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { OTLPHttpJsonTraceExporter, OTLPHttpProtoTraceExporter, registerOTel } from "@vercel/otel";
import { version } from "../../../package.json";
import { exportFailures, watched } from "./failures";
import { installHooks } from "./hooks";
import { realHooks } from "./real-hooks";
import { sanitizeSpan } from "./sanitize";
import type { TelemetrySettings } from "./settings";

/** Spans go nowhere: only metrics have an endpoint. */
const nowhere: SpanExporter = {
  export: (_spans: ReadableSpan[], done) => done({ code: 0 }),
  shutdown: async () => {},
};

/**
 * Starts tracing and metrics over OTLP/HTTP to the collector, through `@vercel/otel` (the lighter of
 * the two ways Next.js documents; 101's plan notes). Next.js's own spans come with it.
 */
export const startTelemetry = (
  settings: Extract<TelemetrySettings, { on: true }>,
  otel: Record<string, string>,
): void => {
  const failed = exportFailures();
  const { traces } = settings;
  const Exporter =
    traces?.protocol === "json" ? OTLPHttpJsonTraceExporter : OTLPHttpProtoTraceExporter;
  /** Spans leave sanitized (sanitize.ts): nothing personal, no item names, no secrets. */
  const sanitized = (exporter: SpanExporter): SpanExporter => {
    const send = exporter.export.bind(exporter);
    exporter.export = (spans, done) => send(spans.map(sanitizeSpan), done);
    return exporter;
  };
  registerOTel({
    serviceName: otel.OTEL_SERVICE_NAME ?? "ronne-marketplace",
    attributes: { "service.version": version },
    // Our processor only: `@vercel/otel`'s default ("auto") adds its own OTLP exporter whenever an
    // endpoint is set, which would send every span a second time, unsanitized.
    spanProcessors: [
      new BatchSpanProcessor(
        traces
          ? sanitized(
              watched(new Exporter({ url: traces.url, headers: traces.headers }), "traces", failed),
            )
          : nowhere,
      ),
    ],
    metricReaders: settings.metrics
      ? [
          new PeriodicExportingMetricReader({
            exporter: watched(new OTLPMetricExporter(), "metrics", failed),
            exportIntervalMillis: settings.metricInterval,
          }),
        ]
      : [],
  });
  installHooks(realHooks());
};
