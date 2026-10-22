"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { toggleFavoriteFromForm } from "./actions";

/**
 * The star (feature 125): a button that adds or removes an item from the person's favorites.
 * `aria-pressed` says whether it is one, the item's name is in its label, and it is a form, so it
 * works without JavaScript. Its target is 44px on a touch screen (067). Why a click was refused
 * (the limit of 200) shows under it.
 */
export const FavoriteButton = ({
  itemId,
  name,
  favorited,
}: {
  itemId: string;
  /** The item's full name, for the label. */
  name: string;
  favorited: boolean;
}) => {
  const t = useTranslations("shelves.favorite");
  const [state, action, pending] = useActionState(toggleFavoriteFromForm, {});
  return (
    <form action={action} className="grid justify-items-end gap-1">
      <input type="hidden" name="item" value={itemId} />
      <input type="hidden" name="favorite" value={favorited ? "off" : "on"} />
      <IconButton
        type="submit"
        label={favorited ? t("remove", { name }) : t("add", { name })}
        aria-pressed={favorited}
        disabled={pending}
        className={favorited ? "text-accent-strong" : undefined}
      >
        <Star size={18} aria-hidden="true" fill={favorited ? "currentColor" : "none"} />
      </IconButton>
      {state.error ? (
        <p role="alert" className="max-w-xs text-right text-xs text-error-text">
          {state.error}
        </p>
      ) : null}
    </form>
  );
};
