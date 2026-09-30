import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SetupPage } from "@/features/setup/SetupPage";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { SIGN_IN_PATH } from "@/server/domains/identity/models/route-guard";
import { requestHeaders } from "@/server/http/request-headers";
import { getSetupState } from "@/server/setup/state";

export const metadata = { title: "Set up · Ronne AI Marketplace" };

/** The web setup (feature 036). Once the instance is ready, it only redirects. */
const Setup = async () => {
  await connection();
  if ((await getSetupState()) === "ready") {
    redirect((await getCurrentUser(await requestHeaders())) ? "/" : SIGN_IN_PATH);
  }
  return <SetupPage />;
};

export default Setup;
