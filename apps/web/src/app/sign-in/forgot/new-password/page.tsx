import { getTranslations } from "next-intl/server";
import { Notice } from "@/components/ui/Notice";
import { NewPasswordForm } from "@/features/forgot-password/NewPasswordForm";
import { resetPageGuard } from "@/features/forgot-password/page-guard";
import { resetShell } from "@/features/forgot-password/ResetShell";

export const generateMetadata = async () => ({
  title: `${(await getTranslations("auth.forgot.newPassword"))("metaTitle")} · Ronne AI Marketplace`,
});

/**
 * The new-password page (194): it works once, for 10 minutes from the last step, only in the
 * browser that holds the flow. Saving signs no one in: every session ends.
 */
const ForgotNewPassword = async () => {
  const { hasFlow } = await resetPageGuard();
  const t = await getTranslations("auth.forgot.newPassword");
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
  return resetShell({
    title: t("title"),
    subtitle: <p>{t("subtitle")}</p>,
    children: <NewPasswordForm />,
  });
};

export default ForgotNewPassword;
