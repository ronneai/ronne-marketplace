import { parseSkillScan } from "@ronneai/core";
import type { ScannerServiceState } from "../../settings/models/skill-scan-policy";
import type {
  ScanError,
  ScanFile,
  ScanOutcome,
  ScanProvider,
  ServiceHealth,
  SkillScanner,
} from "../models/scan";

/**
 * The scanner as a service (156): the scan service in the scanner's container, reached through
 * the proxy on an address the operator set (`RONNE_SKILL_SCANNER_URL`, and
 * `RONNE_SKILL_SCANNER_SEMANTIC_URL` for semantic scans). Each request carries the scan key
 * (`RONNE_SCAN_KEY`), which the proxy checks and strips. Same contract as the command scanner:
 * never throws for anything the service or the network does.
 */

/** The header the proxy reads the scan key from. */
export const SCAN_KEY_HEADER = "X-Ronne-Scan-Key";

/** How long the service may take past the scan's own timeout before Ronne stops waiting. */
const ANSWER_GRACE_SECONDS = 30;
/** The service's report is at most 4 MiB; with JSON's escapes the answer stays well under this. */
const ANSWER_LIMIT = 16 * 1024 * 1024;
export const HEALTH_TIMEOUT_MS = 3000;

/**
 * A service address as the operator wrote it: `http://` or `https://`, no user or password, no
 * query or fragment, and no path but `/` (the service answers `/scan` and `/health` there).
 * Null when it isn't one, so a bad address is refused at start-up like a bad command.
 */
export const parseServiceUrl = (value: string | undefined): URL | null => {
  if (!value?.trim()) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // An empty `?` or `#` too: the address is written plainly or not at all.
  if (url.username || url.password || /[?#]/.test(value)) return null;
  if (url.pathname !== "/") return null;
  return url;
};

/** What the service's JSON errors mean, in Ronne's own words (busy and the key: by status too). */
const SERVICE_ERRORS = new Map<string, ScanError>(
  Object.entries({
    timeout: "timeout",
    "output too large": "output too large",
    signal: "signal",
    "bad file path": "bad file path",
    "write failed": "write failed",
    "not found": "not found",
    "not runnable": "not runnable",
    "too large": "refused",
    "bad request": "refused",
    internal: "refused",
  } satisfies Record<string, ScanError>),
);

const errorOf = (body: unknown): string | null =>
  body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
    ? (body as { error: string }).error
    : null;

/**
 * The answer's JSON, or null when it isn't JSON (the proxy's own pages) or runs past the cap:
 * reading stops there, whatever length the answer claims or doesn't. Throws once `stopped` settles.
 */
const readAnswer = async (
  response: Response,
  stopped: Promise<never>,
  limit = ANSWER_LIMIT,
): Promise<unknown> => {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      // Raced with the deadline: fetch's own signal doesn't always stop a body that stalls.
      const { done, value } = await Promise.race([reader.read(), stopped]);
      if (done) break;
      size += value.byteLength;
      if (size > limit) return null;
      chunks.push(value);
    }
  } finally {
    // Done, too large or out of time: the connection goes.
    reader.cancel().catch(() => {});
  }
  try {
    return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
  } catch {
    return null;
  }
};

/**
 * One request to the service with a deadline over all of it, the answer's body included: its
 * status and JSON, or null when there was no usable answer in time. A redirect is no answer.
 */
