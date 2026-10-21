"use server";

import { revalidatePath } from "next/cache";
import { errorText } from "@/i18n/errors";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import { addFavorite, removeFavorite } from "@/server/domains/shelves/actions/favorites";
import { ShelvesError } from "@/server/domains/shelves/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { FavoriteState } from "./types";

/**
 * The star on a card or an item page (feature 125): adds the item to the person's favorites, or
 * removes it. A form action, so it works without JavaScript too: the page it came from is shown
 * again with the star changed.
 */
export const toggleFavoriteFromForm = serverAction(
  async (_previous: FavoriteState, form: FormData): Promise<FavoriteState> => {
    const item = String(form.get("item") ?? "");
    const on = form.get("favorite") === "on";
    try {
      const headers = await requestHeaders();
      if (on) await addFavorite(headers, item);
      else await removeFavorite(headers, item);
      // Favorites show on Home, the catalogue and every item page.
      revalidatePath("/", "layout");
      return {};
    } catch (error) {
      if (error instanceof ShelvesError || error instanceof IdentityError)
        return { error: await errorText(error) };
      throw error;
    }
  },
);
