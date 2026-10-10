import { describe, expect, it } from "vitest";
import { parseLimit, parseSearch, parseSort, parseType, parseWorkspace } from "./api-query";

describe("API query parsing", () => {
  it("reads limit, 20 by default, from 1 to 100", () => {
    expect(parseLimit(null)).toEqual({ ok: true, value: 20 });
    expect(parseLimit("100")).toEqual({ ok: true, value: 100 });
    for (const bad of ["0", "101", "-1", "1.5", "ten"]) expect(parseLimit(bad).ok).toBe(false);
  });

  it("refuses unknown types and sorts instead of ignoring them", () => {
    expect(parseType("skill")).toEqual({ ok: true, value: "skill" });
    expect(parseType(null)).toEqual({ ok: true, value: null });
    expect(parseType("widget")).toMatchObject({ ok: false });
    expect(parseSort(null)).toEqual({ ok: true, value: "recent" });
    expect(parseSort("name")).toEqual({ ok: true, value: "name" });
    expect(parseSort("stars")).toMatchObject({ ok: false });
  });

  it("trims the search and caps its length", () => {
    expect(parseSearch("  fmt ")).toEqual({ ok: true, value: "fmt" });
    expect(parseSearch("x".repeat(101))).toMatchObject({ ok: false });
  });

  it("reads a workspace's name trimmed and lowercased, none when empty (095)", () => {
    expect(parseWorkspace(" Acme ")).toEqual({ ok: true, value: "acme" });
    expect(parseWorkspace(null)).toEqual({ ok: true, value: null });
    expect(parseWorkspace("  ")).toEqual({ ok: true, value: null });
    expect(parseWorkspace("x".repeat(64))).toEqual({ ok: true, value: "x".repeat(64) });
    expect(parseWorkspace("x".repeat(65))).toMatchObject({ ok: false });
  });
});
