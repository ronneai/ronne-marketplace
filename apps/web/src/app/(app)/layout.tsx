import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/AppShell";

/**
 * Pages inside the app frame (feature 032). Feature 006 makes this layout require a signed-in user
 * and passes it to the shell, with the sign-out action.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell user={null}>{children}</AppShell>;
}
