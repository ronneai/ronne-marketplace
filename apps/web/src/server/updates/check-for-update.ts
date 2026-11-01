import { compareNewestFirst } from "@ronneai/core";
import type { UpdateFailure } from "../domains/settings/models/update-check";

/**
 * The upgrade check's request and its reading (feature 140): ask GitHub for the latest release of
 * Ronne AI Marketplace and say whether it is newer than the running version. Pure: `fetch` and the
 * clock come in, so a test never reaches the internet, and nothing here knows the schedule, the
 * settings or the notification.
 *
 * The request says nothing about the instance: a fixed `User-Agent` (GitHub requires one), no
 * version, no address, no credentials. Redirects are followed only within api.github.com, and the
 * answer is read up to 1 MiB.
 */
export const RELEASE_URL = "https://api.github.com/repos/ronneai/ronne-marketplace/releases/latest";
export const USER_AGENT = "ronne-marketplace";
export const TIMEOUT_MS = 10_000;
export const MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const RELEASE_HOST = new URL(RELEASE_URL).host;

/** Why a check failed: short and fixed, shown in Settings, never a response body. */
export type { UpdateFailure } from "../domains/settings/models/update-check";

export type UpdateCheck =
  | {
      ok: true;
      /** The latest release's version, without the `v`. */
      latest: string;
      /** Its release notes' page. */
      url: string;
      /** Whether it is a stable version newer than the running one. */
      newer: boolean;
    }
  | { ok: false; reason: UpdateFailure };

export type CheckOptions = {
  fetch: typeof fetch;
  /** The running version, from `apps/web/package.json`. */
  current: string;
};

/** Strict semver: no leading zeros, no empty identifiers, no build metadata; at most 64 characters. */
const NUM = "(?:0|[1-9]\\d{0,8})";
const PRE = "(?:0|[1-9]\\d{0,8}|\\d*[A-Za-z-][0-9A-Za-z-]*)";
const SEMVER = new RegExp(`^${NUM}\\.${NUM}\\.${NUM}(?:-${PRE}(?:\\.${PRE})*)?$`);
const MAX_TAG = 64;

const failed = (reason: UpdateFailure): UpdateCheck => ({ ok: false, reason });

/** `promise`, or a rejection as soon as `signal` aborts: the deadline covers a body that stalls. */
const untilAborted = <T>(promise: Promise<T>, signal: AbortSignal): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    promise.then(resolve, reject);
  });

/** Reads at most MAX_BYTES of the body; null when it is longer. */
const readLimited = async (response: Response, signal: AbortSignal): Promise<string | null> => {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) return null;
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await untilAborted(reader.read(), signal);
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
};

/** The request, following redirects by hand so none can leave api.github.com. */
const get = async (doFetch: typeof fetch, signal: AbortSignal): Promise<Response | null> => {
  let url = RELEASE_URL;
  for (let hops = 0; hops <= MAX_REDIRECTS; hops++) {
    const response = await doFetch(url, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      headers: { "User-Agent": USER_AGENT, Accept: "application/vnd.github+json" },
      signal,
    });
    if (response.status < 300 || response.status >= 400) return response;
    // Nothing in a redirect's body is wanted: release the connection before going on or giving up.
    await response.body?.cancel().catch(() => undefined);
    const location = response.headers.get("location");
    if (!location) return null;
    const next = new URL(location, url);
    if (next.protocol !== "https:" || next.host !== RELEASE_HOST) return null;
    url = next.href;
  }
  return null;
};

export const checkForUpdate = async ({
  fetch: doFetch,
  current,
}: CheckOptions): Promise<UpdateCheck> => {
  // A running version that isn't semver (a broken package.json) must show, not pass for "up to date".
  if (!SEMVER.test(current.replace(/\+.*$/, ""))) return failed("bad_answer");
  // One deadline for the whole check: every redirect and the reading of the body.
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let response: Response | null;
  try {
    response = await get(doFetch, signal);
  } catch {
    return failed("unreachable");
  }
  if (!response) return failed("bad_answer");
  if (response.status === 403 || response.status === 429) return failed("rate_limited");
  if (!response.ok) return failed("unreachable");
  let body: string | null;
  try {
    body = await readLimited(response, signal);
  } catch {
    return failed("unreachable");
  }
  if (body === null) return failed("bad_answer");
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return failed("bad_answer");
  }
  const release = json as { tag_name?: unknown } | null;
  const name = release?.tag_name;
  if (typeof name !== "string" || name.length > MAX_TAG || !name.startsWith("v")) {
    return failed("bad_answer");
  }
  const latest = name.slice(1);
  if (!SEMVER.test(latest)) return failed("bad_answer");
  // The notes' page is built from the version, never taken from the answer.
  const url = `https://github.com/ronneai/ronne-marketplace/releases/tag/v${latest}`;
  // GitHub leaves pre-releases out of "latest"; a tag with one is not announced anyway.
  const stable = !latest.includes("-");
  return { ok: true, latest, url, newer: stable && compareNewestFirst(latest, current) < 0 };
};
