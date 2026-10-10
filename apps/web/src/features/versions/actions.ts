"use server";

import { revalidatePath } from "next/cache";
import { itemPath } from "@/components/catalogue/ItemCard";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import {
  deprecate,
  type ItemRef,
  moveTag,
  removeTag,
  undeprecate,
  unyank,
  yank,
} from "@/server/domains/items/actions/versions";
import { ItemsError } from "@/server/domains/items/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";

export type VersionActionResult = { ok: true } | { ok: false; error: string };

/** Every change the Versions page makes (feature 016). */
export type VersionChange =
  | { kind: "move_tag"; tag: string; version: string }
  | { kind: "remove_tag"; tag: string }
  | { kind: "deprecate"; version: string; message: string }
  | { kind: "undeprecate"; version: string }
  | { kind: "yank"; version: string; reason: string }
  | { kind: "unyank"; version: string };

/** Runs one change; domain errors become the dialog's `ERR:` line. */
export const changeVersions = async (
  ref: ItemRef,
  change: VersionChange,
): Promise<VersionActionResult> => {
  const headers = await requestHeaders();
  try {
    switch (change.kind) {
      case "move_tag":
        await moveTag(headers, ref, change);
        break;
      case "remove_tag":
        await removeTag(headers, ref, change);
        break;
      case "deprecate":
        await deprecate(headers, ref, change);
        break;
      case "undeprecate":
        await undeprecate(headers, ref, change);
        break;
      case "yank":
        await yank(headers, ref, change);
        break;
      case "unyank":
        await unyank(headers, ref, change);
        break;
    }
  } catch (error) {
    if (error instanceof ItemsError || error instanceof IdentityError)
      return { ok: false, error: error.message };
    throw error;
  }
  revalidatePath(`${itemPath(ref)}/versions`);
  return { ok: true };
};
