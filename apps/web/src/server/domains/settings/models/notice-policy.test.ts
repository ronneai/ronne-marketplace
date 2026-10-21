import { describe, expect, it } from "vitest";
import {
  isNoticeHref,
  type NoticeInput,
  noticeContentChanged,
  noticeFrom,
  noticeFromStored,
} from "./notice-policy";

const input = (change: Partial<NoticeInput> = {}): NoticeInput => ({
  message: "Maintenance tonight.",
  linkLabel: "",
  linkHref: "",
  tone: "info",
  shown: true,
  ...change,
});
const refusal = (change: Partial<NoticeInput>) => {
  const checked = noticeFrom(input(change));
  return checked.ok ? null : checked.refusal;
};

describe("noticeFrom", () => {
  it("trims the words and takes a link with both parts", () => {
    expect(
      noticeFrom(input({ message: "  Hi  ", linkLabel: " Status ", linkHref: " /status " })),
    ).toEqual({
      ok: true,
      notice: {
        message: "Hi",
        link: { label: "Status", href: "/status" },
        tone: "info",
        shown: true,
      },
    });
  });

  it("counts characters, not bytes: 500 emoji are allowed, 501 aren't", () => {
    expect(refusal({ message: "😀".repeat(500) })).toBeNull();
    expect(refusal({ message: "😀".repeat(501) })).toEqual({
      field: "message",
      problem: "too_long",
    });
    expect(refusal({ linkLabel: "a".repeat(60), linkHref: "/x" })).toBeNull();
    expect(refusal({ linkLabel: "a".repeat(61), linkHref: "/x" })).toEqual({
      field: "linkLabel",
      problem: "too_long",
    });
  });

  it("lets an empty message be saved hidden, never shown", () => {
    expect(refusal({ message: "  ", shown: true })).toEqual({ field: "message", problem: "empty" });
    expect(refusal({ message: "", shown: false })).toBeNull();
    expect(refusal({ message: "", shown: "off" })).toBeNull();
  });

  it("refuses line breaks and other control characters in the words and the label", () => {
    expect(refusal({ message: "a\nb" })).toEqual({ field: "message", problem: "too_long" });
    expect(refusal({ message: "a\u0000b" })).toMatchObject({ field: "message" });
    expect(refusal({ linkLabel: "a\tb", linkHref: "/x" })).toMatchObject({ field: "linkLabel" });
    // Line and paragraph separators, and a bidi override, are line breaks and reordering too.
    for (const bad of ["a\u2028b", "a\u2029b", "a\u202eb"])
      expect(refusal({ message: bad })).toMatchObject({ field: "message" });
  });

  it("keeps HTML as typed (the screen outputs text) and allows emoji joiners", () => {
    expect(refusal({ message: "<b>hi</b> <script>x</script>" })).toBeNull();
    expect(refusal({ message: "👩\u200d💻 ok" })).toBeNull();
  });

  it("needs both parts of a link, and a known tone", () => {
    expect(refusal({ linkLabel: "Go" })).toEqual({ field: "linkHref", problem: "link_incomplete" });
    expect(refusal({ linkHref: "/x" })).toEqual({ field: "linkLabel", problem: "link_incomplete" });
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
    "https://example.com/\u202e",
    "/\u200bx",
    ` /x`,
    `/${"a".repeat(2000)}`,
  ])("refuses %j", (href) => expect(isNoticeHref(href)).toBe(false));
});

describe("noticeContentChanged", () => {
  const base = {
    message: "a",
    link: { label: "l", href: "/x" },
    tone: "info" as const,
    shown: true,
    revision: 1,
  };
  it("sees the words, link and tone, and not the shown flag", () => {
    expect(noticeContentChanged(base, { ...base })).toBe(false);
    expect(noticeContentChanged(base, { ...base, shown: false })).toBe(false);
    expect(noticeContentChanged(base, { ...base, message: "b" })).toBe(true);
    expect(noticeContentChanged(base, { ...base, tone: "warning" })).toBe(true);
    expect(noticeContentChanged(base, { ...base, link: null })).toBe(true);
    expect(noticeContentChanged(base, { ...base, link: { label: "l", href: "/y" } })).toBe(true);
  });
});

describe("noticeFromStored", () => {
  it("reads what was stored and refuses anything else", () => {
    const ok = JSON.stringify({
      message: "a",
      link: null,
      tone: "warning",
      shown: true,
      revision: 3,
    });
    expect(noticeFromStored(ok)).toEqual({
      message: "a",
      link: null,
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
