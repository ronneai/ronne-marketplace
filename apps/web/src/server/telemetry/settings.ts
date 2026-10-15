// When telemetry is on (feature 101), from the standard OTEL_* settings. Imports nothing from
// OpenTelemetry: with no endpoint the SDK is never loaded.

/** What `register()` does at start. */
export type TelemetrySettings =
  | { on: false; why: "no_endpoint" | "disabled" | "endpoint_invalid" }
  | {
      on: true;
      /** OTLP/HTTP traces: the URL, its headers and its encoding; null when only metrics go out. */
      traces: {
        url: string;
        headers: Record<string, string>;
        protocol: "json" | "protobuf";
      } | null;
      /** Metrics go out (their exporter reads its own OTEL_EXPORTER_OTLP_* settings). */
      metrics: boolean;
      /** Milliseconds between metric exports (OTEL_METRIC_EXPORT_INTERVAL, 60 s by default). */
      metricInterval: number;
    };

const isUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

/** `key=value,key2=value2`, URL-encoded, as the OTLP exporter specification writes headers. */
const parseHeaders = (value: string | undefined): Record<string, string> =>
  Object.fromEntries(
    (value ?? "").split(",").flatMap((pair) => {
      const at = pair.indexOf("=");
      if (at <= 0) return [];
      try {
        return [
          [
            decodeURIComponent(pair.slice(0, at).trim()),
            decodeURIComponent(pair.slice(at + 1).trim()),
          ],
        ];
      } catch {
        return [];
      }
    }),
  );

/**
 * On when an OTLP endpoint is set (the shared one, or the traces' or metrics' own) and
 * OTEL_SDK_DISABLED isn't `true`. An endpoint that isn't an http(s) URL leaves it off.
 */
export const telemetrySettings = (otel: Record<string, string | undefined>): TelemetrySettings => {
  const shared = otel.OTEL_EXPORTER_OTLP_ENDPOINT;
  const traces = otel.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  const metrics = otel.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;
  if (!shared && !traces && !metrics) return { on: false, why: "no_endpoint" };
  if (otel.OTEL_SDK_DISABLED?.trim().toLowerCase() === "true")
    return { on: false, why: "disabled" };
  if ([shared, traces, metrics].some((url) => url !== undefined && !isUrl(url)))
    return { on: false, why: "endpoint_invalid" };
  // The shared endpoint takes the signal's path; a signal's own endpoint is used as it is.
  const tracesUrl = traces ?? (shared ? `${shared.replace(/\/+$/, "")}/v1/traces` : undefined);
  const interval = Number(otel.OTEL_METRIC_EXPORT_INTERVAL);
  const protocol =
    (otel.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL ?? otel.OTEL_EXPORTER_OTLP_PROTOCOL) === "http/json"
      ? "json"
      : "protobuf";
  return {
    on: true,
    traces: tracesUrl
      ? {
          url: tracesUrl,
          headers: {
            ...parseHeaders(otel.OTEL_EXPORTER_OTLP_HEADERS),
            ...parseHeaders(otel.OTEL_EXPORTER_OTLP_TRACES_HEADERS),
          },
          protocol,
        }
      : null,
    metrics: Boolean(shared || metrics),
    metricInterval: Number.isFinite(interval) && interval > 0 ? interval : 60_000,
  };
};
