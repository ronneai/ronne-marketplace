"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { errorText } from "@/i18n/errors";
import { adminEraseUser } from "@/server/domains/identity/actions/erase-user";
import {
  adminChangeRole,
  adminCreateUser,
  adminDisableImpact,
  adminDisableUser,
  adminEnableUser,
  adminResetPassword,
  adminResetTwoFactor,
  adminSetPasswordChange,
} from "@/server/domains/identity/actions/user-admin";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import { setUserWorkspaces, userMemberships } from "@/server/domains/workspaces/actions/workspaces";
import { WorkspacesError } from "@/server/domains/workspaces/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
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
    // One user's page (123), whichever user it is.
    revalidatePath("/admin/users/[id]", "page");
    return result;
  } catch (error) {
    if (error instanceof IdentityError || error instanceof WorkspacesError)
      return { error: await errorText(error) };
    throw error;
  }
};

/** A user's memberships, for their Workspaces dialog (092): `global` first. */
export const userWorkspacesFor = serverAction(
  async (
    userId: string,
  ): Promise<
    { rows: { workspaceId: string; role: "admin" | "moderator" | "user" }[] } | { error: string }
  > => {
    try {
      const memberships = await userMemberships(await requestHeaders(), userId);
      return { rows: memberships.map(({ workspaceId, role }) => ({ workspaceId, role })) };
    } catch (error) {
      if (error instanceof IdentityError || error instanceof WorkspacesError)
        return { error: await errorText(error) };
      throw error;
    }
  },
);

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

/** Saves a user's Workspaces dialog (092): the difference, in one go, and says what changed. */
export const saveUserWorkspacesFromForm = serverAction(
  async (_previous: AdminActionState, form: FormData): Promise<AdminActionState> =>
    attempt(async () => {
      const { added, changed, removed } = await setUserWorkspaces(await requestHeaders(), {
        userId: text(form, "userId"),
        workspaces: workspacesFrom(form),
      });
      const t = await getTranslations("admin.done.users");
      const parts = [
        added ? t("added", { count: added }) : "",
        changed ? t("changed", { count: changed }) : "",
        removed ? t("removed", { count: removed }) : "",
      ].filter(Boolean);
      return { done: parts.length ? t("saved", { parts: parts.join(", ") }) : t("nothing") };
    }),
);

export const createUserFromForm = serverAction(
  async (_previous: AdminActionState, form: FormData): Promise<AdminActionState> =>
    attempt(async () => {
      const created = await adminCreateUser(await requestHeaders(), {
        email: text(form, "email"),
        name: text(form, "name"),
        role: text(form, "role"),
        password: chosenPassword(form),
        requireChange: form.get("requireChange") === "on",
      });
      return { oneTime: { email: created.email, password: created.password } };
    }),
);

export const changeRoleFromForm = serverAction(
  async (_previous: AdminActionState, form: FormData): Promise<AdminActionState> =>
    attempt(async () => {
      const role = text(form, "role");
      await adminChangeRole(await requestHeaders(), text(form, "userId"), role);
      const roles = await getTranslations("common.roles");
      const t = await getTranslations("admin.done.users");
      // A role the screen doesn't know is shown as typed.
      return {
        done: t("roleChanged", { role: role === "root" || role === "user" ? roles(role) : role }),
      };
    }),
);

export const disableUserFromForm = serverAction(
  async (_previous: AdminActionState, form: FormData): Promise<AdminActionState> =>
    attempt(async () => {
      await adminDisableUser(await requestHeaders(), text(form, "userId"));
      return { done: (await getTranslations("admin.done.users"))("disabled") };
    }),
);

export const enableUserFromForm = serverAction(
  async (_previous: AdminActionState, form: FormData): Promise<AdminActionState> =>
    attempt(async () => {
      await adminEnableUser(await requestHeaders(), text(form, "userId"));
      return { done: (await getTranslations("admin.done.users"))("enabled") };
    }),
);

export const resetPasswordFromForm = serverAction(
  async (_previous: AdminActionState, form: FormData): Promise<AdminActionState> =>
    attempt(async () => {
      const reset = await adminResetPassword(
        await requestHeaders(),
        text(form, "userId"),
        chosenPassword(form),
        undefined,
        form.get("requireChange") === "on",
      );
      return { oneTime: reset };
    }),
);

/** Asks for a new password at the next sign-in, or stops asking, without changing it (128). */
export const setPasswordChangeFromForm = serverAction(
  async (_previous: AdminActionState, form: FormData): Promise<AdminActionState> =>
    attempt(async () => {
      const required = text(form, "required") === "true";
      const { changed } = await adminSetPasswordChange(
        await requestHeaders(),
        text(form, "userId"),
        required,
      );
      const t = await getTranslations("admin.passwordChange");
      return { done: changed ? t(required ? "askedDone" : "clearedDone") : t("unchanged") };
    }),
);

export const resetTwoFactorFromForm = serverAction(
  async (_previous: AdminActionState, form: FormData): Promise<AdminActionState> =>
    attempt(async () => {
      const { reset } = await adminResetTwoFactor(await requestHeaders(), text(form, "userId"));
      const t = await getTranslations("admin.done.users");
      return { done: reset ? t("twoFactorOff") : t("twoFactorNone") };
    }),
);

/**
 * Erases the account (103), once root typed its email; the service checks the email too. The
 * list isn't revalidated here: the row would go with its dialog before root reads the outcome
 * (a search by the old email no longer finds it), so the dialog refreshes the page on Done.
 */
export const eraseUserFromForm = serverAction(
  async (_previous: AdminActionState, form: FormData): Promise<AdminActionState> => {
    try {
      await adminEraseUser(await requestHeaders(), text(form, "userId"), text(form, "confirm"));
      return { done: (await getTranslations("admin.done.users"))("erased") };
    } catch (error) {
      if (error instanceof IdentityError) return { error: await errorText(error) };
      throw error;
    }
  },
);

/** What disabling would end, for the confirm dialog. */
export const disableImpactFor = serverAction(
  async (userId: string): Promise<{ sessions: number; tokens: number } | { error: string }> => {
    try {
      return await adminDisableImpact(await requestHeaders(), userId);
    } catch (error) {
      if (error instanceof IdentityError) return { error: await errorText(error) };
      throw error;
    }
  },
);
