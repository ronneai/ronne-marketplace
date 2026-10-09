// Docker Hub's pull limits, as its registry reports them (docs/knowledge/docker-hub-pulls.md).
// Every image lookup answers with `ratelimit-limit` and `ratelimit-remaining`, such as
// "100;w=3600" (100 pulls in a window of 3600 seconds), and `docker-ratelimit-source`: the IP
// address an anonymous pull counts against, or the account a signed-in one does. Looking up
// ratelimitpreview/test, the image Docker provides for this, doesn't use a pull.

export const TOKEN_URL =
  "https://auth.docker.io/token?service=registry.docker.io&scope=repository:ratelimitpreview/test:pull";
export const MANIFEST_URL =
  "https://registry-1.docker.io/v2/ratelimitpreview/test/manifests/latest";

/** "100;w=3600" → { count: 100, windowSeconds: 3600 }; null when it isn't there or can't be read. */
export const parseLimit = (value) => {
  const match = /^\s*(\d+)\s*(?:;\s*w\s*=\s*(\d+))?/.exec(value ?? "");
  if (!match) return null;
  return { count: Number(match[1]), windowSeconds: match[2] ? Number(match[2]) : null };
};

/** 3600 → "1 hour", 21600 → "6 hours", 90 → "90 seconds". */
export const windowText = (seconds) => {
  if (seconds === null) return "an unstated window";
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  return `${seconds} seconds`;
};

/** What a failed request means, in a few words, by its HTTP status. */
export const statusMeaning = (status) => {
  if (status === 401)
    return "the username and token were refused: wrong, revoked or another account's";
  if (status === 429) return "the pull limit is reached";
  if (status >= 500) return "Docker Hub failed on its side (not a limit); try again later";
  return "an unexpected answer";
};

/**
 * The limits from the lookup's headers (a `Headers` or any object with `get`), or null when the
 * registry didn't send them.
 */
export const limitsFrom = (headers) => {
  const limit = parseLimit(headers.get("ratelimit-limit"));
  const remaining = parseLimit(headers.get("ratelimit-remaining"));
  if (!limit || !remaining) return null;
  return {
    limit: limit.count,
    remaining: remaining.count,
    windowSeconds: limit.windowSeconds,
    source: headers.get("docker-ratelimit-source") ?? "unknown",
  };
};

/** One line for a check that worked: "anonymous: 97 of 100 pulls left per 1 hour (counted for 1.2.3.4)". */
export const limitsLine = (who, limits) =>
  `${who}: ${limits.remaining} of ${limits.limit} pulls left per ${windowText(limits.windowSeconds)} (counted for ${limits.source})`;
