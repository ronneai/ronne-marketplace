import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const choices = vi.hoisted(() => ({ requestChoosableLocales: vi.fn() }));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/i18n/server", () => choices);
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("../../hold", () => ({ holdPage: async () => undefined }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/features/account/actions", () => ({ setLanguageFromForm: vi.fn() }));

const { default: LanguagePage } = await import("./page");

beforeEach(() => {
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue({ id: "u", locale: null });
});

describe("Account › Language page (141)", () => {
  it("is a 404 while root has turned choosing off, before anything else is read", async () => {
    choices.requestChoosableLocales.mockResolvedValue([]);
    await expect(LanguagePage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(session.getCurrentUser).not.toHaveBeenCalled();
  });

  it("is a 404 when only one language is offered", async () => {
    choices.requestChoosableLocales.mockResolvedValue(["fr"]);
    await expect(LanguagePage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows the form with the offered languages only", async () => {
    choices.requestChoosableLocales.mockResolvedValue(["en", "fr"]);
    const html = renderToStaticMarkup(await LanguagePage());
    expect(html).toContain('value="en"');
    expect(html).toContain('value="fr"');
    expect(html).not.toContain('value="pt"');
  });

  it("keeps a saved language that isn't offered, shows Automatic and says so", async () => {
    choices.requestChoosableLocales.mockResolvedValue(["en", "fr"]);
    session.getCurrentUser.mockResolvedValue({ id: "u", locale: "pt" });
    const html = renderToStaticMarkup(await LanguagePage());
    expect(html).toContain("Your earlier choice, Português");
    expect(html).toMatch(/<option value="" selected="">/);
  });

  it("selects a saved language that is offered, with no note", async () => {
    choices.requestChoosableLocales.mockResolvedValue(["en", "fr"]);
    session.getCurrentUser.mockResolvedValue({ id: "u", locale: "fr" });
    const html = renderToStaticMarkup(await LanguagePage());
    expect(html).toMatch(/<option value="fr"[^>]*selected/);
    expect(html).not.toContain("earlier choice");
  });
});
