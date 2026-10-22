import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkFeedback, FEEDBACK_MESSAGE_MAX, PAGE_ROOTS, pagePathOf } from "./feedback";

describe("pagePathOf", () => {
  it("keeps a path and drops the query and the fragment", () => {
    expect(pagePathOf("/catalogue?q=secret&cursor=abc#top")).toBe("/catalogue");
    expect(pagePathOf("/workspaces/acme")).toBe("/workspaces/acme");
    expect(pagePathOf("/")).toBe("/");
    expect(pagePathOf("/device?code=ABCD-1234")).toBe("/device");
  });

  it("drops anything that is not a path of this app", () => {
    for (const value of [
      "https://evil.example/x",
      "//evil.example",
      "javascript:alert(1)",
      "catalogue",
      "",
      "?q=1",
      "/a/../b",
      "/a b",
      "/<script>",
      "/x\ny",
      `/items/${"a".repeat(200)}`,
      42,
      null,
      undefined,
    ])
      expect(pagePathOf(value), String(value)).toBeNull();
  });

  it("keeps a path of exactly 200 characters", () => {
    const path = `/items/${"a".repeat(193)}`;
    expect(path).toHaveLength(200);
    expect(pagePathOf(path)).toBe(path);
  });
});

describe("PAGE_ROOTS", () => {
  const appDir = new URL("../../../../app/(app)/", import.meta.url).pathname;
  const hasPage = (dir: string): boolean =>
    readdirSync(dir).some((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? hasPage(path) : name === "page.tsx";
    });

  it("is the folders of the signed-in app that hold a page", () => {
    const folders = readdirSync(appDir).filter(
      (name) => statSync(join(appDir, name)).isDirectory() && hasPage(join(appDir, name)),
    );
    expect([...PAGE_ROOTS].sort()).toEqual([...folders].sort());
  });

  it("drops a path whose first part is no page, and keeps one that is", () => {
    expect(pagePathOf("/not-a-route")).toBeNull();
    expect(pagePathOf("/api/v1/items")).toBeNull();
    expect(pagePathOf("/items/@acme/tool?x=1")).toBe("/items/@acme/tool");
    expect(pagePathOf("/feedback")).toBe("/feedback");
  });
});

describe("checkFeedback", () => {
  const ok = { kind: "idea", message: "Dark mode, please" };

  it("accepts a kind, a message and a page", () => {
    expect(checkFeedback({ ...ok, page: "/catalogue?q=x" })).toEqual({
      ok: true,
      feedback: { kind: "idea", message: "Dark mode, please", page: "/catalogue" },
    });
    expect(checkFeedback(ok)).toMatchObject({ ok: true, feedback: { page: null } });
  });

  it("needs one of the four kinds", () => {
    for (const kind of ["", "bug", undefined, 3])
      expect(checkFeedback({ ...ok, kind })).toEqual({ ok: false, problem: "kind_required" });
    for (const kind of ["problem", "idea", "question", "praise"])
      expect(checkFeedback({ ...ok, kind }).ok).toBe(true);
  });

  it("refuses a message of only spaces or nothing", () => {
    for (const message of ["", "   ", "\n\t \r\n", undefined, 5])
      expect(checkFeedback({ ...ok, message })).toEqual({ ok: false, problem: "message_required" });
  });

  it("refuses a message over the limit and accepts one at it", () => {
    expect(checkFeedback({ ...ok, message: "a".repeat(FEEDBACK_MESSAGE_MAX) }).ok).toBe(true);
    expect(checkFeedback({ ...ok, message: "a".repeat(FEEDBACK_MESSAGE_MAX + 1) })).toEqual({
      ok: false,
      problem: "message_too_long",
    });
  });

  it("takes control characters out, so every database can store it", () => {
    expect(checkFeedback({ ...ok, message: "a\u0000b\u0007c\td\ne" })).toMatchObject({
      feedback: { message: "abc\td\ne" },
    });
    expect(checkFeedback({ ...ok, message: "\u0000\u0001" })).toEqual({
      ok: false,
      problem: "message_required",
    });
  });

  it("refuses a message of only invisible characters", () => {
    for (const message of ["\u200B", " \u200B\uFEFF\u2060 ", "\u00AD"])
      expect(checkFeedback({ ...ok, message })).toEqual({ ok: false, problem: "message_required" });
  });

  it("counts characters, not UTF-16 units", () => {
    expect(checkFeedback({ ...ok, message: "😀".repeat(FEEDBACK_MESSAGE_MAX) }).ok).toBe(true);
  });

  it("keeps the message as written, with the line ends made \\n", () => {
    expect(checkFeedback({ ...ok, message: "  a\r\nb\rc <b>x</b>  " })).toMatchObject({
      feedback: { message: "  a\nb\nc <b>x</b>  " },
    });
  });
});
