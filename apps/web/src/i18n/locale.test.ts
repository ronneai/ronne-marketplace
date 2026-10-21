import { describe, expect, it } from "vitest";
import {
  chooseLocale,
  LOCALE_COOKIE,
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
