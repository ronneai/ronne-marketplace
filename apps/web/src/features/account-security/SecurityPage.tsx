import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/ui/Panel";
import { AccountTabs } from "./AccountTabs";
import { type SecurityStatus, TwoFactorPanel } from "./TwoFactorPanel";

export type { SecurityStatus } from "./TwoFactorPanel";

/**
 * `/account/security` (feature 105): two-factor sign-in on your own account. Off: set it up. On:
 * how many backup codes are left, new ones, and turning it off. No password (company sign-in
 * only): the provider protects the sign-in.
 */
export const SecurityPage = ({
  status,
  required = null,
  continueTo = null,
  language = true,
}: {
  status: SecurityStatus;
  /** Root's requirement holding this person here until they set it up (105), or null. */
  required?: "reviewers" | "everyone" | null;
  /** The page a held person came from, offered once two-factor is on (107), or null. */
  continueTo?: string | null;
  /** Whether the Language tab shows (141). */
  language?: boolean;
}) => {
  const t = useTranslations("account.header");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <AccountTabs current="security" language={language} />
      <TwoFactorPanel status={status} required={required} continueTo={continueTo} />
    </>
  );
};
