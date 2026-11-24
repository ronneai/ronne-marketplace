import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { loadConfig } from "@/server/config";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { resetCookieName } from "@/server/domains/identity/models/password-reset-cookie";
import { getAppAuthIfConfigured } from "@/server/domains/identity/repositories/auth-instance";
import { requestHeaders } from "@/server/http/request-headers";

/**
 * What every reset page checks first (194): a signed-in person goes to Account › Change password,
 * and an instance not set up yet has no reset. Returns the app and whether this browser holds a
 * flow's cookie.
 */
export const resetPageGuard = async () => {
  if (await getCurrentUser(await requestHeaders())) redirect("/account/password");
  const app = getAppAuthIfConfigured();
  const { authSecret, publicUrl } = loadConfig();
  if (!app || !authSecret) notFound();
  const token = (await cookies()).get(resetCookieName(publicUrl))?.value ?? null;
  return { app, authSecret, hasFlow: token !== null };
};
