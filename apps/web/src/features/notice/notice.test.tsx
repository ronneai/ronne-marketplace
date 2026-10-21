import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Notice } from "@/server/domains/settings/models/notice-policy";

const settings = vi.hoisted(() => ({ notice: vi.fn() }));
const jar = vi.hoisted(() => ({ values: {} as Record<string, string>, set: vi.fn() }));
const shell = vi.hoisted(() => ({ loadShell: vi.fn() }));
vi.mock("@/server/domains/settings/actions/settings", () => settings);
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name in jar.values ? { value: jar.values[name] } : undefined),
    set: jar.set,
  }),
  headers: async () => new Headers(),
}));
vi.mock("@/server/http/server-action", () => ({
  serverAction: <T,>(action: T) => action,
}));
vi.mock("@/app/(app)/shell", () => shell);
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/features/account/actions", () => ({ signOutFromMenu: vi.fn() }));
vi.mock("@/features/theme/actions", () => ({ setThemeFromForm: vi.fn() }));

const { inLocale } = await import("@/test/intl");
const { isDismissed, NOTICE_COOKIE, noticeCookieOptions, parseRevision } = await import(
  "./notice-cookie"
);
const { visibleNotice } = await import("./visible-notice");
const { dismissNotice } = await import("./actions");
const { DismissibleNotice } = await import("./DismissibleNotice");
const { NoticeBanner } = await import("./NoticeBanner");
const { default: AppLayout } = await import("@/app/(app)/layout");

const current = (change: Partial<Notice> = {}): Notice => ({
  message: "Maintenance tonight at 22:00.",
  link: null,
  tone: "info",
  shown: true,
  revision: 3,
  ...change,
});

beforeEach(() => {
  vi.clearAllMocks();
  jar.values = {};
  settings.notice.mockResolvedValue({ ...current(), changedAt: null, changedBy: null });
});

describe("the dismiss cookie (124)", () => {
  it("holds a revision, digits only, nine at most", () => {
    expect(parseRevision("0")).toBe(0);
    expect(parseRevision("12")).toBe(12);
    for (const bad of [
      "",
      "-1",
      "1.5",
      "1e3",
      " 1",
      "1 ",
      "0x10",
      "1234567890",
      undefined,
      null,
      4,
    ])
      expect(parseRevision(bad), String(bad)).toBeNull();
  });

  it("dismisses a notice up to the revision it holds, and nothing for garbage or no cookie", () => {
    expect(isDismissed(3, "3")).toBe(true);
    expect(isDismissed(3, "9")).toBe(true);
    expect(isDismissed(3, "2")).toBe(false);
    expect(isDismissed(3, undefined)).toBe(false);
    expect(isDismissed(3, "three")).toBe(false);
    expect(isDismissed(0, "0")).toBe(true);
  });

  it("is server-only and lasts a year", () => {
    expect(NOTICE_COOKIE).toBe("ronne-notice");
    expect(noticeCookieOptions).toMatchObject({
      path: "/",
      maxAge: 31536000,
      sameSite: "lax",
      httpOnly: true,
    });
  });
});

describe("visibleNotice", () => {
  it("gives the notice while it is shown and not dismissed", async () => {
    expect(await visibleNotice()).toMatchObject({ message: "Maintenance tonight at 22:00." });
  });

  it("gives nothing while it is hidden, empty, or dismissed at this revision", async () => {
    settings.notice.mockResolvedValue({ ...current({ shown: false }) });
    expect(await visibleNotice()).toBeNull();
    settings.notice.mockResolvedValue({ ...current({ message: "" }) });
    expect(await visibleNotice()).toBeNull();
    settings.notice.mockResolvedValue({ ...current() });
    jar.values[NOTICE_COOKIE] = "3";
    expect(await visibleNotice()).toBeNull();
  });

  it("comes back when root changes it (a higher revision), and for a cookie that is not a number", async () => {
    jar.values[NOTICE_COOKIE] = "3";
    settings.notice.mockResolvedValue({ ...current({ revision: 4 }) });
    expect(await visibleNotice()).toMatchObject({ revision: 4 });
    jar.values[NOTICE_COOKIE] = "abc";
    expect(await visibleNotice()).not.toBeNull();
  });
});

