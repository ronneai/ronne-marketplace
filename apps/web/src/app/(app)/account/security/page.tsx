import { redirect } from "next/navigation";
import { accountMetadata } from "@/features/account/metadata";
import { SecurityPage } from "@/features/account-security/SecurityPage";
import { twoFactorStatus } from "@/server/domains/identity/actions/two-factor";
import { SIGN_IN_PATH, safeNextPath } from "@/server/domains/identity/models/route-guard";
import { PASSWORD_PATH, passwordChangeHold } from "@/server/http/password-change-hold";
import { requestHeaders } from "@/server/http/request-headers";
import { twoFactorHold } from "@/server/http/two-factor-hold";

export const generateMetadata = accountMetadata("security");

/** The (app) layout already requires a signed-in user; the status is read for this request. */
const AccountSecurityPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) => {
  const request = await requestHeaders();
  // The password comes before two-factor (128); this page doesn't call `holdPage`.
  if (await passwordChangeHold(request)) redirect(PASSWORD_PATH);
  // Where a held person goes once it's on (107: `/device` and its code).
  const { next } = await searchParams;
  const continueTo = typeof next === "string" ? safeNextPath(next) : "/";
  const status = await twoFactorStatus(request);
  if (!status) redirect(SIGN_IN_PATH);
  // Root requires it of them and they haven't set it up (105): say why they're here.
  return (
    <SecurityPage
      status={status}
      required={await twoFactorHold(request)}
      continueTo={continueTo === "/" ? null : continueTo}
    />
  );
};

export default AccountSecurityPage;
