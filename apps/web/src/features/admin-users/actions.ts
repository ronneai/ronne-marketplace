"use server";

import { revalidatePath } from "next/cache";
import {
  adminChangeRole,
  adminCreateUser,
  adminDisableImpact,
  adminDisableUser,
  adminEnableUser,
  adminResetPassword,
} from "@/server/domains/identity/actions/user-admin";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import { setUserWorkspaces, userMemberships } from "@/server/domains/workspaces/actions/workspaces";
import { WorkspacesError } from "@/server/domains/workspaces/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import type { AdminActionState } from "./types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

/** The typed password, or undefined to generate one (the default). */
const chosenPassword = (form: FormData) =>
  text(form, "passwordMode") === "type" ? text(form, "password") : undefined;

/**
 * Runs an admin change and turns the identity domain's errors into the dialog's `ERR:` line.
 * Anything else is a bug, and is thrown.
 */
const attempt = async (
  work: () => Promise<Omit<AdminActionState, "error">>,
): Promise<AdminActionState> => {
  try {
    const result = await work();
    revalidatePath("/admin/users");
    return result;
  } catch (error) {
    if (error instanceof IdentityError || error instanceof WorkspacesError)
      return { error: error.message };
    throw error;
  }
};

/** A user's memberships, for their Workspaces dialog (092): `global` first. */
export const userWorkspacesFor = async (
  userId: string,
): Promise<
  { rows: { workspaceId: string; role: "admin" | "moderator" | "user" }[] } | { error: string }
> => {
  try {
    const memberships = await userMemberships(await requestHeaders(), userId);
    return { rows: memberships.map(({ workspaceId, role }) => ({ workspaceId, role })) };
  } catch (error) {
    if (error instanceof IdentityError || error instanceof WorkspacesError)
      return { error: error.message };
    throw error;
  }
};

/** The dialog's rows, sent as JSON: each `{ workspaceId, role }`; anything else is dropped. */
const workspacesFrom = (form: FormData) => {
  try {
    const value: unknown = JSON.parse(text(form, "workspaces") || "[]");
    if (!Array.isArray(value)) return [];
    return value.flatMap((row) =>
      row && typeof row.workspaceId === "string" && typeof row.role === "string"
        ? [{ workspaceId: row.workspaceId, role: row.role }]
        : [],
    );
  } catch {
    return [];
  }
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Saves a user's Workspaces dialog (092): the difference, in one go, and says what changed. */
export const saveUserWorkspacesFromForm = async (
  _previous: AdminActionState,
  form: FormData,
): Promise<AdminActionState> =>
  attempt(async () => {
    const { added, changed, removed } = await setUserWorkspaces(await requestHeaders(), {
      userId: text(form, "userId"),
      workspaces: workspacesFrom(form),
    });
    const parts = [
      added ? `${plural(added, "workspace")} added` : "",
      changed ? `${plural(changed, "role")} changed` : "",
      removed ? `${plural(removed, "workspace")} removed` : "",
    ].filter(Boolean);
    return { done: parts.length ? `Saved: ${parts.join(", ")}.` : "Nothing changed." };
  });

export const createUserFromForm = async (
  _previous: AdminActionState,
  form: FormData,
): Promise<AdminActionState> =>
  attempt(async () => {
    const created = await adminCreateUser(await requestHeaders(), {
      email: text(form, "email"),
      name: text(form, "name"),
      role: text(form, "role"),
      password: chosenPassword(form),
    });
    return { oneTime: { email: created.email, password: created.password } };
  });

export const changeRoleFromForm = async (
  _previous: AdminActionState,
  form: FormData,
): Promise<AdminActionState> =>
  attempt(async () => {
    await adminChangeRole(await requestHeaders(), text(form, "userId"), text(form, "role"));
    return { done: `Role changed to ${text(form, "role")}.` };
  });

export const disableUserFromForm = async (
  _previous: AdminActionState,
  form: FormData,
): Promise<AdminActionState> =>
  attempt(async () => {
    await adminDisableUser(await requestHeaders(), text(form, "userId"));
    return { done: "Disabled. They're signed out everywhere." };
  });

export const enableUserFromForm = async (
  _previous: AdminActionState,
  form: FormData,
): Promise<AdminActionState> =>
  attempt(async () => {
    await adminEnableUser(await requestHeaders(), text(form, "userId"));
    return { done: "Enabled. They can sign in again." };
  });

export const resetPasswordFromForm = async (
  _previous: AdminActionState,
  form: FormData,
): Promise<AdminActionState> =>
  attempt(async () => {
    const reset = await adminResetPassword(
      await requestHeaders(),
      text(form, "userId"),
      chosenPassword(form),
    );
    return { oneTime: reset };
  });

/** What disabling would end, for the confirm dialog. */
export const disableImpactFor = async (
  userId: string,
): Promise<{ sessions: number; tokens: number } | { error: string }> => {
  try {
    return await adminDisableImpact(await requestHeaders(), userId);
  } catch (error) {
    if (error instanceof IdentityError) return { error: error.message };
    throw error;
  }
};
