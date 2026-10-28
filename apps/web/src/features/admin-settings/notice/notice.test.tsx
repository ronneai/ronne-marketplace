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

const hidden = { message: "", tone: "info", shown: false } as const;
const shown = {
  message:
    "The demo's data is reset on Friday. See the [status page](https://status.example.com/).",
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
  it("is a tab of Settings, selected by ?tab=notice, with the form and no other panel", async () => {
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
    for (const label of [english.message, english.tone])
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
    // The field holds the message as typed; the preview draws the link inside the sentence.
    expect(html).toContain("[status page](https://status.example.com/)");
    expect(html).toContain('<option value="warning" selected="">');
    expect(html).toContain("WARN:");
    // The preview underlines the link words but draws no link: typed text never reaches an href.
    expect(html).toMatch(/See the <\/span><span class="underline">status page<\/span>/);
    expect(html).not.toContain('href="https://status.example.com/"');
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

  it("counts characters, not bytes, beside the message, and says how to write a link", () => {
    const html = view("en", <NoticeForm notice={{ ...hidden, message: "😀😀" }} changed={null} />);
    expect(html).toContain("2 of 500 characters");
    expect(html).toContain("[words](address)");
  });

  it("draws the links inside the sentence in the preview as underlined words, with no separate link fields", () => {
    const html = view(
      "en",
      <NoticeForm
        notice={{
          ...hidden,
          message: "Read [this](/catalogue) or [that](https://a.example/).",
          shown: true,
        }}
        changed={null}
      />,
    );
    expect(html).toMatch(
      /Read <\/span><span class="underline">this<\/span><span> or <\/span><span class="underline">that<\/span>/,
    );
    expect(html).not.toContain('href="/catalogue"');
    expect(html).not.toContain('href="https://a.example/"');
    expect(html).not.toContain('name="linkLabel"');
    expect(html).not.toContain('name="linkHref"');
  });

  it("puts each refusal beside its field, marks the field, and keeps what was typed", () => {
    const html = view(
      "en",
      <NoticeForm
        notice={{ ...hidden, message: "x [Go](javascript:alert)" }}
        changed={null}
        initial={{ errors: { message: "link_address", tone: "tone_invalid" } }}
      />,
    );
    expect(html).toContain(english.errors.link_address);
    expect(html).toContain(english.errors.tone_invalid);
    expect(html).toMatch(/id="notice-message"[^>]*aria-invalid="true"/);
    expect(html).toMatch(/id="notice-tone"[^>]*aria-invalid="true"/);
    expect(html).toContain("x [Go](javascript:alert)");
  });

  it("fills in the numbers of the errors that have them", () => {
    const refused = (code: "message_too_long" | "link_label" | "too_many_links") =>
      view(
        "en",
        <NoticeForm notice={hidden} changed={null} initial={{ errors: { message: code } }} />,
      );
    expect(refused("message_too_long")).toContain("Use up to 500 characters, on one line.");
    expect(refused("link_label")).toContain("up to 60 characters: [words](address).");
    expect(refused("too_many_links")).toContain("Use at most 3 links in the message.");
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
      for (const text of [english.shown, english.preview, english.save, english.saved])
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
  const typed = { message: "Hi", tone: "info", shown: "on" };

  it("passes the typed values on, and revalidates every page", async () => {
    settings.setNotice.mockResolvedValueOnce({ changed: true });
    expect(await saveNotice({}, form(typed))).toEqual({ done: "saved" });
    expect(settings.setNotice).toHaveBeenCalledWith(expect.any(Headers), {
      message: "Hi",
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
    settings.setNotice.mockRejectedValueOnce(new InvalidNoticeError("message", "link_address"));
    expect(await saveNotice({}, form(typed))).toEqual({ errors: { message: "link_address" } });
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
  const base: NoticeInput = { message: "Hi", tone: "info", shown: true };
  const cases: [Partial<NoticeInput>, NoticeField, string][] = [
    [{ message: "" }, "message", "message_empty"],
    [{ message: "x".repeat(501) }, "message", "message_too_long"],
    [{ message: "[](/x)" }, "message", "link_label"],
    [{ message: `[${"x".repeat(61)}](/x)` }, "message", "link_label"],
    [{ message: "[Go](javascript:1)" }, "message", "link_address"],
    [{ message: "[a](/1)[b](/2)[c](/3)[d](/4)" }, "message", "too_many_links"],
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
