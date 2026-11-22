import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AuthShell } from "@/components/auth-shell/AuthShell";
import { Notice } from "@/components/ui/Notice";
import { CodeStep } from "@/features/sign-up/CodeStep";
import { currentPath, requestChoosableLocales } from "@/i18n/server";
import { loadConfig } from "@/server/config";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { signUpCodePage, signUpOpenness } from "@/server/domains/identity/actions/sign-up";
import { SIGN_UP_COOKIE, signUpIdFromCookie } from "@/server/domains/identity/models/sign-up-guard";
import { getAppAuthIfConfigured } from "@/server/domains/identity/repositories/auth-instance";
import { requestHeaders } from "@/server/http/request-headers";

export const generateMetadata = async () => ({
  title: `${(await getTranslations("auth.signUp.code"))("metaTitle")} · Ronne AI Marketplace`,
});

/**
 * The code page (190). The sign-up is found through this browser's cookie, never the address, so
 * a code seen over a shoulder can't be used elsewhere (Decision 10).
 */
const SignUpCode = async () => {
  if (await getCurrentUser(await requestHeaders())) redirect("/");
  const app = getAppAuthIfConfigured();
  const authSecret = loadConfig().authSecret;
  if (!app || !authSecret) notFound();
  const t = await getTranslations("auth.signUp.code");
  const id = signUpIdFromCookie(authSecret, (await cookies()).get(SIGN_UP_COOKIE)?.value);
  const [policy, page] = await Promise.all([signUpOpenness(app), signUpCodePage(id, app)]);
  if (!policy.open && !id) notFound();
  const shell = async (children: ReactNode) => (
    <AuthShell here={await currentPath()} languages={await requestChoosableLocales()}>
      <div className="grid gap-1">
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-fg">
          {t("title")}
        </h1>
      </div>
      {children}
    </AuthShell>
  );
  if (!policy.open || !page)
    return shell(
      <>
        <Notice kind="info" title={policy.open ? t("ended") : t("closed")} />
        {policy.open ? (
          <a href="/sign-up" className="text-sm text-link underline-offset-2 hover:underline">
            {t("startAgain")}
          </a>
        ) : null}
      </>,
    );
  return shell(
    <>
      <div className="grid gap-1 text-sm text-muted">
        <p>
          {t("sent", {
            email: page.email,
            minutes: Math.max(1, Math.round((page.expiresAt.getTime() - Date.now()) / 60_000)),
          })}
        </p>
        <p>{t("here")}</p>
      </div>
      <CodeStep resendAt={page.resendAt.getTime()} />
    </>,
  );
};

export default SignUpCode;
