import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignInPage } from "@/features/sign-in/SignInPage";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { safeNextPath } from "@/server/domains/identity/models/route-guard";

export const metadata = { title: "Sign in · Ronne" };

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next: raw } = await searchParams;
  const next = safeNextPath(Array.isArray(raw) ? raw[0] : raw);
  // Already signed in: straight on.
  if (await getCurrentUser(await headers())) redirect(next);
  return <SignInPage next={next} />;
}
