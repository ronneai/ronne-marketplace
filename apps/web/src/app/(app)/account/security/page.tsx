import { redirect } from "next/navigation";
import { SecurityPage } from "@/features/account-security/SecurityPage";
import { twoFactorStatus } from "@/server/domains/identity/actions/two-factor";
import { SIGN_IN_PATH } from "@/server/domains/identity/models/route-guard";
import { requestHeaders } from "@/server/http/request-headers";
import { twoFactorHold } from "@/server/http/two-factor-hold";

export const metadata = { title: "Two-factor sign-in · Account · Ronne AI Marketplace" };

/** The (app) layout already requires a signed-in user; the status is read for this request. */
const AccountSecurityPage = async () => {
  const request = await requestHeaders();
  const status = await twoFactorStatus(request);
  if (!status) redirect(SIGN_IN_PATH);
  // Root requires it of them and they haven't set it up (105): say why they're here.
  return <SecurityPage status={status} required={await twoFactorHold(request)} />;
};

export default AccountSecurityPage;
