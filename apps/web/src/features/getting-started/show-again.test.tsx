import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { inLocale } from "@/test/intl";

vi.mock("./actions", () => ({
  confirmInstallFromForm: vi.fn(),
  hideGettingStartedFromForm: vi.fn(),
  showGettingStartedFromForm: vi.fn(),
}));
const { ShowAgainSection } = await import("./ShowAgainSection");

describe("Account's Show getting started again (126)", () => {
  it("is a form with one submit button, so it works without JavaScript", () => {
    const html = inLocale("en", () => renderToStaticMarkup(<ShowAgainSection />));
    expect(html).toContain(">Getting started<");
    expect(html).toContain(">Show getting started again<");
    expect(html.match(/<form/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*type="submit"/);
  });

  it("speaks Portuguese and French", () => {
    expect(inLocale("pt", () => renderToStaticMarkup(<ShowAgainSection />))).toContain(
      ">Mostrar os primeiros passos de novo<",
    );
    expect(inLocale("fr", () => renderToStaticMarkup(<ShowAgainSection />))).toContain(
      ">Afficher Pour commencer de nouveau<",
    );
  });
});
