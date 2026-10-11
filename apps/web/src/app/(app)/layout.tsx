import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/AppShell";
import { signOutFromMenu } from "@/features/account/actions";
import { version } from "../../../package.json";
import { loadShell } from "./shell";

/**
 * Pages inside the app frame (feature 032). Every page here needs a signed-in user (feature 006),
 * which `loadShell` checks.
 */
const AppLayout = async ({ children }: { children: ReactNode }) => {
  const { user, theme, navCounts, workspaces, folded } = await loadShell();
  return (
    <AppShell
      user={user}
      theme={theme}
      signOutAction={signOutFromMenu}
      navCounts={navCounts}
      workspaces={workspaces}
      folded={folded}
      version={version}
    >
      {children}
    </AppShell>
  );
};

export default AppLayout;
