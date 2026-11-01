import { describe, expect, it } from "vitest";
import {
  chooseLocale,
  LOCALE_COOKIE,
  LOCALES,
  type Locale,
  localeCookieOptions,
  matchAcceptLanguage,
  parseLocale,
} from "./locale";

describe("parseLocale (129)", () => {
  it("takes only the supported codes", () => {
    expect(parseLocale("pt")).toBe("pt");
    expect(parseLocale("fr")).toBe("fr");
    expect(parseLocale("en")).toBe("en");
    for (const value of ["", "EN", "pt-BR", "es", " fr", "fr\n", "__proto__", null, undefined])
      expect(parseLocale(value)).toBeNull();
  });
});

describe("matchAcceptLanguage (129)", () => {
  it("matches the primary subtag: pt-PT and pt-BR are pt, fr-CA is fr, en-GB is en", () => {
    expect(matchAcceptLanguage("pt-PT")).toBe("pt");
    expect(matchAcceptLanguage("pt-BR,pt;q=0.9")).toBe("pt");
    expect(matchAcceptLanguage("fr-CA")).toBe("fr");
    expect(matchAcceptLanguage("en-GB")).toBe("en");
    expect(matchAcceptLanguage("FR-ca")).toBe("fr");
  });

  it("finds nothing for languages the app doesn't speak", () => {
    expect(matchAcceptLanguage("es")).toBeNull();
    expect(matchAcceptLanguage("de-DE,es;q=0.8,*;q=0.1")).toBeNull();
    expect(matchAcceptLanguage("*")).toBeNull();
    expect(matchAcceptLanguage("")).toBeNull();
    expect(matchAcceptLanguage(null)).toBeNull();
    expect(matchAcceptLanguage(undefined)).toBeNull();
  });

  it("respects quality values, and the order written for equal ones", () => {
    expect(matchAcceptLanguage("en;q=0.5, fr;q=0.9")).toBe("fr");
    expect(matchAcceptLanguage("fr, pt")).toBe("fr");
    expect(matchAcceptLanguage("pt, fr")).toBe("pt");
    expect(matchAcceptLanguage("es, fr;q=0.5")).toBe("fr");
    expect(matchAcceptLanguage("fr;q=0.8, pt;q=0.800")).toBe("fr");
    expect(matchAcceptLanguage("en;q=1.000, fr;q=0.999")).toBe("en");
  });

  it("skips q=0 (not acceptable) and ranges with a bad weight", () => {
    expect(matchAcceptLanguage("fr;q=0, pt;q=0.1")).toBe("pt");
    // Alone, "not acceptable" is no match at all, not the only choice.
    expect(matchAcceptLanguage("fr;q=0")).toBeNull();
    expect(matchAcceptLanguage("fr;q=0.0, pt;q=0")).toBeNull();
    expect(matchAcceptLanguage("fr;q=0.0000, en")).toBe("en");
    expect(matchAcceptLanguage("fr;q=abc, pt;q=0.1")).toBe("pt");
    expect(matchAcceptLanguage("fr;q=1.5, pt;q=0.1")).toBe("pt");
    expect(matchAcceptLanguage("fr;q=-1, pt;q=0.1")).toBe("pt");
    expect(matchAcceptLanguage("fr;q=0.1234, pt;q=0.1")).toBe("pt");
  });

  it("tolerates spaces, extra parameters and odd tags", () => {
    expect(matchAcceptLanguage("  fr ; q=0.7 ,  pt ; q=0.2 ")).toBe("fr");
    expect(matchAcceptLanguage("pt;foo=bar;q=0.4")).toBe("pt");
    expect(matchAcceptLanguage("i-default")).toBeNull();
    expect(matchAcceptLanguage("français")).toBeNull();
    expect(matchAcceptLanguage(",,;;,,")).toBeNull();
    expect(matchAcceptLanguage("enx")).toBeNull();
    expect(matchAcceptLanguage("e")).toBeNull();
  });

  it("ignores a header that is far too long, and ranges past the 20th", () => {
    expect(matchAcceptLanguage(`${"x".repeat(2000)},fr`)).toBeNull();
    const many = `${Array.from({ length: 20 }, () => "es").join(",")},fr`;
    expect(matchAcceptLanguage(many)).toBeNull();
  });
});

