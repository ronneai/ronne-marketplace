import { logger } from "../log";

const log = logger.child({ domain: "telemetry" });

/**
 * `telemetry.export_failed` at most once a minute (101): a collector that's down fails every batch,
 * and one line a minute says so without filling the log. The SDK retries and then drops.
 */
export const exportFailures = (
  write: (signal: "traces" | "metrics") => void = (signal) =>
    log.event("telemetry.export_failed", { signal }),
  now: () => number = Date.now,
  everyMs = 60_000,
) => {
  let last = Number.NEGATIVE_INFINITY;
  return (signal: "traces" | "metrics") => {
    if (now() - last < everyMs) return;
    last = now();
    write(signal);
  };
};

type Exporter<T> = { export(items: T, done: (result: { code: number }) => void): void };

/** The exporter, reporting each failed export (a result code other than success, 0). */
export const watched = <T, E extends Exporter<T>>(
  exporter: E,
  signal: "traces" | "metrics",
  failed: (signal: "traces" | "metrics") => void,
): E => {
  const send = exporter.export.bind(exporter);
  exporter.export = (items, done) =>
    send(items, (result) => {
      if (result.code !== 0) failed(signal);
      done(result);
    });
  return exporter;
};
