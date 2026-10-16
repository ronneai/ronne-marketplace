import { PageHeader, Panel } from "@/components/ui/Panel";
import { ChangePasswordForm } from "@/features/account/ChangePasswordForm";
import { AccountTabs } from "@/features/account-security/AccountTabs";

export const metadata = { title: "Password · Account · Ronne AI Marketplace" };

/** The (app) layout already requires a signed-in user. */
const ChangePasswordPage = () => {
  return (
    <>
      <PageHeader
        title="Account"
        description="Your password and how you sign in. Each change is recorded in the audit log."
      />
      <AccountTabs current="password" />
      <Panel padding="lg">
        <section aria-labelledby="password-title" className="grid gap-4">
          <div className="grid gap-1">
            <h2 id="password-title" className="text-base font-semibold text-fg">
              Change password
            </h2>
            <p className="text-sm text-muted">
              Other browsers and devices are signed out when it changes.
            </p>
          </div>
          <ChangePasswordForm />
        </section>
      </Panel>
    </>
  );
};

export default ChangePasswordPage;
