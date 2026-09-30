import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SetupPage } from "@/features/setup/SetupPage";
import { DEFAULT_VALUES, type SetupPageProps } from "@/features/setup/types";
import { loadConfig } from "@/server/config";
import { redactDatabaseUrl } from "@/server/db/url";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { SIGN_IN_PATH } from "@/server/domains/identity/models/route-guard";
import { requestHeaders } from "@/server/http/request-headers";
import { getSetupState } from "@/server/setup/state";

export const metadata = { title: "Set up · Ronne AI Marketplace" };

/** The web setup (feature 036). Once the instance is ready, it only redirects. */
const Setup = async () => {
  await connection();
  const config = loadConfig();
  const state = await getSetupState(config);
  if (state === "ready") {
    redirect((await getCurrentUser(await requestHeaders())) ? "/" : SIGN_IN_PATH);
  }
  // `unavailable` never gets here: the root layout shows the panel instead of any page.
  const page: SetupPageProps = {
    state: state === "incomplete" ? "incomplete" : "not_configured",
    runtime: process.env.RONNE_RUNTIME === "docker" ? "docker" : "node",
    envFile: config.envFile,
    publicUrlFromEnvironment: Boolean(process.env.PUBLIC_URL),
    currentDatabase:
      state === "incomplete" && config.databaseUrl
        ? redactDatabaseUrl(config.databaseUrl)
        : undefined,
    initial: {
      ...DEFAULT_VALUES,
      keep: state === "incomplete",
      publicUrl: config.publicUrl ?? DEFAULT_VALUES.publicUrl,
    },
  };
  return <SetupPage page={page} />;
};

export default Setup;
