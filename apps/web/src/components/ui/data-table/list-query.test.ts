import { describe, expect, it } from "vitest";
import { defineList, isDay, isFiltered, listUrl, parseListQuery, sortUrl } from "./list-query";

const LIST = defineList({
  path: "/admin/things",
  sorts: { time: "desc", name: "asc" },
  defaultSort: "time",
  sizes: [25, 50, 100],
  defaultSize: 50,
  filters: { q: "string", from: "day" },
});

describe("parseListQuery (060)", () => {
  it("reads a valid view", () => {
    expect(
      parseListQuery(LIST, {
        sort: "name",
        dir: "desc",
        size: "25",
        cursor: "abc",
        q: "  alex ",
        from: "2026-10-01",
      }),
    ).toEqual({
      sort: "name",
      dir: "desc",
      size: 25,
      cursor: "abc",
      filters: { q: "alex", from: "2026-10-01" },
    });
  });

  it("falls back to the defaults for anything it doesn't allow", () => {
    expect(
      parseListQuery(LIST, {
        sort: "secret",
        dir: "sideways",
        size: "1000",
        cursor: "x".repeat(2000),
        from: "2026-02-30",
        q: ["first", "second"],
      }),
    ).toEqual({
      sort: "time",
      dir: "desc",
      size: 50,
      cursor: undefined,
      filters: { q: "first", from: "" },
    });
    // A sort without a direction starts in that sort's own.
    expect(parseListQuery(LIST, { sort: "name" }).dir).toBe("asc");
    expect(parseListQuery(LIST, { q: "y".repeat(300) }).filters.q).toHaveLength(200);
  });
});

describe("listUrl and sortUrl (060)", () => {
  const state = parseListQuery(LIST, { q: "alex", cursor: "c1" });

  it("leaves defaults out, so the default view is the plain path", () => {
    expect(listUrl(LIST, parseListQuery(LIST, {}))).toBe("/admin/things");
    expect(listUrl(LIST, state)).toBe("/admin/things?q=alex&cursor=c1");
  });

  it("drops the cursor when the sort, size or a filter changes; keeps it otherwise", () => {
    expect(listUrl(LIST, state, { size: 25 })).toBe("/admin/things?q=alex&size=25");
    expect(listUrl(LIST, state, { filters: { q: "" } })).toBe("/admin/things");
    expect(listUrl(LIST, state, { cursor: "c2" })).toBe("/admin/things?q=alex&cursor=c2");
    expect(listUrl(LIST, state, { cursor: null })).toBe("/admin/things?q=alex");
    expect(listUrl(LIST, state, {}, { event: "E1" })).toBe(
      "/admin/things?q=alex&cursor=c1&event=E1",
    );
  });

  it("sorts by a new key in its own direction, and flips the current one", () => {
    expect(sortUrl(LIST, state, "name")).toBe("/admin/things?q=alex&sort=name");
    expect(sortUrl(LIST, state, "time")).toBe("/admin/things?q=alex&dir=asc");
    const byName = parseListQuery(LIST, { sort: "name" });
    expect(sortUrl(LIST, byName, "name")).toBe("/admin/things?sort=name&dir=desc");
  });

  it("round-trips: parsing a URL it made gives the same state", () => {
    const view = parseListQuery(LIST, { sort: "name", dir: "desc", size: "100", q: "a&b" });
    const url = new URL(listUrl(LIST, view), "http://x");
    expect(parseListQuery(LIST, Object.fromEntries(url.searchParams))).toEqual(view);
  });
});

describe("helpers", () => {
  it("isDay and isFiltered", () => {
    expect(isDay("2026-10-02")).toBe(true);
    expect(isDay("2026-13-01")).toBe(false);
    expect(isFiltered(parseListQuery(LIST, {}))).toBe(false);
    expect(isFiltered(parseListQuery(LIST, { q: "a" }))).toBe(true);
  });
});

describe("fixed parameters (062)", () => {
  const TAB = defineList({ ...LIST, path: "/reviews", fixed: { tab: "release" } });
  const view = parseListQuery(TAB, { tab: "release", q: "alex", cursor: "c1" });

  it("keeps them first in every URL, through sorting, sizes, filters and Clear", () => {
    expect(listUrl(TAB, parseListQuery(TAB, {}))).toBe("/reviews?tab=release");
    expect(listUrl(TAB, view)).toBe("/reviews?tab=release&q=alex&cursor=c1");
    expect(sortUrl(TAB, view, "name")).toBe("/reviews?tab=release&q=alex&sort=name");
    expect(listUrl(TAB, view, { size: 25 })).toBe("/reviews?tab=release&q=alex&size=25");
    expect(listUrl(TAB, view, { filters: { q: "", from: "" } })).toBe("/reviews?tab=release");
  });

  it("never treats them as filters", () => {
    expect(view.filters).toEqual({ q: "alex", from: "" });
    expect(isFiltered(parseListQuery(TAB, { tab: "release" }))).toBe(false);
  });
});
