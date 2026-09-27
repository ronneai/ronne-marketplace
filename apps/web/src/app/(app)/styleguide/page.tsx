import { notFound } from "next/navigation";
import { canViewStyleguide } from "@/features/styleguide/access";
import { Styleguide } from "@/features/styleguide/Styleguide";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Styleguide · Ronne" };

export default async function StyleguidePage() {
  const user = await getCurrentUser(await requestHeaders());
  if (!canViewStyleguide(process.env.NODE_ENV, user)) notFound();
  return <Styleguide />;
}
