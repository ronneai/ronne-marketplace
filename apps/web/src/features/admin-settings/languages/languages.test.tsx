import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsError } from "@/server/domains/settings/exceptions/errors";

const settings = vi.hoisted(() => ({ languageSettings: vi.fn(), setLanguagePolicy: vi.fn() }));
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
vi.mock("@/server/domains/feeds/actions/feeds", () => ({}));
vi.mock("@/server/jobs/actions", () => ({}));
vi.mock("@/server/domains/identity/actions/erase-user", () => ({}));
vi.mock("@/server/domains/identity/actions/two-factor", () => ({}));
vi.mock("@/server/domains/identity/actions/identity-providers", () => ({}));
vi.mock("@/server/domains/identity/actions/password-policy", () => ({}));

const { saveLanguages } = await import("./actions");
const { LanguagesTab } = await import("./LanguagesTab");
const { default: AdminSettingsPage } = await import("@/app/(app)/admin/settings/page");
const english = (await import("../../../../messages/en/admin.json")).default.languages;

const all = { default: "en", choice: true, offered: ["en", "pt", "fr"] };

beforeEach(() => {
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue({ id: "r", role: "root" });
  settings.languageSettings.mockResolvedValue(all);
});

describe("The Languages tab (141)", () => {
  it("is a tab of Settings, selected by ?tab=languages", async () => {
    const html = renderToStaticMarkup(
      await AdminSettingsPage({ searchParams: Promise.resolve({ tab: "languages" }) }),
    );
    expect(html).toMatch(/aria-current="page"[^>]*>Languages</);
    expect(html).toContain('href="/admin/settings?tab=languages"');
    expect(html).toContain(`aria-label="${english.title}"`);
    expect(html).not.toContain("Usage reporting");
  });

  it("is a 404 for anyone but root, before anything is read", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "u", role: "user" });
    await expect(
      AdminSettingsPage({ searchParams: Promise.resolve({ tab: "languages" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(settings.languageSettings).not.toHaveBeenCalled();
  });

  it("shows what is saved", async () => {
    settings.languageSettings.mockResolvedValue({ default: "fr", choice: false, offered: ["fr"] });
    const html = renderToStaticMarkup(await LanguagesTab());
    expect(html).toMatch(/<option value="fr" selected/);
    expect(html).toMatch(/<fieldset[^>]*hidden/);
    expect(html).toContain(english.default);
  });
});

describe("saving the languages (141)", () => {
  const form = (entries: [string, string][]) => {
    const data = new FormData();
    for (const [key, value] of entries) data.append(key, value);
    return data;
  };

  it("sends the default, the switch and every ticked language", async () => {
    settings.setLanguagePolicy.mockResolvedValue({ changed: true });
    expect(
      await saveLanguages(
        {},
        form([
          ["default", "fr"],
          ["choice", "on"],
          ["offered", "pt"],
          ["offered", "fr"],
        ]),
      ),
    ).toEqual({ done: "saved" });
    expect(settings.setLanguagePolicy).toHaveBeenCalledWith(expect.any(Headers), {
      default: "fr",
      choice: true,
      offered: ["pt", "fr"],
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("reads a missing switch as off, and says when nothing changed", async () => {
    settings.setLanguagePolicy.mockResolvedValue({ changed: false });
    expect(await saveLanguages({}, form([["default", "en"]]))).toEqual({ done: "unchanged" });
    expect(settings.setLanguagePolicy).toHaveBeenCalledWith(expect.any(Headers), {
      default: "en",
      choice: false,
      offered: [],
    });
  });

  it("turns a refusal into the form's error line", async () => {
    settings.setLanguagePolicy.mockRejectedValue(new SettingsError("Choose a language."));
    const result = await saveLanguages({}, form([["default", "xx"]]));
    expect(result.error).toBeTruthy();
    expect(result.done).toBeUndefined();
  });
});
