import { notFound } from "next/navigation";
import { canViewStyleguide } from "@/features/styleguide/access";
import { Styleguide } from "@/features/styleguide/Styleguide";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Styleguide · Ronne AI Marketplace" };

const StyleguidePage = async () => {
  const user = await getCurrentUser(await requestHeaders());
  if (!canViewStyleguide(process.env.NODE_ENV, user)) notFound();
  return <Styleguide />;
};

export default StyleguidePage;
