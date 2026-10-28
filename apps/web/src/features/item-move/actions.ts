"use server";

import { errorText } from "@/i18n/errors";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import {
  askItemMove,
  cancelItemMove,
  itemMoveImpact,
} from "@/server/domains/workspaces/actions/workspaces";
import {
  ItemMoveRefusedError,
  WorkspacesError,
} from "@/server/domains/workspaces/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { ItemMoveActionState, ItemMoveCancelState, ItemMoveImpactResult } from "./types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

/** A domain error as the dialog's words, in the person's language; anything else is thrown. */
const refusal = async (error: unknown) => {
  if (error instanceof WorkspacesError || error instanceof IdentityError)
    return { error: await errorText(error) };
  throw error;
};

/** What moving the item to the scope would change, and how (134). */
export const itemMoveImpactFor = serverAction(
  async (input: { itemId: string; toScopeId: string }): Promise<ItemMoveImpactResult> => {
    try {
      return await itemMoveImpact(await requestHeaders(), input);
    } catch (error) {
      return await refusal(error);
    }
  },
);

/**
 * Moves the item, or asks to (134). Nothing is refreshed here: the page would redraw under the
 * dialog. The dialog goes to the item's new page, or refreshes this one, when it's closed.
 */
export const askItemMoveFromForm = serverAction(
  async (_previous: ItemMoveActionState, form: FormData): Promise<ItemMoveActionState> => {
    try {
      const result = await askItemMove(await requestHeaders(), {
        itemId: text(form, "itemId"),
        toScopeId: text(form, "toScopeId"),
        message: text(form, "message"),
      });
      return { done: result.outcome, newName: result.impact.newName };
    } catch (error) {
      if (error instanceof ItemMoveRefusedError) return { refused: error.impact };
      return await refusal(error);
    }
  },
);

/** Cancels a move request (134), from the item page's notice. */
export const cancelItemMoveFromForm = serverAction(
  async (_previous: ItemMoveCancelState, form: FormData): Promise<ItemMoveCancelState> => {
    try {
      await cancelItemMove(await requestHeaders(), { moveId: text(form, "moveId") });
      return { done: true };
    } catch (error) {
      return await refusal(error);
    }
  },
);
