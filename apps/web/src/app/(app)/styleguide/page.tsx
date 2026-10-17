import { notFound } from "next/navigation";
import { canViewStyleguide } from "@/features/styleguide/access";
import { Styleguide } from "@/features/styleguide/Styleguide";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../hold";

export const metadata = { title: "Styleguide · Ronne AI Marketplace" };

const StyleguidePage = async () => {
  await holdPage();
  const user = await getCurrentUser(await requestHeaders());
  if (!canViewStyleguide(process.env.NODE_ENV, user)) notFound();
  return <Styleguide />;
};

export default StyleguidePage;
