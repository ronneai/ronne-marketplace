import { describe, expect, it } from "vitest";
import { FLASH_KEYS, FLASH_MAX_LENGTH, parseFlash, serializeFlash } from "./flash";

const cookie = (value: unknown) => JSON.stringify(value);
const good = { i: "abc", t: "ok", k: "draftDeleted", p: {} };

describe("the flash cookie (138)", () => {
  it("reads what serializeFlash wrote", () => {
    const flash = { id: "abc", kind: "ok", key: "draftDeleted", params: { count: 3, name: "A" } };
    expect(parseFlash(serializeFlash(flash as never))).toEqual(flash);
  });

  it("reads a kind-less cookie as ok, and no parameters as none", () => {
    expect(parseFlash(cookie({ i: "abc", k: "draftDeleted" }))).toEqual({
      id: "abc",
      kind: "ok",
      key: "draftDeleted",
      params: {},
    });
  });

  it("ignores a key that is not one of ours", () => {
    expect(parseFlash(cookie({ ...good, k: "somethingElse" }))).toBeNull();
    expect(parseFlash(cookie({ ...good, k: "__proto__" }))).toBeNull();
    expect(parseFlash(cookie({ ...good, k: ["draftDeleted"] }))).toBeNull();
  });

  it("ignores a kind that is not one of ours", () => {
    expect(parseFlash(cookie({ ...good, t: "success" }))).toBeNull();
  });

  it("ignores anything that is not JSON, or not an object", () => {
    for (const value of ["", "not json", "{", "null", "[]", '"draftDeleted"', "7", undefined, null])
      expect(parseFlash(value as string), String(value)).toBeNull();
  });

  it("ignores a value over the size limit, even if every part of it is valid", () => {
    // Five parameters of 199 characters: each is allowed, together they are over 1 KiB.
    const p = Object.fromEntries(["a", "b", "c", "d", "e"].map((name) => [name, "x".repeat(199)]));
    const big = cookie({ ...good, p });
    expect(big.length).toBeGreaterThan(FLASH_MAX_LENGTH);
    expect(parseFlash(big)).toBeNull();
    // And just under the limit it is read.
    const fits = cookie({ ...good, p: { a: "x".repeat(199), b: "x".repeat(199) } });
    expect(fits.length).toBeLessThan(FLASH_MAX_LENGTH);
    expect(parseFlash(fits)).not.toBeNull();
  });

  it("ignores parameters that are not short text or numbers", () => {
    for (const p of [
      { name: { a: 1 } },
      { name: [1] },
      { name: null },
      { name: true },
      { name: "x".repeat(201) },
      { name: Number.POSITIVE_INFINITY },
      { "bad name": "x" },
      { "": "x" },
      { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 },
      [1],
      "text",
    ])
      expect(parseFlash(cookie({ ...good, p })), JSON.stringify(p)).toBeNull();
  });

  it("needs an id, and a short one", () => {
    expect(parseFlash(cookie({ ...good, i: undefined }))).toBeNull();
    expect(parseFlash(cookie({ ...good, i: "" }))).toBeNull();
    expect(parseFlash(cookie({ ...good, i: "x".repeat(65) }))).toBeNull();
    expect(parseFlash(cookie({ ...good, i: 7 }))).toBeNull();
  });

  it("keeps markup in a parameter as the text it is", () => {
    const markup = "<img src=x onerror=alert(1)><b>bold</b>";
    expect(parseFlash(cookie({ ...good, p: { name: markup } }))?.params).toEqual({ name: markup });
  });

  it("names only messages that exist in every language", async () => {
    for (const locale of ["en", "pt", "fr"]) {
      const messages = (await import(`../../messages/${locale}/common.json`)).default;
      for (const key of FLASH_KEYS) expect(messages.flash[key], `${locale} ${key}`).toBeTruthy();
    }
  });
});