const call = async (
  fetcher: typeof fetch,
  url: URL,
  init: RequestInit,
  deadlineMs: number,
): Promise<{ status: number; body: unknown } | null> => {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const stopped = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("deadline"));
    }, deadlineMs);
  });
  stopped.catch(() => {});
  try {
    const response = await Promise.race([
      fetcher(url, { ...init, redirect: "manual", signal: controller.signal }),
      stopped,
    ]);
    if (response.status >= 300 && response.status < 400) {
      response.body?.cancel().catch(() => {});
      return null;
    }
    return { status: response.status, body: await readAnswer(response, stopped) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
};

/** What an answer means: the report as Ronne reads it, or why there isn't one. */
export const outcomeOf = (status: number, body: unknown, semantic: boolean): ScanOutcome => {
  if (status === 200 && body && typeof body === "object") {
    const { exit, report } = body as { exit?: unknown; report?: unknown };
    if (typeof exit !== "number" || !Number.isInteger(exit) || typeof report !== "string")
      return { ok: false, error: "invalid report" };
    // As the command scanner: 0 and 1 are reports (1 means findings over its threshold).
    if (exit !== 0 && exit !== 1) return { ok: false, error: `exit ${exit}` };
    const parsed = parseSkillScan(report, { semantic });
    return parsed.ok ? { ok: true, result: parsed.result } : { ok: false, error: "invalid report" };
  }
  const known = errorOf(body);
  // An answer the service didn't write (the proxy's 502 or 504, a page): it wasn't reached.
  if (known === null) return { ok: false, error: "unreachable" };
  // Busy is the service's 503 only, and the scan key the proxy's 403 only: each by both.
  if (known === "busy") return { ok: false, error: status === 503 ? "busy" : "refused" };
  if (known === "scan key" || known === "not set up")
    return { ok: false, error: status === 403 ? "scan key refused" : "refused" };
  // A Map: a name like `constructor` is not an error Ronne knows.
  return { ok: false, error: SERVICE_ERRORS.get(known) ?? "refused" };
};

export type HttpScannerOptions = {
  url: URL;
  semanticUrl: URL | null;
  key: string | null;
  /** The scan key for the semantic address; the static one's `key` otherwise. */
  semanticKey?: string | null;
  timeoutSeconds: number;
  provider: ScanProvider | null;
  fetch?: typeof fetch;
  /** How long past the scan's timeout Ronne waits; 30 seconds, shorter in tests. */
  graceSeconds?: number;
};

export const httpSkillScanner = (options: HttpScannerOptions): SkillScanner => ({
  async scan(files: readonly ScanFile[], scanOptions = {}): Promise<ScanOutcome> {
    const provider = scanOptions.semantic ? options.provider : null;
    const target = provider ? options.semanticUrl : options.url;
    // A semantic scan needs the semantic service: never the static one, which has no network.
    if (!target) return { ok: false, error: "not configured" };
    const body = JSON.stringify({
      files: files.map((file) => ({
        path: file.path,
        content: Buffer.from(file.bytes).toString("base64"),
        executable: file.executable,
      })),
      semantic: provider !== null,
      timeoutSeconds: options.timeoutSeconds,
      ...(provider ? { provider: provider.variables } : {}),
    });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    // The semantic address has its own key: root's addresses get the scan key only when they
    // answered like the proxy as they were saved (156).
    const key = provider && options.semanticKey !== undefined ? options.semanticKey : options.key;
    if (key) headers[SCAN_KEY_HEADER] = key;
    const answer = await call(
      options.fetch ?? fetch,
      new URL("scan", target),
      { method: "POST", headers, body },
      (options.timeoutSeconds + (options.graceSeconds ?? ANSWER_GRACE_SECONDS)) * 1000,
    );
    if (!answer) return { ok: false, error: "unreachable" };
    return outcomeOf(answer.status, answer.body, provider !== null);
  },
});

/** The scanner's version as the service gives it: short, and only the characters a version has. */
const VERSION = /^[0-9A-Za-z.+-]{1,32}$/;

/** What one `/health` call showed (156): the service itself, the proxy's refusal, or neither. */
type HealthProbe =
  | { kind: "ready"; version: string | null }
  | { kind: "gate" }
  | { kind: "other" }
  | { kind: "none" };

const probeHealth = async (
  url: URL,
  key: string | null,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<HealthProbe> => {
  const headers: Record<string, string> = {};
  if (key) headers[SCAN_KEY_HEADER] = key;
  const answer = await call(fetcher, new URL("health", url), { headers }, timeoutMs);
  if (!answer) return { kind: "none" };
  const { status, body } = answer;
  const error = errorOf(body);
  if (status === 403 && (error === "scan key" || error === "not set up")) return { kind: "gate" };
  // Ready only as the scan service says it: {"scanner": "skillspector", "version": …}.
  if (
    status !== 200 ||
    !body ||
    typeof body !== "object" ||
    (body as { scanner?: unknown }).scanner !== "skillspector"
  )
    return { kind: "other" };
  const version = (body as { version?: unknown }).version;
  return {
    kind: "ready",
    version: typeof version === "string" && VERSION.test(version) ? version : null,
  };
};

/** One short `/health` call, the way Test connection is one request. */
export const serviceHealth = async (
  url: URL,
  key: string | null,
  fetcher: typeof fetch = fetch,
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<ServiceHealth> => {
  const probe = await probeHealth(url, key, fetcher, timeoutMs);
  if (probe.kind === "ready") return { state: "ready", version: probe.version };
  return probe.kind === "gate" ? { state: "scan key refused" } : { state: "unreachable" };
};

/** Why an address root typed was refused (156, decision 7). */
export type ServiceProblem = "not a url" | "unreachable" | "not the scanner" | "scan key refused";

export type ServiceCheck =
  | { ok: true; url: URL; gated: boolean; version: string | null }
  | { ok: false; problem: ServiceProblem };

/**
 * Whether an address root typed is the scan service (156, decision 7). The scan key is never sent
 * to an address that hasn't shown what it is: `/health` is asked without it first, and the address
 * is accepted if it is the service itself, or if it is Ronne's proxy refusing for the key and then
 * ready with it. `gated` says the scan key goes to it. A server that mimics either answer would
 * pass: this stops a typo or the wrong server, not someone who means harm.
 */
export const checkScanService = async (
  text: string,
  key: string | null,
  fetcher: typeof fetch = fetch,
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<ServiceCheck> => {
  const url = parseServiceUrl(text);
  if (!url) return { ok: false, problem: "not a url" };
  const first = await probeHealth(url, null, fetcher, timeoutMs);
  if (first.kind === "ready") return { ok: true, url, gated: false, version: first.version };
  if (first.kind === "none") return { ok: false, problem: "unreachable" };
  if (first.kind === "other") return { ok: false, problem: "not the scanner" };
  // The proxy refused for the key: it needs ours, and ours must be right.
  if (!key) return { ok: false, problem: "scan key refused" };
  const second = await probeHealth(url, key, fetcher, timeoutMs);
  if (second.kind === "ready") return { ok: true, url, gated: true, version: second.version };
  if (second.kind === "gate") return { ok: false, problem: "scan key refused" };
  return { ok: false, problem: second.kind === "none" ? "unreachable" : "not the scanner" };
};

/** The compose install's proxy (156): its ports are the scanner services. */
const COMPOSE_PROXY = "proxy";

/** Each service's state now (156), static first: one short `/health` call each, at once. */
export const scannerServices = async (
  service: {
    url: URL;
    semanticUrl: URL | null;
    key: string | null;
    semanticKey?: string | null;
  },
  fetcher?: typeof fetch,
): Promise<ScannerServiceState[]> => {
  const targets = [
    { kind: "static" as const, url: service.url, key: service.key },
    ...(service.semanticUrl
      ? [
          {
            kind: "semantic" as const,
            url: service.semanticUrl,
            key: service.semanticKey !== undefined ? service.semanticKey : service.key,
          },
        ]
      : []),
  ];
  return Promise.all(
    targets.map(async ({ kind, url, key }) => ({
      kind,
      address: url.origin,
      compose: url.hostname === COMPOSE_PROXY,
      health: await serviceHealth(url, key, fetcher),
    })),
  );
};
