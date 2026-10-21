import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isLocale, LOCALE_NAMES, LOCALES } from "./locale";

describe("locales (129)", () => {
  it("are English, Portuguese and French, with English the default", () => {
    expect([...LOCALES]).toEqual(["en", "pt", "fr"]);
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("recognises only the supported codes", () => {
    for (const code of LOCALES) expect(isLocale(code)).toBe(true);
    for (const value of ["", "EN", "pt-BR", "es", "auto", null, undefined, 1, {}])
      expect(isLocale(value)).toBe(false);
  });

  it("names every language in its own", () => {
    expect(Object.keys(LOCALE_NAMES).sort()).toEqual([...LOCALES].sort());
    expect(LOCALE_NAMES.pt).toBe("Português");
    expect(LOCALE_NAMES.fr).toBe("Français");
  });
});
