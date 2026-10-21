import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/server/domains/identity/models/locale";
import { inLocale } from "@/test/intl";

vi.mock("./actions", () => ({ toggleFavoriteFromForm: vi.fn() }));
const { FavoriteButton } = await import("./FavoriteButton");

const star = (locale: Locale, favorited: boolean) =>
  inLocale(locale, () =>
    renderToStaticMarkup(<FavoriteButton itemId="ITEM1" name="@team/base" favorited={favorited} />),
  );

describe("the star (125)", () => {
  it("is a button inside a form, so it works without JavaScript", () => {
    const html = star("en", false);
    expect(html).toMatch(/^<form /);
    expect(html).toContain('<button type="submit"');
    expect(html).toContain('<input type="hidden" name="item" value="ITEM1"/>');
  });

  it("not a favorite yet: pressed is false, the form adds, the label says add", () => {
    const html = star("en", false);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('name="favorite" value="on"');
    expect(html).toContain('aria-label="Add @team/base to favorites"');
    expect(html).toContain('title="Add @team/base to favorites"');
    expect(html).toContain('fill="none"');
  });

  it("a favorite: pressed is true, the form removes, the label says remove, the star is filled", () => {
    const html = star("en", true);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('name="favorite" value="off"');
    expect(html).toContain('aria-label="Remove @team/base from favorites"');
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain("text-accent-strong");
  });

  it("says its label in Portuguese and French, with the item's name", () => {
    expect(star("pt", false)).toContain('aria-label="Adicionar @team/base aos favoritos"');
    expect(star("pt", true)).toContain('aria-label="Remover @team/base dos favoritos"');
    expect(star("fr", false)).toContain('aria-label="Ajouter @team/base aux favoris"');
    expect(star("fr", true)).toContain('aria-label="Retirer @team/base des favoris"');
  });

  it("has a 44px target on a touch screen (067)", () => {
    expect(star("en", false)).toContain("pointer-coarse:size-11");
  });

  it("shows no error until the action answers with one", () => {
    expect(star("en", false)).not.toContain('role="alert"');
  });
});
