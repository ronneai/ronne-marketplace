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
}: {
  status: SecurityStatus;
  /** Root's requirement holding this person here until they set it up (105), or null. */
  required?: "reviewers" | "everyone" | null;
  /** The page a held person came from, offered once two-factor is on (107), or null. */
  continueTo?: string | null;
}) => (
  <>
    <PageHeader
      title="Account"
      description="Your password and how you sign in. Each change is recorded in the audit log."
    />
    <AccountTabs current="security" />
    <TwoFactorPanel status={status} required={required} continueTo={continueTo} />
  </>
);
