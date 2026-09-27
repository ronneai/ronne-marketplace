import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { canViewStyleguide } from "@/features/styleguide/access";
import { Styleguide } from "@/features/styleguide/Styleguide";
import { getCurrentUser } from "@/server/domains/identity/actions/session";

export const metadata = { title: "Styleguide · Ronne" };

export default async function StyleguidePage() {
  const user = await getCurrentUser(await headers());
  if (!canViewStyleguide(process.env.NODE_ENV, user)) notFound();
  return <Styleguide />;
}
