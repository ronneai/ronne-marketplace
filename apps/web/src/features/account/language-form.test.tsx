import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { inLocale } from "@/test/intl";
import { LanguageForm } from "./LanguageForm";

const form = (props: Parameters<typeof LanguageForm>[0], locale: "en" | "pt" | "fr" = "en") =>
  inLocale(locale, () => renderToStaticMarkup(<LanguageForm {...props} />));

describe("Account › Language with the instance's settings (141)", () => {
  it("offers Automatic and every language by default", () => {
    const html = form({});
    for (const name of ["Automatic", "English", "Português", "Français"])
      expect(html).toContain(name);
  });

  it("offers only the languages root offers", () => {
    const html = form({ offered: ["en", "fr"] });
    expect(html).toContain('value="en"');
    expect(html).toContain('value="fr"');
    expect(html).not.toContain('value="pt"');
  });

  it("says an earlier choice that isn't offered now is kept but not in force", () => {
    const html = form({ saved: null, offered: ["en", "fr"], notOffered: "pt" });
    expect(html).toContain(
      "Your earlier choice, Português, isn&#x27;t offered on this instance now",
    );
    expect(html).toContain("Automatic applies");
    // Automatic is what shows as selected.
    expect(html).not.toMatch(/<option[^>]*value="pt"/);
  });

  it("shows no note when the saved language is offered", () => {
    const html = form({ saved: "fr", offered: ["en", "fr"] });
    expect(html).not.toContain("earlier choice");
  });

  it("says the same in Portuguese and French", () => {
    expect(form({ offered: ["en", "fr"], notOffered: "pt" }, "pt")).toContain(
      "Sua escolha anterior",
    );
    expect(form({ offered: ["en", "fr"], notOffered: "pt" }, "fr")).toContain(
      "Votre choix précédent",
    );
  });
});