describe("dismissNotice", () => {
  const post = (revision: string | null) => {
    const form = new FormData();
    if (revision !== null) form.set("revision", revision);
    return form;
  };

  it("keeps the revision in the cookie", async () => {
    await dismissNotice(post("3"));
    expect(jar.set).toHaveBeenCalledWith("ronne-notice", "3", noticeCookieOptions);
  });

  it("never keeps more than the current revision, so a forged number can't hide a later notice", async () => {
    await dismissNotice(post("999999"));
    expect(jar.set).toHaveBeenCalledWith("ronne-notice", "3", noticeCookieOptions);
  });

  it("does nothing for a missing or invalid revision", async () => {
    for (const bad of [null, "", "-1", "x", "1.5"]) await dismissNotice(post(bad));
    expect(jar.set).not.toHaveBeenCalled();
  });
});

describe("The notice on the page (124)", () => {
  const html = (notice: Notice) => renderToStaticMarkup(<DismissibleNotice notice={notice} />);

  it("shows root's words, a Dismiss form that posts the revision, and the tone", () => {
    const out = html(current());
    expect(out).toContain("Maintenance tonight at 22:00.");
    expect(out).toContain("INFO:");
    expect(out).toMatch(/<form[^>]*>.*name="revision" value="3".*Dismiss<\/button>/);
    expect(html(current({ tone: "warning" }))).toContain("WARN:");
  });

  it("shows the link: a path on this site opens in place, an https address in a new tab", () => {
    const own = html(current({ link: { label: "Status", href: "/catalogue" } }));
    expect(own).toMatch(/<a [^>]*href="\/catalogue"/);
    expect(own).not.toContain("_blank");
    const away = html(current({ link: { label: "Status", href: "https://status.example.com/" } }));
    expect(away).toContain('href="https://status.example.com/"');
    expect(away).toContain('target="_blank"');
    expect(away).toContain('rel="noopener noreferrer"');
  });

  it("outputs everything as text: a tag typed is shown as typed", () => {
    const out = html(
      current({
        message: "<b>bold</b> <script>alert(1)</script>",
        link: { label: "<i>x</i>", href: "/a" },
      }),
    );
    expect(out).not.toContain("<b>");
    expect(out).not.toContain("<script>alert");
    expect(out).not.toContain("<i>");
    expect(out).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(out).toContain("&lt;i&gt;x&lt;/i&gt;");
  });

  it("lets a long unbroken string wrap instead of stretching the page", () => {
    const out = renderToStaticMarkup(
      <NoticeBanner notice={{ message: "a".repeat(500), link: null, tone: "info" }} />,
    );
    expect(out).toContain("[overflow-wrap:anywhere]");
    expect(out).toContain("min-w-0");
  });

  it("says Dismiss in Portuguese and French", () => {
    const node = <DismissibleNotice notice={current()} />;
    expect(inLocale("pt", () => renderToStaticMarkup(node))).toContain("Dispensar</button>");
    expect(inLocale("fr", () => renderToStaticMarkup(node))).toContain("Fermer</button>");
  });
});

describe("The (app) layout (124)", () => {
  const user = { name: "U", email: "u@example.com", role: "user" as const };
  const frame = async () => {
    shell.loadShell.mockResolvedValue({
      user,
      theme: "light",
      navCounts: {},
      workspaces: [],
      folded: false,
      current: null,
    });
    return renderToStaticMarkup(await AppLayout({ children: <p>PAGE</p> }));
  };

  it("draws the notice under the header and above the page, on every page", async () => {
    const out = await frame();
    const notice = out.indexOf("Maintenance tonight");
    expect(notice).toBeGreaterThan(out.indexOf("</header>"));
    expect(notice).toBeLessThan(out.indexOf("<main"));
    expect(out.indexOf("PAGE")).toBeGreaterThan(notice);
  });

  it("draws nothing while hidden or dismissed, and the page is as before", async () => {
    settings.notice.mockResolvedValue({ ...current({ shown: false }) });
    expect(await frame()).not.toContain("Maintenance tonight");
    settings.notice.mockResolvedValue({ ...current() });
    jar.values[NOTICE_COOKIE] = "3";
    const out = await frame();
    expect(out).not.toContain("Maintenance tonight");
    expect(out).toContain("PAGE");
  });
});
