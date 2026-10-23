"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { errorText } from "@/i18n/errors";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import { createDraft } from "@/server/domains/submissions/actions/drafts";
import { submitManyDrafts } from "@/server/domains/submissions/actions/submissions";
import { NotAMemberError, SubmissionsError } from "@/server/domains/submissions/exceptions/errors";
import { itemNameOf } from "@/server/domains/submissions/models/submission";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { BulkResult, NewDraftState } from "./types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

/** Creates the draft and opens it in the editor; domain errors become the form's `ERR:` line. */
export const createDraftFromForm = serverAction(
  async (_previous: NewDraftState, form: FormData): Promise<NewDraftState> => {
    let id: string;
    try {
      ({ id } = await createDraft(await requestHeaders(), {
        scope: text(form, "scope"),
        name: text(form, "name"),
        type: text(form, "type"),
      }));
    } catch (error) {
      if (error instanceof SubmissionsError || error instanceof IdentityError)
        return { error: await errorText(error) };
      throw error;
    }
    revalidatePath("/submissions");
    redirect(`/submissions/${id}`);
  },
);

/**
 * Submit selected (052): submits each selected draft that's ready, each on its own, and says what
 * happened to each. A draft that stopped being ready since the page loaded says why.
 */
export const submitSelectedAction = serverAction(async (ids: string[]): Promise<BulkResult[]> => {
  const { results } = await submitManyDrafts(await requestHeaders(), { ids });
  revalidatePath("/submissions");
  const t = await getTranslations("author.actions");
  return Promise.all(
    results.map(async (r) => ({
      id: r.id,
      name: "submission" in r ? itemNameOf(r.submission) : r.id,
      result: r.result,
      reasons:
        r.result === "not_a_member"
          ? [await errorText(new NotAMemberError(r.submission.workspace.name))]
          : r.result === "not_ready"
            ? r.issues.filter((i) => i.severity === "error").map((i) => i.message)
            : r.result === "not_found"
              ? [t("notYours")]
              : r.result === "not_submittable"
                ? [t("notDraft")]
                : [],
      ...(r.result === "not_a_member" ? { joinWorkspace: r.submission.workspace.name } : {}),
    })),
  );
});
