import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/AppShell";
import { signOutFromMenu } from "@/features/account/actions";
import { PATH_HEADER, requireUser } from "@/server/domains/identity/actions/session";
import { requestHeaders } from "@/server/http/request-headers";

/**
 * Pages inside the app frame (feature 032). Every page here needs a signed-in user (feature 006):
 * `src/proxy.ts` only checks for a cookie, so this is where the session is really checked.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const request = await requestHeaders();
  const user = await requireUser(request);
  const current = (request.get(PATH_HEADER) ?? "/").split("?")[0];
  return (
    <AppShell user={user} current={current} signOutAction={signOutFromMenu}>
      {children}
    </AppShell>
  );
}
