import { describe, expect, it } from "vitest";
import { listingOf, searchFieldsOf } from "./listing";

const v = (id: string, day: number, yanked = false) => ({
  id,
  publishedAt: new Date(Date.UTC(2026, 8, day)),
  yankedAt: yanked ? new Date(Date.UTC(2026, 8, 28)) : null,
});

describe("listingOf", () => {
  it("lists the version latest points to, and the newest release's time", () => {
    expect(listingOf([v("a", 1), v("b", 2), v("c", 3)], "b")).toEqual({
      listedVersionId: "b",
      installable: true,
      lastPublishedAt: new Date(Date.UTC(2026, 8, 3)),
    });
  });

  it("falls back to the newest release without latest, and is not installable when all are yanked", () => {
    expect(listingOf([v("a", 1, true), v("b", 2, true)], null)).toMatchObject({
      listedVersionId: "b",
      installable: false,
    });
    expect(listingOf([], null)).toEqual({
      listedVersionId: null,
      installable: false,
      lastPublishedAt: null,
    });
  });
});

describe("searchFieldsOf", () => {
  it("reads the description and keywords, ignoring anything else", () => {
    expect(
      searchFieldsOf({ description: "Checks code.", keywords: ["security", 3, "lint"] }),
    ).toEqual({ description: "Checks code.", keywords: "security lint" });
    expect(searchFieldsOf(null)).toEqual({ description: "", keywords: "" });
  });
});
