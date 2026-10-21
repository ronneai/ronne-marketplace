import { useTranslations } from "next-intl";
import { TabLinks } from "@/components/ui/TabLinks";

/** The Account pages (006, 105, 129): Password, Two-factor sign-in and Language, each with its own address. */
export const ACCOUNT_TABS = [
  { id: "password", href: "/account/password" },
  { id: "security", href: "/account/security" },
  { id: "language", href: "/account/language" },
] as const;

export const AccountTabs = ({ current }: { current: (typeof ACCOUNT_TABS)[number]["id"] }) => {
  const t = useTranslations("account.tabs");
  return (
    <TabLinks
      label={t("label")}
      tabs={ACCOUNT_TABS.map((tab) => ({ ...tab, label: t(tab.id) }))}
      current={current}
    />
  );
};
