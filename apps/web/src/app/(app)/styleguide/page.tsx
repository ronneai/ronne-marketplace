import { notFound } from "next/navigation";
import { canViewStyleguide } from "@/features/styleguide/access";
import { Styleguide } from "@/features/styleguide/Styleguide";

export const metadata = { title: "Styleguide · Ronne" };

export default function StyleguidePage() {
  // 006 passes the signed-in user; until then, production has none, so it's a 404 there.
  if (!canViewStyleguide(process.env.NODE_ENV, null)) notFound();
  return <Styleguide />;
}
