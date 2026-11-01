import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const language = vi.hoisted(() => ({ languagePolicy: vi.fn() }));
const request = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  acceptLanguage: undefined as string | undefined,
}));
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("@/server/domains/settings/actions/language", () => language);
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

import { requestChoosableLocales, requestLocale } from "./server";

beforeEach(() => {
  session.getCurrentUser.mockReset();
  session.getCurrentUser.mockResolvedValue(null);
  language.languagePolicy.mockReset();
  language.languagePolicy.mockRejectedValue(new Error("not set up"));
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

describe("requestLocale with the instance's settings (141)", () => {
  it("shows the default to everyone with choosing off, signed in or not", async () => {
    language.languagePolicy.mockResolvedValue({
      default: "fr",
      choice: false,
      offered: ["en", "pt", "fr"],
    });
    session.getCurrentUser.mockResolvedValue({ id: "u", locale: "pt" });
    request.cookie = "en";
    request.acceptLanguage = "pt";
    expect(await requestLocale()).toBe("fr");
    session.getCurrentUser.mockResolvedValue(null);
    expect(await requestLocale()).toBe("fr");
  });

  it("counts only the offered languages with choosing on, and ends at the default", async () => {
    language.languagePolicy.mockResolvedValue({
      default: "fr",
      choice: true,
      offered: ["en", "fr"],
    });
    session.getCurrentUser.mockResolvedValue({ id: "u", locale: "pt" });
    request.cookie = "en";
    expect(await requestLocale()).toBe("en");
    request.cookie = undefined;
    request.acceptLanguage = "pt";
    expect(await requestLocale()).toBe("fr");
  });

  it("reads choosing as off when no language besides the default is offered", async () => {
    language.languagePolicy.mockResolvedValue({ default: "pt", choice: true, offered: ["pt"] });
    session.getCurrentUser.mockResolvedValue({ id: "u", locale: "en" });
    request.acceptLanguage = "en";
    expect(await requestLocale()).toBe("pt");
  });

  it("chooses as before when the settings can't be read, even with a session", async () => {
    language.languagePolicy.mockRejectedValue(new Error("database is down"));
    session.getCurrentUser.mockResolvedValue({ id: "u", locale: "pt" });
    expect(await requestLocale()).toBe("pt");
    session.getCurrentUser.mockResolvedValue(null);
    request.acceptLanguage = "ja";
    expect(await requestLocale()).toBe("en");
  });
});

describe("requestChoosableLocales (141)", () => {
  it("is none while choosing is off, so the switches hide", async () => {
    language.languagePolicy.mockResolvedValue({
      default: "fr",
      choice: false,
      offered: ["en", "pt", "fr"],
    });
    expect(await requestChoosableLocales()).toEqual([]);
  });

  it("is the offered languages while choosing is on", async () => {
    language.languagePolicy.mockResolvedValue({
      default: "fr",
      choice: true,
      offered: ["en", "fr"],
    });
    expect(await requestChoosableLocales()).toEqual(["en", "fr"]);
  });

  it("is none when only the default is offered: there is nothing to choose", async () => {
    language.languagePolicy.mockResolvedValue({ default: "pt", choice: true, offered: ["pt"] });
    expect(await requestChoosableLocales()).toEqual([]);
  });

  it("is every language when the settings can't be read (before setup, database down)", async () => {
    language.languagePolicy.mockRejectedValue(new Error("database is down"));
    expect(await requestChoosableLocales()).toEqual(["en", "pt", "fr"]);
  });
});
