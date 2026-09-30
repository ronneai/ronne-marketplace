"use server";

import { redirect } from "next/navigation";
import { loadConfig } from "@/server/config";
import { clientIp } from "@/server/domains/identity/models/client-ip";
import { requestHeaders } from "@/server/http/request-headers";
import {
  appContext,
  installAllWith,
  installMigrationsWith,
  installRootWith,
  installSettingsWith,
  testDatabaseWith,
} from "./install";
import type { InstallState, StepOutcome, TestResult } from "./types";

/**
 * The web setup's server actions (feature 036): thin over `install.ts`. Anyone can call them
 * until the instance is ready, and each refuses once it is.
 */
const context = async () =>
  appContext({
    via: "web",
    ipAddress: clientIp(await requestHeaders(), loadConfig().trustProxy),
  });

export const testDatabase = async (form: FormData): Promise<TestResult> =>
  testDatabaseWith(await context(), form);

export const installSettings = async (form: FormData): Promise<StepOutcome> =>
  installSettingsWith(await context(), form);

export const installMigrations = async (): Promise<StepOutcome> =>
  installMigrationsWith(await context());

export const installRoot = async (form: FormData): Promise<StepOutcome> =>
  installRootWith(await context(), form);

/**
 * The single-form install, for browsers without JavaScript. When it finishes, it goes to sign-in
 * with the root email filled in: the setup page would only redirect there anyway, now that the
 * instance is ready. A failure comes back to the form with the progress and the error.
 */
export const installAll = async (previous: InstallState, form: FormData): Promise<InstallState> => {
  const state = await installAllWith(await context(), previous, form);
  if (state.done) redirect(`/sign-in?email=${encodeURIComponent(state.done.email)}&setup=done`);
  return state;
};
