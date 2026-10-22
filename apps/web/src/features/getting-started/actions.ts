"use server";

import { revalidatePath } from "next/cache";
import {
  confirmInstall,
  hideGettingStarted,
  showGettingStarted,
} from "@/server/domains/onboarding/actions/getting-started";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";

/**
 * The Getting started panel's buttons and Account's "Show getting started again" (feature 126).
 * Plain form actions, so they work without JavaScript: the page is shown again as it is now.
 * None carries a person's id; each is about whoever is signed in.
 */
const refreshed = () => revalidatePath("/", "layout");

export const hideGettingStartedFromForm = serverAction(async (): Promise<void> => {
  await hideGettingStarted(await requestHeaders());
  refreshed();
});

export const confirmInstallFromForm = serverAction(async (): Promise<void> => {
  await confirmInstall(await requestHeaders());
  refreshed();
});

export const showGettingStartedFromForm = serverAction(async (): Promise<void> => {
  await showGettingStarted(await requestHeaders());
  refreshed();
});
