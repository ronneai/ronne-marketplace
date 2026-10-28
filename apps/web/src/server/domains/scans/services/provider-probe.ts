import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIPv6, type LookupFunction } from "node:net";

/**
 * Test connection (136): one GET to the provider's list of models, with the key, saying only
 * whether the provider answered, refused the key, or couldn't be reached. Never item content, and
 * nothing of the answer is kept: its body is discarded unread.
 */
export type ProbeResult = "reached" | "refused" | "unreachable";

export type ProbeTarget = {
  url: URL;
  headers: Record<string, string>;
  /** The addresses the endpoint check resolved: the only ones connected to (null: the system's). */
  addresses: readonly string[] | null;
};

export type Probe = (target: ProbeTarget) => Promise<ProbeResult>;

/** How long Test connection waits for an answer. */
export const PROBE_TIMEOUT_MS = 10_000;

/** A lookup that gives the checked addresses whatever DNS says now, so a changed answer can't redirect it. */
const pinnedLookup =
  (addresses: readonly string[]): LookupFunction =>
  (_hostname, options, callback) => {
    const all = addresses.map((address) => ({ address, family: isIPv6(address) ? 6 : 4 }));
    const first = all[0];
    if (!first) {
      callback(Object.assign(new Error("no address"), { code: "ENOTFOUND" }), "", 0);
      return;
    }
    if (typeof options === "object" && options.all)
      (callback as unknown as (e: null, a: typeof all) => void)(null, all);
    else callback(null, first.address, first.family);
  };

export const providerProbe =
  (timeoutMs = PROBE_TIMEOUT_MS): Probe =>
  (target) =>
    new Promise<ProbeResult>((resolve) => {
      let settled = false;
      const done = (result: ProbeResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const send = target.url.protocol === "https:" ? httpsRequest : httpRequest;
      // Node.js never follows a redirect: a 3xx is an answer from this host, and that's all.
      const request = send(
        target.url,
        {
          method: "GET",
          headers: { ...target.headers, accept: "application/json" },
          ...(target.addresses ? { lookup: pinnedLookup(target.addresses) } : {}),
        },
        (response) => {
          const status = response.statusCode ?? 0;
          response.destroy();
          done(status === 401 || status === 403 ? "refused" : "reached");
        },
      );
      const timer = setTimeout(() => {
        request.destroy();
        done("unreachable");
      }, timeoutMs);
      request.on("error", () => done("unreachable"));
      request.end();
    });

/** Where a provider lists its models (136), and how its key is sent. */
export const probeRequest = (
  provider: string,
  endpoint: string | null,
  key: string | null,
): { url: URL; headers: Record<string, string> } | null => {
  const under = (base: string, path: string) =>
    new URL(path, base.endsWith("/") ? base : `${base}/`);
  const bearer: Record<string, string> = key ? { authorization: `Bearer ${key}` } : {};
  switch (provider) {
    case "openai":
      return { url: under(endpoint ?? "https://api.openai.com/v1", "models"), headers: bearer };
    case "anthropic":
      return {
        url: new URL("https://api.anthropic.com/v1/models"),
        headers: { ...(key ? { "x-api-key": key } : {}), "anthropic-version": "2023-06-01" },
      };
    case "nv_build":
      return { url: new URL("https://integrate.api.nvidia.com/v1/models"), headers: bearer };
    case "azure_openai":
      if (!endpoint) return null;
      return {
        url: under(endpoint, "openai/models?api-version=2024-10-21"),
        headers: key ? { "api-key": key } : {},
      };
    case "openai_compatible":
      return endpoint ? { url: under(endpoint, "models"), headers: bearer } : null;
    case "ollama":
      return endpoint ? { url: under(endpoint, "api/tags"), headers: {} } : null;
    default:
      return null;
  }
};
