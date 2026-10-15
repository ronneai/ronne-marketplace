import { describe, expect, it } from "vitest";
import { telemetrySettings } from "./settings";

describe("telemetrySettings", () => {
  it("is off without an endpoint, whatever else is set", () => {
    expect(telemetrySettings({})).toEqual({ on: false, why: "no_endpoint" });
    expect(
      telemetrySettings({ OTEL_SERVICE_NAME: "x", OTEL_EXPORTER_OTLP_HEADERS: "a=b" }),
    ).toEqual({
      on: false,
      why: "no_endpoint",
    });
  });

  it("is off with OTEL_SDK_DISABLED=true, even with an endpoint", () => {
    expect(
      telemetrySettings({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://c:4318",
        OTEL_SDK_DISABLED: "TRUE",
      }),
    ).toEqual({ on: false, why: "disabled" });
  });

  it("is off when an endpoint isn't an http(s) URL", () => {
    for (const bad of ["c:4318", "not a url", "ftp://c/x"])
      expect(telemetrySettings({ OTEL_EXPORTER_OTLP_ENDPOINT: bad }), bad).toEqual({
        on: false,
        why: "endpoint_invalid",
      });
  });

  it("sends traces to the shared endpoint's /v1/traces, with the headers decoded", () => {
    expect(
      telemetrySettings({
        OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example:4318/",
        OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer%20abc,x-team=ops",
      }),
    ).toEqual({
      on: true,
      traces: {
        url: "https://c.example:4318/v1/traces",
        headers: { authorization: "Bearer abc", "x-team": "ops" },
        protocol: "protobuf",
      },
      metrics: true,
      metricInterval: 60_000,
    });
  });

  it("takes a signal's own endpoint, headers and protocol as they are", () => {
    expect(
      telemetrySettings({
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://t:4318/custom",
        OTEL_EXPORTER_OTLP_TRACES_HEADERS: "a=1",
        OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
        OTEL_METRIC_EXPORT_INTERVAL: "5000",
      }),
    ).toEqual({
      on: true,
      traces: { url: "http://t:4318/custom", headers: { a: "1" }, protocol: "json" },
      metrics: false,
      metricInterval: 5000,
    });
    expect(
      telemetrySettings({ OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: "http://m:4318/v1/metrics" }),
    ).toMatchObject({
      on: true,
      traces: null,
      metrics: true,
    });
  });
});
