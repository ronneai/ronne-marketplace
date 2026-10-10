import { describe, expect, it } from "vitest";
import {
  limitsFrom,
  limitsLine,
  parseLimit,
  statusMeaning,
  windowText,
} from "./docker-hub-limits.js";

const headers = (values) => new Headers(values);

describe("parseLimit", () => {
  it("reads the count and the window", () => {
    expect(parseLimit("100;w=3600")).toEqual({ count: 100, windowSeconds: 3600 });
    expect(parseLimit(" 97 ; w = 21600")).toEqual({ count: 97, windowSeconds: 21600 });
  });

  it("reads a count without a window, and nothing from what isn't one", () => {
    expect(parseLimit("200")).toEqual({ count: 200, windowSeconds: null });
    expect(parseLimit(null)).toBeNull();
    expect(parseLimit("")).toBeNull();
    expect(parseLimit("many")).toBeNull();
  });
});

describe("windowText", () => {
  it("says hours when it's whole hours, seconds otherwise", () => {
    expect(windowText(3600)).toBe("1 hour");
    expect(windowText(21600)).toBe("6 hours");
    expect(windowText(90)).toBe("90 seconds");
    expect(windowText(null)).toBe("an unstated window");
  });
});

describe("limitsFrom", () => {
  it("reads the limit, what's left and who it counts for", () => {
    const limits = limitsFrom(
      headers({
        "ratelimit-limit": "100;w=3600",
        "ratelimit-remaining": "97;w=3600",
        "docker-ratelimit-source": "70.29.206.34",
      }),
    );
    expect(limits).toEqual({
      limit: 100,
      remaining: 97,
      windowSeconds: 3600,
      source: "70.29.206.34",
    });
    expect(limitsLine("anonymous", limits)).toBe(
      "anonymous: 97 of 100 pulls left per 1 hour (counted for 70.29.206.34)",
    );
  });

  it("is null when the registry sends no limit", () => {
    expect(limitsFrom(headers({ "docker-ratelimit-source": "ronneai" }))).toBeNull();
  });
});

describe("statusMeaning", () => {
  it("tells a refused token, a reached limit and Docker Hub failing apart", () => {
    expect(statusMeaning(401)).toMatch(/refused/);
    expect(statusMeaning(429)).toMatch(/limit is reached/);
    expect(statusMeaning(504)).toMatch(/failed on its side \(not a limit\)/);
    expect(statusMeaning(500)).toMatch(/not a limit/);
    expect(statusMeaning(418)).toBe("an unexpected answer");
  });
});
