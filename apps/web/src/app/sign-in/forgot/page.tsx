import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Help } from "@/components/help/Help";
import { resetPageGuard } from "@/features/forgot-password/page-guard";
import { RequestForm } from "@/features/forgot-password/RequestForm";
import { resetShell } from "@/features/forgot-password/ResetShell";
import { requestLocale } from "@/i18n/server";
import { passwordResetOpenness } from "@/server/domains/identity/actions/password-reset";
import { formStamp, issueChallenge } from "@/server/domains/identity/models/sign-up-guard";

export const generateMetadata = async () => ({
  title: `${(await getTranslations("auth.forgot"))("metaTitle")} · Ronne AI Marketplace`,
});

/**
 * Forgot your password (194): one field, the email address. Only while root has reset by email
 * on and email can go: otherwise back to sign-in, where *Forgot?* shows the old note.
 */
const Forgot = async () => {
  const { app, authSecret } = await resetPageGuard();
  const policy = await passwordResetOpenness(app);
  if (!policy.open) redirect("/sign-in");
  const t = await getTranslations("auth.forgot");
  const now = new Date();
  return resetShell({
    title: t("title"),
    subtitle: (
      <>
        <p>{t("subtitle")}</p>
        <div>
          <Help id="forgot-password" />
        </div>
      </>
    ),
    children: (
      <RequestForm
        stamp={formStamp(authSecret, now)}
        challenge={policy.challenge ? JSON.stringify(issueChallenge(authSecret, now)) : null}
        locale={await requestLocale()}
      />
    ),
  });
};

export default Forgot;
