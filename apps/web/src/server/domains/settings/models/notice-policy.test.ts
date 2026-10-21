import { describe, expect, it } from "vitest";
import {
  isNoticeHref,
  type NoticeInput,
  noticeContentChanged,
  noticeFrom,
  noticeFromStored,
  noticeParts,
  noticePlainText,
} from "./notice-policy";

const input = (change: Partial<NoticeInput> = {}): NoticeInput => ({
  message: "Maintenance tonight.",
  tone: "info",
  shown: true,
  ...change,
});
const refusal = (change: Partial<NoticeInput>) => {
  const checked = noticeFrom(input(change));
  return checked.ok ? null : checked.refusal;
};

describe("noticeFrom", () => {
  it("trims the words and keeps a link written inline", () => {
    expect(noticeFrom(input({ message: "  Read the [status page](/status) now  " }))).toEqual({
      ok: true,
      notice: { message: "Read the [status page](/status) now", tone: "info", shown: true },
    });
  });

  it("counts characters, not bytes: 500 emoji are allowed, 501 aren't", () => {
    expect(refusal({ message: "😀".repeat(500) })).toBeNull();
    expect(refusal({ message: "😀".repeat(501) })).toEqual({
      field: "message",
      problem: "too_long",
    });
  });

  it("lets an empty message be saved hidden, never shown", () => {
    expect(refusal({ message: "  ", shown: true })).toEqual({ field: "message", problem: "empty" });
    expect(refusal({ message: "", shown: false })).toBeNull();
    expect(refusal({ message: "", shown: "off" })).toBeNull();
  });

  it("refuses line breaks, separators and bidi overrides", () => {
    expect(refusal({ message: "a\nb" })).toEqual({ field: "message", problem: "too_long" });
    expect(refusal({ message: "a\u0000b" })).toMatchObject({ field: "message" });
    for (const bad of ["a b", "a b", "a‮b"])
      expect(refusal({ message: bad })).toMatchObject({ field: "message" });
  });

  it("keeps HTML as typed (the screen outputs text) and allows emoji joiners", () => {
    expect(refusal({ message: "<b>hi</b> <script>x</script>" })).toBeNull();
    expect(refusal({ message: "👩‍💻 ok" })).toBeNull();
  });

  it("checks every link: its words, its address and how many", () => {
    expect(refusal({ message: "[Go](https://example.com) and [home](/)" })).toBeNull();
    expect(refusal({ message: "[](/x)" })).toEqual({ field: "message", problem: "link_label" });
    expect(refusal({ message: "[   ](/x)" })).toEqual({ field: "message", problem: "link_label" });
    expect(refusal({ message: `[${"a".repeat(60)}](/x)` })).toBeNull();
    expect(refusal({ message: `[${"a".repeat(61)}](/x)` })).toEqual({
      field: "message",
      problem: "link_label",
    });
    for (const href of [
      "javascript:alert",
      "JavaScript:alert",
      "data:text/html,x",
      "http://example.com",
      "//example.com",
      "",
      "example.com",
      "/a b",
      "https://user:pw@example.com",
    ])
      expect(refusal({ message: `[Go](${href})` }), href).toEqual({
        field: "message",
        problem: "link_address",
      });
    const four = "[a](/1) [b](/2) [c](/3) [d](/4)";
    expect(refusal({ message: four })).toEqual({ field: "message", problem: "too_many_links" });
    expect(refusal({ message: "[a](/1) [b](/2) [c](/3)" })).toBeNull();
  });

  it("leaves brackets that are not a link alone, a parenthesis inside an address included", () => {
    // `[x](a(b))` is not the shape of a link (no parentheses in an address): it is drawn as typed.
    for (const message of [
      "See [1] and (2)",
      "[x] (y)",
      "[x]",
      "(y)",
      "a [b(c)] d",
      "[a](b",
      "[Go](javascript:alert(1))",
    ])
      expect(refusal({ message }), message).toBeNull();
  });

  it("needs a known tone", () => {
    expect(refusal({ tone: "danger" })).toEqual({ field: "tone", problem: "tone" });
    expect(refusal({ tone: undefined })).toEqual({ field: "tone", problem: "tone" });
  });

  it("reads the checkbox as on, true or 'true' only", () => {
    const shown = (v: unknown) => {
      const c = noticeFrom(input({ shown: v }));
      return c.ok && c.notice.shown;
    };
    expect([shown("on"), shown(true), shown("true")]).toEqual([true, true, true]);
    expect([shown("off"), shown(undefined), shown(1)]).toEqual([false, false, false]);
  });
});

