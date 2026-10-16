import { redirect } from "next/navigation";
import { SecurityPage } from "@/features/account-security/SecurityPage";
import { twoFactorStatus } from "@/server/domains/identity/actions/two-factor";
import { SIGN_IN_PATH } from "@/server/domains/identity/models/route-guard";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Two-factor sign-in · Account · Ronne AI Marketplace" };

/** The (app) layout already requires a signed-in user; the status is read for this request. */
const AccountSecurityPage = async () => {
  const status = await twoFactorStatus(await requestHeaders());
  if (!status) redirect(SIGN_IN_PATH);
  return <SecurityPage status={status} />;
};

export default AccountSecurityPage;
