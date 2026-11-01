import { describe, expect, it } from "vitest";
import {
  choosing,
  DEFAULT_LANGUAGE_POLICY,
  LANGUAGE_KEYS,
  languagePolicyFrom,
  languagePolicyFromRows,
  languagePolicyRows,
} from "./language-policy";

describe("the language policy (141)", () => {
  it("is every language, English, choosing on, on a new instance", () => {
    expect(DEFAULT_LANGUAGE_POLICY).toEqual({
      default: "en",
      choice: true,
      offered: ["en", "pt", "fr"],
    });
    expect(choosing(DEFAULT_LANGUAGE_POLICY)).toBe(true);
  });

  it("always offers the default, and keeps the app's order", () => {
    expect(languagePolicyFrom({ default: "fr", choice: true, offered: ["pt"] }).offered).toEqual([
      "pt",
      "fr",
    ]);
    expect(languagePolicyFrom({ default: "en", offered: ["fr", "pt", "fr"] }).offered).toEqual([
      "en",
      "pt",
      "fr",
    ]);
  });

  it("drops codes it doesn't know, and reads an empty or broken list as every language", () => {
    expect(languagePolicyFrom({ default: "xx", offered: ["de", "pt"] })).toMatchObject({
      default: "en",
      offered: ["en", "pt"],
    });
    expect(languagePolicyFrom({ offered: [] }).offered).toEqual(["en", "pt", "fr"]);
    expect(languagePolicyFrom({ offered: "pt" }).offered).toEqual(["en", "pt", "fr"]);
    expect(languagePolicyFrom({}).choice).toBe(true);
  });

  it("reads as not choosing when only the default is offered, whatever the switch says", () => {
    const only = languagePolicyFrom({ default: "pt", choice: true, offered: ["pt"] });
    expect(only.choice).toBe(true);
    expect(choosing(only)).toBe(false);
    expect(
      choosing(languagePolicyFrom({ default: "pt", choice: false, offered: ["en", "pt"] })),
    ).toBe(false);
  });

  it("round-trips through the stored rows, and reads a broken row as its default", () => {
    const policy = languagePolicyFrom({ default: "fr", choice: false, offered: ["en", "fr"] });
    const rows = languagePolicyRows(policy);
    expect(rows).toEqual({
      [LANGUAGE_KEYS.default]: "fr",
      [LANGUAGE_KEYS.choice]: "off",
      [LANGUAGE_KEYS.offered]: '["en","fr"]',
    });
    expect(
      languagePolicyFromRows({
        default: rows[LANGUAGE_KEYS.default],
        choice: rows[LANGUAGE_KEYS.choice],
        offered: rows[LANGUAGE_KEYS.offered],
      }),
    ).toEqual(policy);
    expect(languagePolicyFromRows({ default: "fr", choice: "off", offered: "{not json" })).toEqual({
      default: "fr",
      choice: false,
      offered: ["en", "pt", "fr"],
    });
    expect(languagePolicyFromRows({})).toEqual(DEFAULT_LANGUAGE_POLICY);
  });
});
