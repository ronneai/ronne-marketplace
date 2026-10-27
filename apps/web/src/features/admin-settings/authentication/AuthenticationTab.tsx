import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Panel } from "@/components/ui/Panel";
import {
  type ProviderRow,
  providerRows,
} from "@/server/domains/identity/actions/identity-providers";
import {
  hasUsableProvider,
  passwordUsersAffected,
} from "@/server/domains/identity/actions/password-policy";
import { twoFactorCoverage } from "@/server/domains/identity/actions/two-factor";
import type { TwoFactorCoverage } from "@/server/domains/identity/models/two-factor-coverage";
import { getAppAuth } from "@/server/domains/identity/repositories/auth-instance";
import { instanceSettings } from "@/server/domains/settings/actions/settings";
import type { PasswordSignInPolicy } from "@/server/domains/settings/models/password-sign-in-policy";
import type { TwoFactorPolicy } from "@/server/domains/settings/models/two-factor-policy";
import { requestHeaders } from "@/server/http/request-headers";
import { PasswordPolicyForm } from "./PasswordPolicyForm";
import { IdentityProvidersPanel } from "./providers/IdentityProvidersPanel";
import { type SignInMethod, SignInMethodsPanel } from "./SignInMethodsPanel";
import { TwoFactorPolicyForm } from "./TwoFactorPolicyForm";

type MethodsT = Awaited<ReturnType<typeof getTranslations<"admin.settings.methods">>>;

/** What the tab's panels read, once per render. */
type AuthenticationData = {
  twoFactorPolicy: TwoFactorPolicy;
  coverage: TwoFactorCoverage;
  providers: ProviderRow[];
  passwordPolicy: PasswordSignInPolicy;
  usableProvider: boolean;
  affected: number;
};

/**
 * What the Sign-in methods panel lists (122, 106): email and password (with the *Root only* note
 * while a provider is on), each identity provider on or off, and two-factor's requirement.
 */
export const signInMethods = (
  {
    twoFactorPolicy,
    passwordPolicy,
    providers,
  }: Pick<AuthenticationData, "twoFactorPolicy" | "passwordPolicy" | "providers">,
  t: MethodsT,
): SignInMethod[] => [
  {
    name: t("password.name"),
    on: true,
    note:
      passwordPolicy === "root_only" && providers.some((p) => p.enabled)
        ? t("password.rootOnly")
        : t("password.note"),
  },
  ...providers.map((p) => ({
    name: `${p.name} (${p.typeLabel})`,
    on: p.enabled,
    note:
      p.status === "failing"
        ? t("provider.failing")
        : p.domains.length > 0
          ? t("provider.domains", { domains: p.domains.join(", ") })
          : t("provider.linkOnly"),
  })),
  {
    name: t("twoFactor.name"),
    on: twoFactorPolicy !== "optional",
    note: t(`twoFactor.${twoFactorPolicy}`),
  },
];

/**
 * The Authentication tab's panels, in order (122). Each is a server component with its own
 * heading; two-factor (105), identity providers (106) and SCIM (108) add one here, not a page.
 */
const PANELS: readonly {
  id: string;
  render: (data: AuthenticationData, t: MethodsT) => ReactNode;
}[] = [
  {
    id: "sign-in-methods",
    render: ({ twoFactorPolicy, passwordPolicy, providers }, t) => (
      <SignInMethodsPanel
        methods={signInMethods({ twoFactorPolicy, passwordPolicy, providers }, t)}
      />
    ),
  },
  {
    id: "identity-providers",
    render: ({ providers }) => <IdentityProvidersPanel rows={providers} />,
  },
  {
    id: "password-sign-in",
    render: ({ passwordPolicy, usableProvider, affected }) => (
      <PasswordPolicyForm
        policy={passwordPolicy}
        usableProvider={usableProvider}
        affected={affected}
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
  const t = await getTranslations("admin.settings.methods");
  const app = getAppAuth();
  const [settings, coverage, providers, usableProvider, affected] = await Promise.all([
    instanceSettings(request),
    twoFactorCoverage(request),
    providerRows(request),
    hasUsableProvider(app),
    passwordUsersAffected(app),
  ]);
  const data = {
    twoFactorPolicy: settings.twoFactorPolicy,
    coverage,
    providers,
    passwordPolicy: settings.passwordSignInPolicy,
    usableProvider,
    affected,
  };
  return PANELS.map((panel) => (
    <Panel key={panel.id} padding="lg">
      {panel.render(data, t)}
    </Panel>
  ));
};
