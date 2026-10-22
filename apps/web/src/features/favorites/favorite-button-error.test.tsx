import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { inLocale } from "@/test/intl";

vi.mock("./actions", () => ({ toggleFavoriteFromForm: vi.fn() }));
// The static render shows the state before any click, so the action's answer is set by hand.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: () => [{ error: "You have 200 favorites, the most allowed." }, () => {}, false],
}));
const { FavoriteButton } = await import("./FavoriteButton");

describe("why the star was refused (125)", () => {
  it("shows the action's answer under the star, as an alert", () => {
    const html = inLocale("en", () =>
      renderToStaticMarkup(<FavoriteButton itemId="I1" name="@team/base" favorited={false} />),
    );
    expect(html).toContain('<p role="alert"');
    expect(html).toContain("You have 200 favorites, the most allowed.");
  });
});
