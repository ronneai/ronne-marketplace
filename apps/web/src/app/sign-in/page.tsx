import { redirect } from "next/navigation";
import { SignInPage } from "@/features/sign-in/SignInPage";
import { loadConfig } from "@/server/config";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { safeNextPath } from "@/server/domains/identity/models/route-guard";
import { requestHeaders } from "@/server/http/request-headers";
import { hostCommand } from "@/server/runtime";

export const metadata = { title: "Sign in · Ronne AI Marketplace" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const SignIn = async ({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    email?: string | string[];
    setup?: string | string[];
  }>;
}) => {
  const params = await searchParams;
  const next = safeNextPath(one(params.next));
  // The web setup (036) sends root here with the email filled in.
  const email = (one(params.email) ?? "").trim().slice(0, 255) || undefined;
  // Already signed in: straight on.
  if (await getCurrentUser(await requestHeaders())) redirect(next);
  return (
    <SignInPage
      next={next}
      resetCommand={hostCommand("reset-root-password")}
      registry={loadConfig().publicUrl}
      email={email}
      setupDone={one(params.setup) === "done"}
    />
  );
};

export default SignIn;
