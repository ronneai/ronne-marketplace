import type { ReactNode } from "react";
import { Panel } from "@/components/ui/Panel";
import { SignInMethodsPanel } from "./SignInMethodsPanel";

/**
 * The Authentication tab's panels, in order (122). Each is a server component with its own
 * heading; two-factor (105), identity providers (106) and SCIM (108) add one here, not a page.
 */
const PANELS: readonly { id: string; render: () => ReactNode | Promise<ReactNode> }[] = [
  { id: "sign-in-methods", render: () => <SignInMethodsPanel /> },
];

/**
 * Admin › Settings › Authentication: how people sign in, decided by root. The page calls it for
 * its panels, as it reads the other tabs' data, so a panel may read its own.
 */
export const AuthenticationTab = async () => {
  const panels = await Promise.all(
    PANELS.map(async (panel) => ({ id: panel.id, content: await panel.render() })),
  );
  return panels.map((panel) => (
    <Panel key={panel.id} padding="lg">
      {panel.content}
    </Panel>
  ));
};
