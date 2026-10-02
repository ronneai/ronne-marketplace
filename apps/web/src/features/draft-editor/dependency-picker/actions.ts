"use server";

import type { ItemType } from "@ronneai/core";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import {
  type DependencyOption,
  findDependencies,
} from "@/server/domains/submissions/actions/composer";
import { requestHeaders } from "@/server/http/request-headers";

export type FindResult = { ok: true; options: DependencyOption[] } | { ok: false; error: string };

/** What picking a dependency offers (056), for the form's picker and `@` in markdown. */
export const findDependenciesAction = async (input: {
  type: ItemType;
  q: string;
  itemName: string;
  exclude: string[];
}): Promise<FindResult> => {
  try {
    return { ok: true, options: await findDependencies(await requestHeaders(), input) };
  } catch (error) {
    if (error instanceof IdentityError) return { ok: false, error: error.message };
    throw error;
  }
};
