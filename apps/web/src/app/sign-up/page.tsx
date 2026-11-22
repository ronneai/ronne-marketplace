import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth-shell/AuthShell";
import { Help } from "@/components/help/Help";
import { SignUpForm } from "@/features/sign-up/SignUpForm";
import { currentPath, requestChoosableLocales, requestLocale } from "@/i18n/server";
import { loadConfig } from "@/server/config";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { signUpOpenness } from "@/server/domains/identity/actions/sign-up";
import { formStamp, issueChallenge } from "@/server/domains/identity/models/sign-up-guard";
import { getAppAuthIfConfigured } from "@/server/domains/identity/repositories/auth-instance";
import { requestHeaders } from "@/server/http/request-headers";

export const generateMetadata = async () => ({
  title: `${(await getTranslations("auth.signUp"))("metaTitle")} · Ronne AI Marketplace`,
});

/**
 * Create an account (190). Public, like `/sign-in`, and there only while root has sign-up on and
 * what it needs is ready: otherwise 404, so a closed instance says nothing about it.
 */
const SignUp = async () => {
  if (await getCurrentUser(await requestHeaders())) redirect("/");
  const app = getAppAuthIfConfigured();
  const authSecret = loadConfig().authSecret;
  if (!app || !authSecret) notFound();
  const policy = await signUpOpenness(app);
  if (!policy.open) notFound();
  const t = await getTranslations("auth.signUp");
  const now = new Date();
  return (
    <AuthShell here={await currentPath()} languages={await requestChoosableLocales()}>
      <div className="grid gap-1">
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-fg">
          {t("title")}
        </h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
        <div>
          <Help id="signing-up" />
        </div>
      </div>
      <SignUpForm
        stamp={formStamp(authSecret, now)}
        challenge={policy.challenge ? JSON.stringify(issueChallenge(authSecret, now)) : null}
        termsUrl={policy.termsUrl}
        termsVersion={policy.termsVersion}
        locale={await requestLocale()}
      />
      <p className="text-sm text-muted">
        {t("haveAccount")}{" "}
        <a href="/sign-in" className="text-link underline-offset-2 hover:underline">
          {t("signIn")}
        </a>
      </p>
    </AuthShell>
  );
};

export default SignUp;
