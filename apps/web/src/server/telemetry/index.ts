// Telemetry's start (101): reads the OTEL_* settings and, only when an endpoint is set, loads the
// OpenTelemetry SDK. With none, nothing from OpenTelemetry is imported.
import { loadConfig } from "../config";
import { logger } from "../log";
import { hooks } from "./hooks";
import { telemetrySettings } from "./settings";

const log = logger.child({ domain: "telemetry" });

/** Telemetry is on in this process: spans and metrics are recorded (hooks are installed). */
export const telemetryOn = (): boolean => hooks().queryLog !== undefined;

/**
 * Called once from `register()` (instrumentation.ts). Settings from the file reach the SDK, which
 * reads `process.env`, without overriding the environment's. Never throws: a server without
 * telemetry still starts.
 */
export const startTelemetryIfSet = async (env: NodeJS.ProcessEnv = process.env): Promise<void> => {
  let otel: Record<string, string>;
  try {
    otel = loadConfig({ env }).otel ?? {};
  } catch {
    return;
  }
  const settings = telemetrySettings(otel);
  if (!settings.on) {
    if (settings.why === "endpoint_invalid") log.event("telemetry.endpoint_invalid");
    return;
  }
  // An empty OTEL_* (compose.yaml passes every one, empty when unset) counts as unset, as
  // loadConfig counts it: the SDK reads some itself, and an empty endpoint isn't one.
  for (const key of Object.keys(env)) if (key.startsWith("OTEL_") && !env[key]) delete env[key];
  for (const [key, value] of Object.entries(otel)) env[key] ??= value;
  try {
    const { startTelemetry } = await import("./start");
    startTelemetry(settings, otel);
    log.event("telemetry.started", { traces: settings.traces !== null, metrics: settings.metrics });
  } catch (error) {
    log.event("telemetry.failed", { err: error });
  }
};
