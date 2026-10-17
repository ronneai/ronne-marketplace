import type { ReactNode } from "react";
import { Panel } from "@/components/ui/Panel";
import { twoFactorCoverage } from "@/server/domains/identity/actions/two-factor";
import type { TwoFactorCoverage } from "@/server/domains/identity/models/two-factor-coverage";
import { instanceSettings } from "@/server/domains/settings/actions/settings";
import type { TwoFactorPolicy } from "@/server/domains/settings/models/two-factor-policy";
import { requestHeaders } from "@/server/http/request-headers";
import { SIGN_IN_METHODS, SignInMethodsPanel } from "./SignInMethodsPanel";
import { TwoFactorPolicyForm } from "./TwoFactorPolicyForm";
import { TWO_FACTOR_CHOICES } from "./two-factor-choices";

/** What the tab's panels read, once per render. */
type AuthenticationData = { twoFactorPolicy: TwoFactorPolicy; coverage: TwoFactorCoverage };

/**
 * The Authentication tab's panels, in order (122). Each is a server component with its own
 * heading; two-factor (105), identity providers (106) and SCIM (108) add one here, not a page.
 */
const PANELS: readonly { id: string; render: (data: AuthenticationData) => ReactNode }[] = [
  {
    id: "sign-in-methods",
    render: ({ twoFactorPolicy }) => (
      <SignInMethodsPanel
        methods={[
          ...SIGN_IN_METHODS,
          {
            name: "Two-factor sign-in",
            on: twoFactorPolicy !== "optional",
            note:
              twoFactorPolicy === "optional"
                ? "Optional: people turn it on themselves."
                : `Required for ${TWO_FACTOR_CHOICES.find((c) => c.value === twoFactorPolicy)?.label.toLowerCase()}.`,
          },
        ]}
      />
    ),
  },
  {
    id: "two-factor",
    render: ({ twoFactorPolicy, coverage }) => (
      <TwoFactorPolicyForm policy={twoFactorPolicy} coverage={coverage} />
    ),
  },
];

/**
 * Admin › Settings › Authentication: how people sign in, decided by root. The page calls it for
 * its panels (root only: the page already refused anyone else).
 */
export const AuthenticationTab = async () => {
  const request = await requestHeaders();
  const [settings, coverage] = await Promise.all([
    instanceSettings(request),
    twoFactorCoverage(request),
  ]);
  const data = { twoFactorPolicy: settings.twoFactorPolicy, coverage };
  return PANELS.map((panel) => (
    <Panel key={panel.id} padding="lg">
      {panel.render(data)}
    </Panel>
  ));
};
