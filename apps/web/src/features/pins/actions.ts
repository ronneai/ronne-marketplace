"use server";

import { revalidatePath } from "next/cache";
import { errorText } from "@/i18n/errors";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import { listPins, movePin, pinItem, unpinItem } from "@/server/domains/shelves/actions/pins";
import { ShelvesError } from "@/server/domains/shelves/exceptions/errors";
import { MAX_PINS, shelfOf } from "@/server/domains/shelves/models/shelf";
import { WorkspacesError } from "@/server/domains/workspaces/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { ShelfResult } from "./types";

/**
 * The pin menu and the Manage dialog (feature 125). Each change answers with the shelf as it is
 * now, so the dialog shows it without asking again. The shelf comes as text: `instance` or a
 * workspace's id, and the service decides who may change it.
 */
const attempt = async (key: string, work: () => Promise<unknown>): Promise<ShelfResult> => {
  try {
    const headers = await requestHeaders();
    await work();
    const entries = await listPins(headers, shelfOf(key), "all");
    // Pins show on Home, the workspace's page and the item page's menu.
    revalidatePath("/", "layout");
    return { ok: true, entries, max: MAX_PINS };
  } catch (error) {
    if (
      error instanceof ShelvesError ||
      error instanceof WorkspacesError ||
      error instanceof IdentityError
    )
      return { ok: false, error: await errorText(error) };
    throw error;
  }
};

/** The shelf's pins for its Manage dialog, including the ones that are not available now. */
export const loadShelfAction = serverAction(
  async (key: string): Promise<ShelfResult> => attempt(key, async () => {}),
);

export const pinToShelfAction = serverAction(
  async (key: string, itemId: string): Promise<ShelfResult> =>
    attempt(key, async () => pinItem(await requestHeaders(), shelfOf(key), itemId)),
);

export const unpinFromShelfAction = serverAction(
  async (key: string, itemId: string): Promise<ShelfResult> =>
    attempt(key, async () => unpinItem(await requestHeaders(), shelfOf(key), itemId)),
);

export const moveInShelfAction = serverAction(
  async (key: string, itemId: string, direction: "up" | "down"): Promise<ShelfResult> =>
    attempt(key, async () =>
      movePin(await requestHeaders(), shelfOf(key), itemId, direction === "up" ? "up" : "down"),
    ),
);
