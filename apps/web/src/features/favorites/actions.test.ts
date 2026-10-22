import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/domains/identity/exceptions/errors";
import {
  FavoriteLimitError,
  ShelfItemNotAvailableError,
} from "@/server/domains/shelves/exceptions/errors";
import { inLocaleAsync } from "@/test/intl";

const favorites = vi.hoisted(() => ({ addFavorite: vi.fn(), removeFavorite: vi.fn() }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/domains/shelves/actions/favorites", () => favorites);
vi.mock("next/cache", () => cache);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const { toggleFavoriteFromForm } = await import("./actions");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

beforeEach(() => vi.clearAllMocks());

describe("the star's form action (125)", () => {
  it("adds on `on` and removes on `off`, then refreshes the pages that show favorites", async () => {
    expect(await toggleFavoriteFromForm({}, form({ item: "I1", favorite: "on" }))).toEqual({});
    expect(favorites.addFavorite).toHaveBeenCalledWith(expect.any(Headers), "I1");
    expect(favorites.removeFavorite).not.toHaveBeenCalled();
    expect(await toggleFavoriteFromForm({}, form({ item: "I1", favorite: "off" }))).toEqual({});
    expect(favorites.removeFavorite).toHaveBeenCalledWith(expect.any(Headers), "I1");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("anything but `on` removes: a missing field never adds", async () => {
    await toggleFavoriteFromForm({}, form({ item: "I1" }));
    expect(favorites.addFavorite).not.toHaveBeenCalled();
    expect(favorites.removeFavorite).toHaveBeenCalled();
  });

  it("says why it was refused, in the person's language, and refreshes nothing", async () => {
    favorites.addFavorite.mockRejectedValueOnce(new FavoriteLimitError(200));
    const pt = await inLocaleAsync("pt", () =>
      toggleFavoriteFromForm({}, form({ item: "I1", favorite: "on" })),
    );
    expect(pt).toEqual({ error: "Você tem 200 favoritos, o máximo permitido. Remova um antes." });
    favorites.addFavorite.mockRejectedValueOnce(new ShelfItemNotAvailableError());
    const fr = await inLocaleAsync("fr", () =>
      toggleFavoriteFromForm({}, form({ item: "I1", favorite: "on" })),
    );
    expect(fr).toEqual({ error: "Cet élément n’est pas disponible." });
    favorites.addFavorite.mockRejectedValueOnce(new ForbiddenError("account.manage_own"));
    expect(
      (await toggleFavoriteFromForm({}, form({ item: "I1", favorite: "on" }))).error,
    ).toContain("permission");
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("lets an unexpected error through", async () => {
    favorites.removeFavorite.mockRejectedValueOnce(new Error("boom"));
    await expect(toggleFavoriteFromForm({}, form({ item: "I1", favorite: "off" }))).rejects.toThrow(
      "boom",
    );
  });
});
