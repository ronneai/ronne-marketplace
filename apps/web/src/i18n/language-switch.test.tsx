import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { inLocale } from "@/test/intl";
import { LanguageSwitch } from "./LanguageSwitch";

const view = (locale: "en" | "pt" | "fr", here?: string) =>
  inLocale(locale, () => renderToStaticMarkup(<LanguageSwitch here={here} />));

describe("the language switch (129)", () => {
  it("links each language, in its own name, to the route that sets the cookie and comes back", () => {
    const html = view("en", "/sign-in?next=%2Fitems");
    const links = [
      ...html.matchAll(/<a href="([^"]+)"[^>]*lang="(\w+)"[^>]*>([^<]+)(?:<svg|<\/a>)/g),
    ].map((m) => [m[1]?.replaceAll("&amp;", "&"), m[2], m[3]]);
    const next = encodeURIComponent("/sign-in?next=%2Fitems");
    expect(links).toEqual([
      [`/language?set=en&next=${next}`, "en", "English"],
      [`/language?set=pt&next=${next}`, "pt", "Português"],
      [`/language?set=fr&next=${next}`, "fr", "Français"],
    ]);
  });

  it("is a menu that shows the language in use, so more languages need no room (157)", () => {
    const html = view("pt");
    expect(html).toMatch(/<details[^>]*><summary[^>]*>.*<span lang="pt">Português<\/span>/);
    expect(html).toContain("<ul");
  });

  it("marks the language in use, and is named in that language", () => {
    expect(view("pt")).toMatch(/aria-current="true"[^>]*>Português</);
    expect(view("pt").match(/aria-current/g)).toHaveLength(1);
    expect(view("fr")).toContain('aria-label="Langue"');
    expect(view("pt")).toContain('aria-label="Idioma"');
    expect(view("en")).toContain('aria-label="Language"');
  });

  it("is plain links, not Next's prefetching ones, and goes back only inside the site", () => {
    const html = view("en", "//evil.test");
    expect(html).not.toContain("data-prefetch");
    expect(html).toContain(`next=${encodeURIComponent("/")}"`);
    expect(view("en", "/language?set=fr")).toContain(`next=${encodeURIComponent("/")}"`);
  });
});
