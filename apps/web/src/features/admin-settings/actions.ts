"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { errorText } from "@/i18n/errors";
import { adminRetryErasures } from "@/server/domains/identity/actions/erase-user";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import {
  setPasswordSignInPolicy,
  setRetention,
  setSkillScanPolicy,
  setTwoFactorPolicy,
  setUsageMinimum,
  setUsagePolicy,
} from "@/server/domains/settings/actions/settings";
import { SettingsError } from "@/server/domains/settings/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { SettingsActionState } from "./types";

/** Saves the usage policy (feature 046), turning domain errors into the form's `ERR:` line. */
export const saveUsagePolicy = serverAction(
  async (_previous: SettingsActionState, form: FormData): Promise<SettingsActionState> => {
    try {
      const { changed } = await setUsagePolicy(await requestHeaders(), form.get("usagePolicy"));
      revalidatePath("/admin/settings");
      const t = await getTranslations("admin.done.settings");
      return { done: changed ? t("usage") : t("nothing") };
    } catch (error) {
      if (error instanceof SettingsError || error instanceof IdentityError)
        return { error: await errorText(error) };
      throw error;
    }
  },
);

/** Saves the usage minimum (047), turning domain errors into the form's `ERR:` line. */
export const saveUsageMinimum = serverAction(
  async (_previous: SettingsActionState, form: FormData): Promise<SettingsActionState> => {
    try {
      const { changed } = await setUsageMinimum(await requestHeaders(), form.get("usageMinimum"));
      revalidatePath("/admin/settings");
      const t = await getTranslations("admin.done.settings");
      return { done: changed ? t("minimum") : t("nothing") };
    } catch (error) {
      if (error instanceof SettingsError || error instanceof IdentityError)
        return { error: await errorText(error) };
      throw error;
    }
  },
);

/** Saves who must use two-factor sign-in (105), turning domain errors into the form's `ERR:` line. */
export const saveTwoFactorPolicy = serverAction(
  async (_previous: SettingsActionState, form: FormData): Promise<SettingsActionState> => {
    try {
      const { changed } = await setTwoFactorPolicy(
        await requestHeaders(),
        form.get("twoFactorPolicy"),
      );
      revalidatePath("/admin/settings");
      const t = await getTranslations("admin.done.settings");
      return { done: changed ? t("twoFactor") : t("nothing") };
    } catch (error) {
      if (error instanceof SettingsError || error instanceof IdentityError)
        return { error: await errorText(error) };
      throw error;
    }
  },
);

/** Saves how long personal data is kept (102), turning domain errors into the form's `ERR:` line. */
export const saveRetention = serverAction(
  async (_previous: SettingsActionState, form: FormData): Promise<SettingsActionState> => {
    try {
      const { changed } = await setRetention(await requestHeaders(), {
        ipDays: form.get("ipDays"),
        sessionsDays: form.get("sessionsDays"),
        feedbackDays: form.get("feedbackDays"),
      });
      revalidatePath("/admin/settings");
      const t = await getTranslations("admin.done.settings");
      return { done: changed ? t("retention") : t("nothing") };
    } catch (error) {
      if (error instanceof SettingsError || error instanceof IdentityError)
        return { error: await errorText(error) };
      throw error;
    }
  },
);

/** Saves who may sign in with a password (106), turning domain errors into the form's `ERR:` line. */
export const savePasswordSignInPolicy = serverAction(
  async (_previous: SettingsActionState, form: FormData): Promise<SettingsActionState> => {
    try {
      const { changed } = await setPasswordSignInPolicy(
        await requestHeaders(),
        form.get("passwordSignInPolicy"),
        form.get("confirm") === "on",
      );
      revalidatePath("/admin/settings");
      const t = await getTranslations("admin.done.settings");
      return { done: changed ? t("password") : t("nothing") };
    } catch (error) {
      if (error instanceof SettingsError || error instanceof IdentityError)
        return { error: await errorText(error) };
      throw error;
    }
  },
);

/** Finishes the erasures whose audit log rewrite wasn't completed (103), from the Privacy tab's Retry. */
export const retryErasures = serverAction(
  async (_previous: SettingsActionState, _form: FormData): Promise<SettingsActionState> => {
    try {
      const finished = await adminRetryErasures(await requestHeaders());
      revalidatePath("/admin/settings");
      const t = await getTranslations("admin.done.settings");
      return { done: finished === 0 ? t("erasuresNone") : t("erasures", { count: finished }) };
    } catch (error) {
      if (error instanceof IdentityError) return { error: await errorText(error) };
      throw error;
    }
  },
);

/** Saves the security scan's policy (135), turning domain errors into the form's `ERR:` line. */
export const saveSkillScanPolicy = serverAction(
  async (_previous: SettingsActionState, form: FormData): Promise<SettingsActionState> => {
    try {
      const { changed } = await setSkillScanPolicy(await requestHeaders(), {
        enabled: form.get("enabled"),
        types: form.getAll("types"),
        analysis: form.get("analysis"),
      });
      revalidatePath("/admin/settings");
      const t = await getTranslations("admin.done.settings");
      return { done: changed ? t("scan") : t("nothing") };
    } catch (error) {
      if (error instanceof SettingsError || error instanceof IdentityError)
        return { error: await errorText(error) };
      throw error;
    }
  },
);
