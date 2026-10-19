import { describe, expect, it } from "vitest";
import { cutBody, scrubOtherEmails } from "./user-data";

describe("scrubOtherEmails (104)", () => {
  it("replaces every address but the person's, at any depth and inside sentences", () => {
    expect(
      scrubOtherEmails(
        {
          email: "Bob@Example.com",
          me: "ANA@example.com",
          nested: { list: ["x", "wrote to bob@example.com and ana@example.com"], n: 3, ok: true },
          none: null,
        },
        "ana@example.com",
      ),
    ).toEqual({
      email: "[other]",
      me: "ANA@example.com",
      nested: { list: ["x", "wrote to [other] and ana@example.com"], n: 3, ok: true },
      none: null,
    });
  });
});

describe("scrubOtherEmails keys and items (104)", () => {
  it("scrubs keys, and leaves an item's name@version alone", () => {
    expect(
      scrubOtherEmails({ "carol@example.org": 1, name: "@team/x@1.0.0" }, "ana@example.com"),
    ).toEqual({ "[other]": 1, name: "@team/x@1.0.0" });
    expect(
      scrubOtherEmails(
        {
          a: "https://x.test/u?to=zed@example.com",
          b: "team/zed@example.com",
          c: "x@team/y@1.0.0",
          d: "@x/bob@1.2.3-foo.example.com",
          e: "@x/y@1.0.0-rc.1",
        },
        "ana@example.com",
      ),
    ).toEqual({
      a: "[other]",
      b: "[other]",
      c: "x@team/y@1.0.0",
      d: "@[other]",
      e: "@x/y@1.0.0-rc.1",
    });
  });
});

describe("cutBody (104)", () => {
  it("keeps a body within the limit and cuts a longer one with an ellipsis", () => {
    expect(cutBody("abc", 3)).toEqual({ body: "abc", cut: false });
    expect(cutBody("abcd", 3)).toEqual({ body: "abc…", cut: true });
  });

  it("counts characters, not UTF-16 units", () => {
    expect(cutBody("😀😀😀", 2)).toEqual({ body: "😀😀…", cut: true });
  });
});
