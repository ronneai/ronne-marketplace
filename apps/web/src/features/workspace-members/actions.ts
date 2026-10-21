"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { workspacePath } from "@/features/admin-workspaces/list";
import { errorText } from "@/i18n/errors";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import {
  addMembers,
  changeMemberRole,
  memberCandidates,
  removeMember,
} from "@/server/domains/workspaces/actions/workspaces";
import { WorkspacesError } from "@/server/domains/workspaces/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { Candidate, MemberActionState } from "./types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

/** Runs a member change, turning domain errors into the form's error line (092). */
const attempt = async (form: FormData, work: () => Promise<string>): Promise<MemberActionState> => {
  try {
    const done = await work();
    revalidatePath(workspacePath(text(form, "workspace")));
    revalidatePath("/workspaces");
    revalidatePath("/admin/users");
    return { done };
  } catch (error) {
    if (error instanceof WorkspacesError || error instanceof IdentityError)
      return { error: await errorText(error) };
    throw error;
  }
};

/** Add members' search: people not in the workspace yet whose email or name has the text. */
export const findCandidates = serverAction(
  async (
    workspaceId: string,
    query: string,
  ): Promise<{ users: Candidate[] } | { error: string }> => {
    try {
      return { users: await memberCandidates(await requestHeaders(), { workspaceId, query }) };
    } catch (error) {
      if (error instanceof WorkspacesError || error instanceof IdentityError)
        return { error: await errorText(error) };
      throw error;
    }
  },
);

export const addMembersFromForm = serverAction(
  async (_previous: MemberActionState, form: FormData): Promise<MemberActionState> =>
    attempt(form, async () => {
      const userIds = form.getAll("userId").map(String);
      const results = await addMembers(await requestHeaders(), {
        workspaceId: text(form, "workspaceId"),
        userIds,
        role: text(form, "role"),
      });
      const added = results.filter((r) => r.result === "added").length;
      const already = results.length - added;
      const t = await getTranslations("workspaces.results");
      return already > 0 ? t("addedAlready", { added, already }) : t("added", { added });
    }),
);

export const changeMemberRoleFromForm = serverAction(
  async (_previous: MemberActionState, form: FormData): Promise<MemberActionState> =>
    attempt(form, async () => {
      await changeMemberRole(await requestHeaders(), {
        workspaceId: text(form, "workspaceId"),
        userId: text(form, "userId"),
        role: text(form, "role"),
      });
      const role = text(form, "role");
      const roles = await getTranslations("common.roles");
      // The role was accepted by the service, so it is one of the three; anything else is shown as typed.
      const known = role === "admin" || role === "moderator" || role === "user";
      return (await getTranslations("workspaces.results"))("now", {
        role: known ? roles(role) : role,
      });
    }),
);

export const removeMemberFromForm = serverAction(
  async (_previous: MemberActionState, form: FormData): Promise<MemberActionState> =>
    attempt(form, async () => {
      await removeMember(await requestHeaders(), {
        workspaceId: text(form, "workspaceId"),
        userId: text(form, "userId"),
      });
      return (await getTranslations("workspaces.results"))("removed");
    }),
);
