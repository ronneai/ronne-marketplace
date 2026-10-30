import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth-shell/AuthShell";
import { TwoFactorStep } from "@/features/sign-in/TwoFactorStep";
import { currentPath } from "@/i18n/server";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { safeNextPath } from "@/server/domains/identity/models/route-guard";
import { requestHeaders } from "@/server/http/request-headers";

export const generateMetadata = async () => ({
  title: `${(await getTranslations("auth.twoFactor"))("metaTitle")} · Ronne AI Marketplace`,
});

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * The second step at sign-in (feature 105), after a right password for an account with two-factor
 * on. Public, like `/sign-in`: there's no session yet, only the challenge's cookie.
 */
const TwoFactorSignIn = async ({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    method?: string | string[];
  }>;
}) => {
  const params = await searchParams;
  const next = safeNextPath(one(params.next));
  if (await getCurrentUser(await requestHeaders())) redirect(next);
  const t = await getTranslations("auth.twoFactor");
  return (
    <AuthShell here={await currentPath()}>
      <div className="grid gap-1">
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-fg">
          {t("title")}
        </h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>
      <TwoFactorStep
        next={next}
        method={one(params.method) === "backup" ? "backup_code" : "totp"}
      />
      <p className="text-xs text-muted">
        {t("lost")}{" "}
        <a href="/sign-in" className="text-link underline-offset-2 hover:underline">
          {t("startAgain")}
        </a>
      </p>
    </AuthShell>
  );
};

export default TwoFactorSignIn;
