import { describe, expect, it } from "vitest";
import {
  backTo,
  choiceOf,
  chooseHref,
  currentFrom,
  viewedWorkspace,
  withWorkspace,
} from "./current-workspace";

const members = [{ name: "ana" }, { name: "global" }, { name: "acme" }];

describe("currentFrom", () => {
  it("is the cookie's workspace only while the user is a member of it", () => {
    expect(currentFrom("acme", members)).toBe("acme");
    expect(currentFrom(undefined, members)).toBeNull();
    expect(currentFrom("", members)).toBeNull();
    // Left it, renamed (113: the old name answers as unknown), deleted, or someone else's.
    expect(currentFrom("old-acme", members)).toBeNull();
    expect(currentFrom("secret", members)).toBeNull();
    expect(currentFrom("acme", [])).toBeNull();
  });
});

describe("viewedWorkspace", () => {
  it("takes ?workspace= first, whatever the current workspace", () => {
    expect(viewedWorkspace("acme", null)).toEqual({ workspace: "acme", redirect: false });
    expect(viewedWorkspace("other", "acme")).toEqual({ workspace: "other", redirect: false });
    expect(viewedWorkspace(["first", "second"], null)).toEqual({
      workspace: "first",
      redirect: false,
    });
  });

  it("reads empty as every workspace, even with a current one", () => {
    for (const all of ["", "  "])
      expect(viewedWorkspace(all, "acme"), all).toEqual({ workspace: null, redirect: false });
  });

  it("reads all as the workspace named all, which may exist, and lowercases names", () => {
    expect(viewedWorkspace("all", "acme")).toEqual({ workspace: "all", redirect: false });
    expect(viewedWorkspace(" ACME ", null)).toEqual({ workspace: "acme", redirect: false });
  });

  it("without the parameter, shows the current workspace and redirects so the URL says it", () => {
    expect(viewedWorkspace(undefined, "acme")).toEqual({ workspace: "acme", redirect: true });
    expect(viewedWorkspace(undefined, null)).toEqual({ workspace: null, redirect: false });
  });
});

describe("withWorkspace", () => {
  it("sets ?workspace= and keeps the rest of the query", () => {
    expect(withWorkspace("/catalogue", {}, "acme")).toBe("/catalogue?workspace=acme");
    expect(
      withWorkspace("/catalogue", { q: "lint", type: ["skill", "rule"], workspace: "x" }, "a b"),
    ).toBe("/catalogue?q=lint&type=skill&type=rule&workspace=a+b");
  });
});

describe("chooseHref", () => {
  it("links to the route with the choice and the page to come back to", () => {
    expect(chooseHref("acme", "/catalogue?q=x")).toBe(
      "/current-workspace?set=acme&next=%2Fcatalogue%3Fq%3Dx",
    );
    expect(chooseHref(null, "/reviews")).toBe("/current-workspace?set=&next=%2Freviews");
  });
});

describe("backTo", () => {
  it("goes back to a path on this site, without its ?workspace=", () => {
    expect(backTo("/catalogue?q=lint&workspace=acme")).toBe("/catalogue?q=lint");
    expect(backTo("/workspaces/acme")).toBe("/workspaces/acme");
  });

  it("never leaves the site", () => {
    for (const next of [
      null,
      "",
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "/\t/evil.test",
      "/a/..//evil.test",
      "/%2e%2e//evil.test",
      "/a/..//x//evil.test",
      "javascript:alert(1)",
    ])
      expect(backTo(next), String(next)).toBe("/");
  });
});

describe("choiceOf", () => {
  it("sets a workspace the user is a member of, and clears for empty", () => {
    expect(choiceOf("acme", members)).toEqual({ action: "set", name: "acme" });
    expect(choiceOf("ACME", members)).toEqual({ action: "set", name: "acme" });
    expect(choiceOf("", members)).toEqual({ action: "clear" });
    expect(choiceOf(null, members)).toEqual({ action: "clear" });
  });

  it("treats a workspace named all like any other (names may be all)", () => {
    expect(choiceOf("all", [...members, { name: "all" }])).toEqual({ action: "set", name: "all" });
    expect(choiceOf("all", members)).toEqual({ action: "keep" });
  });

  it("changes nothing for a workspace the user isn't in, private or not", () => {
    expect(choiceOf("secret", members)).toEqual({ action: "keep" });
  });
});
