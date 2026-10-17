import { TabLinks } from "@/components/ui/TabLinks";

/** The Account pages (006, 105): Password and Two-factor sign-in, each with its own address. */
export const ACCOUNT_TABS = [
  { id: "password", label: "Password", href: "/account/password" },
  { id: "security", label: "Two-factor sign-in", href: "/account/security" },
] as const;

export const AccountTabs = ({ current }: { current: (typeof ACCOUNT_TABS)[number]["id"] }) => (
  <TabLinks label="Account" tabs={ACCOUNT_TABS} current={current} />
);
