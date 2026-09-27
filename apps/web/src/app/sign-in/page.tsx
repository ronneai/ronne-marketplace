import { redirect } from "next/navigation";
import { SignInPage } from "@/features/sign-in/SignInPage";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { safeNextPath } from "@/server/domains/identity/models/route-guard";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Sign in · Ronne" };

const SignIn = async ({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) => {
  const { next: raw } = await searchParams;
  const next = safeNextPath(Array.isArray(raw) ? raw[0] : raw);
  // Already signed in: straight on.
  if (await getCurrentUser(await requestHeaders())) redirect(next);
  return <SignInPage next={next} />;
};

export default SignIn;
