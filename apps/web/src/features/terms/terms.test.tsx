// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ acceptTermsFromForm: vi.fn() }));
vi.mock("@/features/account/actions", () => ({ signOutFromMenu: vi.fn() }));
const { AcceptTermsForm } = await import("./AcceptTermsForm");
const { inLocale } = await import("@/test/intl");
const { englishLeaks } = await import("@/test/english-leak");

const form = (initial = {}) => (
  <AcceptTermsForm url="https://acme.com/terms" version="2026-11" next="/items" initial={initial} />
);

describe("Accept the updated terms (190)", () => {
  it("links root's terms, opened apart, and posts the version shown and where to go", () => {
    const page = renderToStaticMarkup(form());
    expect(page).toMatch(/href="https:\/\/acme\.com\/terms"[^>]*rel="noopener noreferrer"/);
    expect(page).toContain("(version 2026-11)");
    expect(page).toContain('name="version" value="2026-11"');
    expect(page).toContain('name="next" value="/items"');
    expect(page).toMatch(/id="accept"[^>]*required/);
    expect(page).toContain("Continue");
    expect(page).toContain("Sign out");
  });

  it("points at the box when it wasn't ticked, and says when the terms changed meanwhile", () => {
    expect(renderToStaticMarkup(form({ error: "unticked" }))).toMatch(
      /id="accept"[^>]*aria-invalid="true"/,
    );
    expect(renderToStaticMarkup(form({ error: "changed" }))).toContain("The terms changed again");
  });

  it("shows no English in Portuguese or French", async () => {
    for (const locale of ["pt", "fr"] as const) {
      const page = inLocale(locale, () => renderToStaticMarkup(form({ error: "unticked" })));
      expect(await englishLeaks(["account", "common"], locale, page), locale).toEqual([]);
    }
  });
});
