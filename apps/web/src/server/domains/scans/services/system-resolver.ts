import { lookup } from "node:dns/promises";
import type { Resolver } from "../models/endpoint";

/** How long a lookup may take before the endpoint counts as unresolved. */
export const RESOLVE_TIMEOUT_MS = 5000;

/** The system's resolver, as the scanner will use it: every address, IPv4 and IPv6. */
export const systemResolver =
  (timeoutMs = RESOLVE_TIMEOUT_MS): Resolver =>
  async (hostname) => {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("lookup timed out")), timeoutMs);
    });
    try {
      const found = await Promise.race([lookup(hostname, { all: true, verbatim: true }), timeout]);
      return found.map((entry) => entry.address);
    } finally {
      clearTimeout(timer);
    }
  };
