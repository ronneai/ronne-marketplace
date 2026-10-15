// What the server calls to trace and measure (101), doing nothing until telemetry starts: then
// `start.ts` installs the real ones. Imports nothing from OpenTelemetry, so with telemetry off
// nothing of it is loaded and the cost is a call to a function that returns.

import type { LogEvent } from "kysely";
import type { StorageAdapter } from "../storage/storage-adapter";

type Attributes = Record<string, string | number | boolean>;

export type TelemetryHooks = {
  /** A span named `name` around `work`, under the active one; its attributes low-cardinality. */
  inSpan: <T>(name: string, attributes: Attributes, work: () => Promise<T>) => Promise<T>;
  /** Kysely's `log` option: a span for each query (and, task 4, its duration), or undefined. */
  queryLog: ((dialect: "sqlite" | "postgres" | "mysql") => (event: LogEvent) => void) | undefined;
  /** The adapter, its puts and gets as spans with their byte counts (never the key). */
  tracedStorage: (storage: StorageAdapter) => StorageAdapter;
  /** Sets an attribute on the active span (the request's, in a route). */
  annotate: (key: string, value: string | number | boolean) => void;
  /** The active span's trace and span IDs, for log lines. */
  traceIds: () => { traceId: string; spanId: string } | undefined;
};

const off: TelemetryHooks = {
  inSpan: (_name, _attributes, work) => work(),
  queryLog: undefined,
  tracedStorage: (storage) => storage,
  annotate: () => {},
  traceIds: () => undefined,
};

// On globalThis: Next.js may load this module more than once (each bundle its own copy), and
// `register()` installs the hooks once for all of them.
const store = globalThis as typeof globalThis & { __ronneTelemetry?: TelemetryHooks };

/** The current hooks: the real ones once telemetry has started, else ones that do nothing. */
export const hooks = (): TelemetryHooks => store.__ronneTelemetry ?? off;

/** Installs the real hooks (start.ts), or puts the do-nothing ones back (tests). */
export const installHooks = (installed: TelemetryHooks | undefined): void => {
  store.__ronneTelemetry = installed;
};

/** `work` in a span, when telemetry is on. */
export const inSpan = <T>(name: string, attributes: Attributes, work: () => Promise<T>) =>
  hooks().inSpan(name, attributes, work);
