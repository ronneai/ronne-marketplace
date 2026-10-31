import { describe, expect, it } from "vitest";
import { decodeParams, encodeParams, isNotificationKind, MAX_PARAMS_BYTES } from "./notification";

describe("notification parameters", () => {
  it("round-trips flat values", () => {
    const params = { item: "@a/b", version: "1.0.0", n: 2, ok: true, none: null };
    expect(decodeParams(encodeParams(params))).toEqual(params);
  });

  it("refuses parameters over the limit and nested values", () => {
    expect(() => encodeParams({ text: "x".repeat(MAX_PARAMS_BYTES) })).toThrow(/bytes/);
    expect(() => encodeParams({ nested: { a: 1 } } as never)).toThrow(/nested/);
    expect(() => encodeParams({ n: Number.NaN })).toThrow(/finite/);
  });

  it("reads anything unreadable as an empty set", () => {
    for (const text of ["", "nope", "[1]", "null", '"x"']) expect(decodeParams(text)).toEqual({});
    expect(decodeParams('{"a":{"b":1},"c":"d"}')).toEqual({ c: "d" });
  });

  it("knows its kinds", () => {
    expect(isNotificationKind("submission.approved")).toBe(true);
    expect(isNotificationKind("submission.exploded")).toBe(false);
  });
});
