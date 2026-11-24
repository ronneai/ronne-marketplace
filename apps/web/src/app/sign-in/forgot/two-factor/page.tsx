import { getTranslations } from "next-intl/server";
import { Notice } from "@/components/ui/Notice";
import { resetPageGuard } from "@/features/forgot-password/page-guard";
import { resetShell } from "@/features/forgot-password/ResetShell";
import { TwoFactorForm } from "@/features/forgot-password/TwoFactorForm";

export const generateMetadata = async () => ({
  title: `${(await getTranslations("auth.forgot.twoFactor"))("metaTitle")} · Ronne AI Marketplace`,
});

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** The account's two-factor step of a reset (194): only after the emailed code was right. */
const ForgotTwoFactor = async ({
  searchParams,
}: {
  searchParams: Promise<{ method?: string | string[] }>;
}) => {
  const { hasFlow } = await resetPageGuard();
  const t = await getTranslations("auth.forgot.twoFactor");
  if (!hasFlow)
    return resetShell({
      title: t("title"),
      children: (
        <>
          <Notice kind="info" title={t("errors.missing")} />
          <a
            href="/sign-in/forgot"
            className="text-sm text-link underline-offset-2 hover:underline"
          >
            {t("startAgain")}
          </a>
        </>
      ),
    });
  const method = one((await searchParams).method) === "backup" ? "backup_code" : "totp";
  return resetShell({
    title: t("title"),
    subtitle: <p>{t("intro")}</p>,
    children: <TwoFactorForm method={method} />,
  });
};

export default ForgotTwoFactor;