describe("noticeParts", () => {
  it("splits the words around each link, in order", () => {
    expect(
      noticeParts("Read the [status page](/status) before [Friday](https://a.example/f)."),
    ).toEqual([
      { text: "Read the " },
      { label: "status page", href: "/status" },
      { text: " before " },
      { label: "Friday", href: "https://a.example/f" },
      { text: "." },
    ]);
  });

  it("is plain text without a link, and empty for nothing", () => {
    expect(noticeParts("Just words.")).toEqual([{ text: "Just words." }]);
    expect(noticeParts("")).toEqual([]);
  });

  it("draws a link that would not be allowed as the words it is, so a stored value is never trusted", () => {
    expect(noticeParts("x [bad](javascript:alert) y")).toEqual([
      { text: "x [bad](javascript:alert) y" },
    ]);
    expect(noticeParts("x [bad](javascript:alert(1)) y")).toEqual([
      { text: "x [bad](javascript:alert(1)) y" },
    ]);
    expect(noticeParts("[bad](http://a.example) and [ok](/ok)")).toEqual([
      { text: "[bad](http://a.example) and " },
      { label: "ok", href: "/ok" },
    ]);
    expect(noticeParts("[](/x)")).toEqual([{ text: "[](/x)" }]);
  });

  it("links the first three only", () => {
    const parts = noticeParts("[a](/1)[b](/2)[c](/3)[d](/4)");
    expect(parts.filter((part) => "href" in part)).toHaveLength(3);
    expect(parts.at(-1)).toEqual({ text: "[d](/4)" });
  });

  it("never turns a tag into anything but text", () => {
    expect(noticeParts("<b>x</b> [<i>y</i>](/z)")).toEqual([
      { text: "<b>x</b> " },
      { label: "<i>y</i>", href: "/z" },
    ]);
  });

  it("gives the words that are seen, for counting", () => {
    expect(noticePlainText("Read [this](/a) now")).toBe("Read this now");
  });
});

describe("isNoticeHref", () => {
  it.each(["https://example.com", "https://example.com/a?b=1#c", "/", "/catalogue?type=skill"])(
    "allows %s",
    (href) => expect(isNoticeHref(href)).toBe(true),
  );

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<b>x</b>",
    "http://example.com",
    "//example.com",
    "/\\example.com",
    "https://",
    "https:example.com",
    "example.com",
    "",
    "/a b",
    "/a\nb",
    "https://user:pw@example.com",
    "https://bank.com@evil.example/",
    "https://example.com/‮",
    "/​x",
    " /x",
    `/${"a".repeat(2000)}`,
  ])("refuses %j", (href) => expect(isNoticeHref(href)).toBe(false));
});

describe("noticeContentChanged", () => {
  const base = { message: "a", tone: "info" as const, shown: true, revision: 1 };
  it("sees the words and tone, and not the shown flag", () => {
    expect(noticeContentChanged(base, { ...base })).toBe(false);
    expect(noticeContentChanged(base, { ...base, shown: false })).toBe(false);
    expect(noticeContentChanged(base, { ...base, message: "b" })).toBe(true);
    expect(noticeContentChanged(base, { ...base, message: "a [b](/c)" })).toBe(true);
    expect(noticeContentChanged(base, { ...base, tone: "warning" })).toBe(true);
  });
});

describe("noticeFromStored", () => {
  it("reads what was stored and refuses anything else", () => {
    const ok = JSON.stringify({ message: "a", tone: "warning", shown: true, revision: 3 });
    expect(noticeFromStored(ok)).toEqual({
      message: "a",
      tone: "warning",
      shown: true,
      revision: 3,
    });
    for (const bad of [
      "",
      "null",
      "[]",
      "{",
      '{"message":1}',
      '{"message":"a","tone":"x","shown":true,"revision":1}',
      '{"message":"a","tone":"info","shown":true,"revision":-1}',
      '{"message":"a","tone":"info","shown":"yes","revision":1}',
    ])
      expect(noticeFromStored(bad)).toBeNull();
  });
});