describe("chooseLocale (129)", () => {
  it("prefers the saved language over the cookie and the browser", () => {
    expect(chooseLocale({ saved: "pt", cookie: "fr", acceptLanguage: "en" })).toBe("pt");
  });

  it("falls to the cookie when nothing is saved (automatic)", () => {
    expect(chooseLocale({ saved: null, cookie: "fr", acceptLanguage: "pt" })).toBe("fr");
    expect(chooseLocale({ cookie: "fr", acceptLanguage: "pt" })).toBe("fr");
  });

  it("falls to the browser, then to English", () => {
    expect(chooseLocale({ saved: null, cookie: undefined, acceptLanguage: "pt-PT" })).toBe("pt");
    expect(chooseLocale({ acceptLanguage: "es" })).toBe("en");
    expect(chooseLocale({})).toBe("en");
  });

  it("skips a stale or forged value at each step", () => {
    // A removed saved language counts as automatic; a cookie is validated on every request.
    expect(chooseLocale({ saved: "de", cookie: "fr" })).toBe("fr");
    expect(chooseLocale({ saved: "de", cookie: "xx", acceptLanguage: "pt" })).toBe("pt");
    expect(chooseLocale({ saved: "EN", cookie: "<script>", acceptLanguage: "zz" })).toBe("en");
  });
});

describe("the cookie (129)", () => {
  it("is named ronne-locale and lasts a year, for the whole site", () => {
    expect(LOCALE_COOKIE).toBe("ronne-locale");
    expect(localeCookieOptions).toEqual({
      path: "/",
      maxAge: 31_536_000,
      sameSite: "lax",
      httpOnly: true,
    });
  });
});

describe("chooseLocale with the instance's settings (141)", () => {
  const on = (offered: Locale[], fallback: Locale = "en") => ({
    default: fallback,
    choosing: true,
    offered,
  });
  const off = (fallback: Locale) => ({ default: fallback, choosing: false, offered: LOCALES });

  it("shows the default to everyone with choosing off, whatever they saved, set or ask for", () => {
    expect(
      chooseLocale({ saved: "pt", cookie: "en", acceptLanguage: "pt", instance: off("fr") }),
    ).toBe("fr");
    expect(chooseLocale({ instance: off("pt") })).toBe("pt");
    expect(chooseLocale({ saved: "fr", instance: off("en") })).toBe("en");
  });

  it("uses the saved language when it is offered, before the cookie and the browser", () => {
    const instance = on(["en", "pt", "fr"], "fr");
    expect(chooseLocale({ saved: "pt", cookie: "en", acceptLanguage: "en", instance })).toBe("pt");
  });

  it("skips a saved language that is not offered, for the cookie", () => {
    const instance = on(["en", "fr"], "fr");
    expect(chooseLocale({ saved: "pt", cookie: "en", acceptLanguage: "fr", instance })).toBe("en");
  });

  it("skips a cookie that is not offered, for the browser", () => {
    const instance = on(["en", "fr"], "en");
    expect(chooseLocale({ saved: null, cookie: "pt", acceptLanguage: "fr", instance })).toBe("fr");
  });

  it("takes the best offered match of the browser, not just the first language it names", () => {
    const instance = on(["en", "fr"], "fr");
    expect(chooseLocale({ acceptLanguage: "pt, en;q=0.5", instance })).toBe("en");
    expect(chooseLocale({ acceptLanguage: "pt-BR,pt;q=0.9,fr;q=0.8", instance })).toBe("fr");
  });

  it("ends at the default, not English, when nothing is offered that matches", () => {
    const instance = on(["fr", "pt"], "fr");
    expect(chooseLocale({ acceptLanguage: "en", instance })).toBe("fr");
    expect(chooseLocale({ acceptLanguage: "ja", instance })).toBe("fr");
    expect(chooseLocale({ saved: "en", cookie: "en", instance })).toBe("fr");
    expect(chooseLocale({ instance })).toBe("fr");
  });

  it("ignores values that are not languages, as before", () => {
    const instance = on(["en", "pt", "fr"], "pt");
    expect(chooseLocale({ saved: "xx", cookie: "yy", acceptLanguage: "zz", instance })).toBe("pt");
  });

  it("chooses as it always did without settings (before setup, database down)", () => {
    expect(chooseLocale({})).toBe("en");
    expect(chooseLocale({ saved: "pt", cookie: "fr" })).toBe("pt");
    expect(chooseLocale({ acceptLanguage: "fr" })).toBe("fr");
  });

  it("matches the browser among only the offered languages", () => {
    expect(matchAcceptLanguage("pt, fr;q=0.5", ["fr"])).toBe("fr");
    expect(matchAcceptLanguage("pt", ["fr"])).toBeNull();
    expect(matchAcceptLanguage("pt, fr;q=0.5")).toBe("pt");
  });
});
