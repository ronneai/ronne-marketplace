"use server";

import { revalidatePath } from "next/cache";
import { workspacePath } from "@/features/admin-workspaces/list";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import {
  addMembers,
  changeMemberRole,
  memberCandidates,
  removeMember,
} from "@/server/domains/workspaces/actions/workspaces";
import { WorkspacesError } from "@/server/domains/workspaces/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import type { Candidate, MemberActionState } from "./types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

/** Runs a member change, turning domain errors into the form's error line (092). */
const attempt = async (form: FormData, work: () => Promise<string>): Promise<MemberActionState> => {
  try {
    const done = await work();
    revalidatePath(workspacePath(text(form, "workspace")));
    revalidatePath("/admin/workspaces");
    revalidatePath("/admin/users");
    return { done };
  } catch (error) {
    if (error instanceof WorkspacesError || error instanceof IdentityError)
      return { error: error.message };
    throw error;
  }
};

/** Add members' search: people not in the workspace yet whose email or name has the text. */
export const findCandidates = async (
  workspaceId: string,
  query: string,
): Promise<{ users: Candidate[] } | { error: string }> => {
  try {
    return { users: await memberCandidates(await requestHeaders(), { workspaceId, query }) };
  } catch (error) {
    if (error instanceof WorkspacesError || error instanceof IdentityError)
      return { error: error.message };
    throw error;
  }
};

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

export const addMembersFromForm = async (
  _previous: MemberActionState,
  form: FormData,
): Promise<MemberActionState> =>
  attempt(form, async () => {
    const userIds = form.getAll("userId").map(String);
    const results = await addMembers(await requestHeaders(), {
      workspaceId: text(form, "workspaceId"),
      userIds,
      role: text(form, "role"),
    });
    const added = results.filter((r) => r.result === "added").length;
    const already = results.length - added;
    return already > 0
      ? `Added ${people(added)}; ${people(already)} already in it.`
      : `Added ${people(added)}.`;
  });

export const changeMemberRoleFromForm = async (
  _previous: MemberActionState,
  form: FormData,
): Promise<MemberActionState> =>
  attempt(form, async () => {
    await changeMemberRole(await requestHeaders(), {
      workspaceId: text(form, "workspaceId"),
      userId: text(form, "userId"),
      role: text(form, "role"),
    });
    return `Now ${text(form, "role")}.`;
  });

export const removeMemberFromForm = async (
  _previous: MemberActionState,
  form: FormData,
): Promise<MemberActionState> =>
  attempt(form, async () => {
    await removeMember(await requestHeaders(), {
      workspaceId: text(form, "workspaceId"),
      userId: text(form, "userId"),
    });
    return "Removed.";
  });
