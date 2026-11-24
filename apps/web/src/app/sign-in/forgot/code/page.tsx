import { getTranslations } from "next-intl/server";
import { Notice } from "@/components/ui/Notice";
import { CodeForm } from "@/features/forgot-password/CodeForm";
import { resetPageGuard } from "@/features/forgot-password/page-guard";
import { resetShell } from "@/features/forgot-password/ResetShell";
import { passwordResetOpenness } from "@/server/domains/identity/actions/password-reset";

export const generateMetadata = async () => ({
  title: `${(await getTranslations("auth.forgot.code"))("metaTitle")} · Ronne AI Marketplace`,
});

/**
 * The code page (194). The same words for every address. The flow is found through this
 * browser's cookie, never the address, so a code is no use in another browser. A code already
 * sent still works when root turns reset by email off meanwhile.
 */
const ForgotCode = async () => {
  const { app, hasFlow } = await resetPageGuard();
  const t = await getTranslations("auth.forgot.code");
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
  const { codeMinutes } = await passwordResetOpenness(app);
  return resetShell({
    title: t("title"),
    subtitle: (
      <>
        <p>{t("sent", { minutes: codeMinutes })}</p>
        <p>{t("here")}</p>
      </>
    ),
    children: <CodeForm />,
  });
};

export default ForgotCode;
