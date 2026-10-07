"use server";

import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import { proposeChange } from "@/server/domains/submissions/actions/proposals";
import { NotAMemberError, SubmissionsError } from "@/server/domains/submissions/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";

export type ProposeResult =
  | { ok: true; id: string }
  /** `notMember`: the item's workspace isn't one of the person's (091). */
  | { ok: false; error: string; notMember?: boolean };

/** Starts a change proposal from the version the item page shows (feature 017). */
export const proposeChangeAction = async (
  item: string,
  version: string,
): Promise<ProposeResult> => {
  try {
    const draft = await proposeChange(await requestHeaders(), { item, version });
    return { ok: true, id: draft.id };
  } catch (error) {
    if (error instanceof NotAMemberError)
      return { ok: false, error: error.message, notMember: true };
    if (error instanceof SubmissionsError || error instanceof IdentityError)
      return { ok: false, error: error.message };
    throw error;
  }
};
