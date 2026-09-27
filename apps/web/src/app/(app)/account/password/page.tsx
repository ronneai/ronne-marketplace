import { PageHeader, Panel } from "@/components/ui/Panel";
import { ChangePasswordForm } from "@/features/account/ChangePasswordForm";

export const metadata = { title: "Change password · Ronne" };

/** The (app) layout already requires a signed-in user. */
const ChangePasswordPage = () => {
  return (
    <>
      <PageHeader
        title="Change password"
        description="Other browsers and devices are signed out when it changes."
      />
      <Panel padding="lg">
        <ChangePasswordForm />
      </Panel>
    </>
  );
};

export default ChangePasswordPage;
