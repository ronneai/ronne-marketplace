import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/domains/identity/exceptions/errors";
import { InvalidNoticeError } from "@/server/domains/settings/exceptions/errors";
import {
  type NoticeField,
  type NoticeInput,
  noticeFrom,
} from "@/server/domains/settings/models/notice-policy";

const settings = vi.hoisted(() => ({ instanceSettings: vi.fn(), setNotice: vi.fn() }));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/domains/settings/actions/settings", () => settings);
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("next/cache", () => cache);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
// The page's other tabs reach for the server; this file renders only the Notice tab.
vi.mock("@/server/domains/feeds/actions/feeds", () => ({}));
vi.mock("@/server/jobs/actions", () => ({}));
vi.mock("@/server/domains/identity/actions/erase-user", () => ({}));
vi.mock("@/server/domains/identity/actions/two-factor", () => ({}));
vi.mock("@/server/domains/identity/actions/identity-providers", () => ({}));
vi.mock("@/server/domains/identity/actions/password-policy", () => ({}));

const { inLocale } = await import("@/test/intl");
const { saveNotice } = await import("./actions");
const { NoticeForm } = await import("./NoticeForm");
const { NoticeTab } = await import("./NoticeTab");
const { noticeErrorCode } = await import("./types");
const { default: AdminSettingsPage } = await import("@/app/(app)/admin/settings/page");
const english = (await import("../../../../messages/en/admin.json")).default.notice;
const portuguese = (await import("../../../../messages/pt/admin.json")).default.notice;
const french = (await import("../../../../messages/fr/admin.json")).default.notice;

type L = "en" | "pt" | "fr";
const view = (locale: L, node: ReactElement) => inLocale(locale, () => renderToStaticMarkup(node));

const hidden = { message: "", link: null, tone: "info", shown: false } as const;
const shown = {
  message: "The demo's data is reset on Friday.",
  link: { label: "Status", href: "https://status.example.com/" },
  tone: "warning",
  shown: true,
} as const;
const at = new Date("2026-10-21T14:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue({ id: "r", role: "root" });
  settings.instanceSettings.mockResolvedValue({
    notice: { ...hidden, revision: 0, changedAt: null, changedBy: null, changedByName: null },
  });
});

