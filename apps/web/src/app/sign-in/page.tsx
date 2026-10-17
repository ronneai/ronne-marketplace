import { redirect } from "next/navigation";
import { SignInPage } from "@/features/sign-in/SignInPage";
import { loadConfig } from "@/server/config";
import {
  effectivePasswordPolicy,
  signInProviders,
} from "@/server/domains/identity/actions/password-policy";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { safeNextPath } from "@/server/domains/identity/models/route-guard";
import { getAppAuthIfConfigured } from "@/server/domains/identity/repositories/auth-instance";
import { requestHeaders } from "@/server/http/request-headers";
import { hostCommand } from "@/server/runtime";

export const metadata = { title: "Sign in · Ronne AI Marketplace" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const SignIn = async ({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    email?: string | string[];
    setup?: string | string[];
    reason?: string | string[];
    error?: string | string[];
  }>;
}) => {
  const params = await searchParams;
  const next = safeNextPath(one(params.next));
  // The web setup (036) sends root here with the email filled in.
  const email = (one(params.email) ?? "").trim().slice(0, 255) || undefined;
  // Already signed in: straight on.
  if (await getCurrentUser(await requestHeaders())) redirect(next);
  // The identity providers that are on, and whether password sign-in is root only (106).
  const app = getAppAuthIfConfigured();
  const [providers, policy] = app
    ? await Promise.all([signInProviders(app), effectivePasswordPolicy(app)])
    : [[], "everyone" as const];
  return (
    <SignInPage
      next={next}
      resetCommand={hostCommand("reset-root-password")}
      registry={loadConfig().publicUrl}
      email={email}
      setupDone={one(params.setup) === "done"}
      again={one(params.reason)}
      providers={providers}
      rootOnly={policy === "root_only"}
      ssoError={one(params.error)}
    />
  );
};

export default SignIn;
