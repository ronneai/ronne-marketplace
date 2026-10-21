import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const request = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  acceptLanguage: undefined as string | undefined,
}));
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "ronne-locale" && request.cookie ? { value: request.cookie } : undefined,
  }),
  headers: async () =>
    new Headers(request.acceptLanguage ? { "accept-language": request.acceptLanguage } : {}),
}));
// `cache` keeps one answer per request; each test is a new request.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

import { requestLocale } from "./server";

beforeEach(() => {
  session.getCurrentUser.mockReset();
  session.getCurrentUser.mockResolvedValue(null);
  request.cookie = undefined;
  request.acceptLanguage = undefined;
});

describe("requestLocale (129)", () => {
  it("uses the signed-in person's saved language first", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "u", locale: "pt" });
    request.cookie = "fr";
    request.acceptLanguage = "en";
    expect(await requestLocale()).toBe("pt");
  });

  it("falls to the cookie for a person with automatic, then to the browser, then to English", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "u", locale: null });
    request.cookie = "fr";
    expect(await requestLocale()).toBe("fr");
    request.cookie = undefined;
    request.acceptLanguage = "pt-BR";
    expect(await requestLocale()).toBe("pt");
    request.acceptLanguage = "ja";
    expect(await requestLocale()).toBe("en");
  });

  it("serves signed-out pages from the cookie and the browser", async () => {
    request.acceptLanguage = "fr-CA,fr;q=0.9";
    expect(await requestLocale()).toBe("fr");
    request.cookie = "pt";
    expect(await requestLocale()).toBe("pt");
  });

  it("still answers when the session can't be read (not set up, database down)", async () => {
    session.getCurrentUser.mockRejectedValue(new Error("database is down"));
    request.acceptLanguage = "pt";
    expect(await requestLocale()).toBe("pt");
  });
});