describe("The Notice tab (124)", () => {
  it("is the last tab of Settings, selected by ?tab=notice, with the form and no other panel", async () => {
    const page = await AdminSettingsPage({ searchParams: Promise.resolve({ tab: "notice" }) });
    const html = renderToStaticMarkup(page);
    expect(html).toMatch(/aria-current="page"[^>]*>Notice</);
    expect(html).toContain('href="/admin/settings?tab=notice"');
    expect(html).toContain(`aria-label="${english.title}"`);
    expect(html).not.toContain("Usage reporting");
  });

  it("is a 404 for anyone but root, before anything is read", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "u", role: "user" });
    await expect(
      AdminSettingsPage({ searchParams: Promise.resolve({ tab: "notice" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(settings.instanceSettings).not.toHaveBeenCalled();
  });

  it("starts empty and hidden: every field, the helpers, 'Not set yet.' and no preview", async () => {
    const html = renderToStaticMarkup(await NoticeTab());
    for (const label of [english.message, english.linkLabel, english.linkHref, english.tone])
      expect(html).toContain(`>${label}</label>`);
    expect(html).toContain(english.shown);
    expect(html).toContain(english.neverChanged);
    expect(html).toContain(english.previewEmpty);
    expect(html).toContain("Who sees this?");
    expect(html).toContain("Information or Warning?");
    expect(html).not.toContain("INFO:");
    expect(html).not.toContain(english.saved);
  });

  it("shows what is saved: the words in the fields and the preview, the tone, who changed it and when", async () => {
    settings.instanceSettings.mockResolvedValue({
      notice: { ...shown, revision: 3, changedAt: at, changedBy: "r", changedByName: "Root" },
    });
    const html = renderToStaticMarkup(await NoticeTab());
    expect(html).toContain("The demo&#x27;s data is reset on Friday.");
    expect(html).toContain('value="https://status.example.com/"');
    expect(html).toContain('<option value="warning" selected="">');
    expect(html).toContain("WARN:");
    expect(html).toContain('<a href="https://status.example.com/"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Last changed by Root");
    expect(html).toContain('dateTime="2026-10-21T14:00:00.000Z"');
    expect(html).toMatch(/checked=""/);
  });

  it("says a hidden notice is hidden in its preview, and shows its text kept", () => {
    const html = view(
      "en",
      <NoticeForm notice={{ ...hidden, message: "Back soon." }} changed={null} />,
    );
    expect(html).toContain(english.previewHidden);
    expect(html).toContain("Back soon.");
  });

  it("outputs the words as text: a tag typed is shown as typed", () => {
    const html = view(
      "en",
      <NoticeForm
        notice={{ ...hidden, message: "<b>bold</b><img src=x onerror=alert(1)>", shown: true }}
        changed={null}
      />,
    );
    expect(html).not.toContain("<b>bold");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("counts characters, not bytes, beside the message", () => {
    const html = view("en", <NoticeForm notice={{ ...hidden, message: "😀😀" }} changed={null} />);
    expect(html).toContain("2 of 500 characters");
  });

  it("puts each refusal beside its field, marks the field, and keeps what was typed", () => {
    const html = view(
      "en",
      <NoticeForm
        notice={{ ...hidden, message: "x", link: { label: "L", href: "javascript:alert(1)" } }}
        changed={null}
        initial={{ errors: { linkHref: "address_invalid", message: "message_too_long" } }}
      />,
    );
    expect(html).toContain(english.errors.address_invalid);
    expect(html).toContain(english.errors.message_too_long.replace("{max, number}", "500"));
    expect(html).toMatch(/id="notice-link-href"[^>]*aria-invalid="true"/);
    expect(html).toMatch(/id="notice-message"[^>]*aria-invalid="true"/);
    expect(html).not.toMatch(/id="notice-tone"[^>]*aria-invalid="true"/);
    expect(html).toContain('value="javascript:alert(1)"');
  });

  it("says saved, or nothing changed", () => {
    for (const done of ["saved", "unchanged"] as const)
      expect(
        view("en", <NoticeForm notice={hidden} changed={null} initial={{ done }} />),
      ).toContain(english[done]);
  });
});

describe("The Notice tab in three languages (124)", () => {
  it("reads in Portuguese and French, with none of the English labels left", () => {
    for (const [locale, words] of [
      ["pt", portuguese],
      ["fr", french],
    ] as const) {
      const html = view(
        locale,
        <NoticeForm
          notice={shown}
          changed={{ at, byName: "Root" }}
          initial={{ done: "saved", errors: { tone: "tone_invalid" } }}
        />,
      );
      for (const text of [
        words.title,
        words.message,
        words.linkLabel,
        words.linkHref,
        words.tone,
        words.toneInfo,
        words.toneWarning,
        words.shown,
        words.preview,
        words.save,
        words.saved,
        words.errors.tone_invalid,
        words.lastChanged.replace("{name}", "Root"),
      ])
        expect(html, `${locale}: ${text}`).toContain(text);
      for (const text of [
        english.linkLabel,
        english.shown,
        english.preview,
        english.save,
        english.saved,
      ])
        expect(html, `${locale} leaks: ${text}`).not.toContain(`>${text}<`);
    }
  });
});

describe("saveNotice", () => {
  const form = (values: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    return data;
  };
  const typed = { message: "Hi", linkLabel: "", linkHref: "", tone: "info", shown: "on" };

  it("passes the typed values on, and revalidates every page", async () => {
    settings.setNotice.mockResolvedValueOnce({ changed: true });
    expect(await saveNotice({}, form(typed))).toEqual({ done: "saved" });
    expect(settings.setNotice).toHaveBeenCalledWith(expect.any(Headers), {
      message: "Hi",
      linkLabel: "",
      linkHref: "",
      tone: "info",
      shown: "on",
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/", "layout");
    settings.setNotice.mockResolvedValueOnce({ changed: false });
    expect(await saveNotice({}, form(typed))).toEqual({ done: "unchanged" });
  });

  it("reads an unchecked box as not shown (the field is absent)", async () => {
    settings.setNotice.mockResolvedValueOnce({ changed: true });
    await saveNotice({}, form({ message: "Hi", tone: "info" }));
    expect(settings.setNotice.mock.calls[0]?.[1]).toMatchObject({ shown: null });
  });

  it("answers a refusal with a code beside its field, and revalidates nothing", async () => {
    settings.setNotice.mockRejectedValueOnce(new InvalidNoticeError("linkHref", "link_address"));
    expect(await saveNotice({}, form(typed))).toEqual({ errors: { linkHref: "address_invalid" } });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("rethrows anything else, a refused person included", async () => {
    settings.setNotice.mockRejectedValueOnce(new ForbiddenError("settings.manage"));
    await expect(saveNotice({}, form(typed))).rejects.toBeInstanceOf(ForbiddenError);
    settings.setNotice.mockRejectedValueOnce(new Error("database down"));
    await expect(saveNotice({}, form(typed))).rejects.toThrow("database down");
  });
});

describe("noticeErrorCode", () => {
  const base: NoticeInput = {
    message: "Hi",
    linkLabel: "",
    linkHref: "",
    tone: "info",
    shown: true,
  };
  const cases: [Partial<NoticeInput>, NoticeField, string][] = [
    [{ message: "" }, "message", "message_empty"],
    [{ message: "x".repeat(501) }, "message", "message_too_long"],
    [{ linkHref: "/x" }, "linkLabel", "label_missing"],
    [{ linkLabel: "x".repeat(61), linkHref: "/x" }, "linkLabel", "label_too_long"],
    [{ linkLabel: "Go" }, "linkHref", "address_missing"],
    [{ linkLabel: "Go", linkHref: "javascript:1" }, "linkHref", "address_invalid"],
    [{ tone: "danger" }, "tone", "tone_invalid"],
  ];

  it.each(cases)(
    "turns what the model refuses (%j) into %s's code, which has words in all three languages",
    (change, field, code) => {
      const checked = noticeFrom({ ...base, ...change });
      if (checked.ok) throw new Error("expected a refusal");
      expect(checked.refusal.field).toBe(field);
      expect(noticeErrorCode(checked.refusal.field, checked.refusal.problem)).toBe(code);
      for (const words of [english, portuguese, french]) expect(words.errors).toHaveProperty(code);
    },
  );
});
