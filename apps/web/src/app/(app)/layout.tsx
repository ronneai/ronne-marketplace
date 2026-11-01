import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/AppShell";
import { signOutFromMenu } from "@/features/account/actions";
import { DismissibleNotice } from "@/features/notice/DismissibleNotice";
import { visibleNotice } from "@/features/notice/visible-notice";
import { version } from "../../../package.json";
import { loadShell } from "./shell";

/**
 * Pages inside the app frame (feature 032). Every page here needs a signed-in user (feature 006),
 * which `loadShell` checks.
 */
const AppLayout = async ({ children }: { children: ReactNode }) => {
  const { user, theme, navCounts, unread, workspaces, folded, current } = await loadShell();
  const notice = await visibleNotice();
  return (
    <AppShell
      user={user}
      theme={theme}
      signOutAction={signOutFromMenu}
      navCounts={navCounts}
      unread={unread}
      workspaces={workspaces}
      current={current}
      folded={folded}
      version={version}
      notice={notice ? <DismissibleNotice notice={notice} /> : null}
    >
      {children}
    </AppShell>
  );
};

export default AppLayout;
