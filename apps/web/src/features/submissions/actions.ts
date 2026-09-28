"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import { createDraft } from "@/server/domains/submissions/actions/drafts";
import { SubmissionsError } from "@/server/domains/submissions/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import type { NewDraftState } from "./types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

/** Creates the draft and opens it in the editor; domain errors become the form's `ERR:` line. */
export const createDraftFromForm = async (
  _previous: NewDraftState,
  form: FormData,
): Promise<NewDraftState> => {
  let id: string;
  try {
    ({ id } = await createDraft(await requestHeaders(), {
      scope: text(form, "scope"),
      name: text(form, "name"),
      type: text(form, "type"),
    }));
  } catch (error) {
    if (error instanceof SubmissionsError || error instanceof IdentityError)
      return { error: error.message };
    throw error;
  }
  revalidatePath("/submissions");
  redirect(`/submissions/${id}`);
};
