import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/AppShell";
import { signOutFromMenu } from "@/features/account/actions";
import { parseTheme, THEME_COOKIE } from "@/features/theme/theme";
import { requireUser } from "@/server/domains/identity/actions/session";
import { requestHeaders } from "@/server/http/request-headers";

/**
 * Pages inside the app frame (feature 032). Every page here needs a signed-in user (feature 006):
 * `src/proxy.ts` only checks for a cookie, so this is where the session is really checked.
 */
const AppLayout = async ({ children }: { children: ReactNode }) => {
  const request = await requestHeaders();
  const user = await requireUser(request);
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <AppShell user={user} theme={theme} signOutAction={signOutFromMenu}>
      {children}
    </AppShell>
  );
};

export default AppLayout;
