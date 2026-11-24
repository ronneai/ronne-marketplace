import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SignInPage } from "@/features/sign-in/SignInPage";
import { currentPath, requestChoosableLocales } from "@/i18n/server";
import { loadConfig } from "@/server/config";
import {
  effectivePasswordPolicy,
  signInProviders,
} from "@/server/domains/identity/actions/password-policy";
import { passwordResetOpenness } from "@/server/domains/identity/actions/password-reset";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { signUpOpenness } from "@/server/domains/identity/actions/sign-up";
import { safeNextPath } from "@/server/domains/identity/models/route-guard";
import { getAppAuthIfConfigured } from "@/server/domains/identity/repositories/auth-instance";
import { requestHeaders } from "@/server/http/request-headers";
import { hostCommand } from "@/server/runtime";

export const generateMetadata = async () => ({
  title: `${(await getTranslations("auth.signIn"))("metaTitle")} · Ronne AI Marketplace`,
});

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
    signedUp?: string | string[];
    reset?: string | string[];
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
  const [providers, policy, signUp, reset] = app
    ? await Promise.all([
        signInProviders(app),
        effectivePasswordPolicy(app),
        // Self-registration (190): its link only while it's open.
        loadConfig().authSecret ? signUpOpenness(app) : null,
        // Reset by email (194): *Forgot?* opens it only while it's open.
        loadConfig().authSecret ? passwordResetOpenness(app) : null,
      ])
    : [[], "everyone" as const, null, null];
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
      signUpOpen={signUp?.open ?? false}
      resetByEmail={reset?.open ?? false}
      resetDone={one(params.reset) === "done"}
      signedUp={one(params.signedUp)}
      here={await currentPath()}
      languages={await requestChoosableLocales()}
    />
  );
};

export default SignIn;
