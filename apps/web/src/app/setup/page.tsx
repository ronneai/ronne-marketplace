import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth-shell/AuthShell";
import { SetupPage } from "@/features/setup/SetupPage";
import { DEFAULT_VALUES, type SetupPageProps } from "@/features/setup/types";
import { pageTitle } from "@/i18n/page-title";
import { currentPath, requestChoosableLocales } from "@/i18n/server";
import { loadConfig } from "@/server/config";
import { redactDatabaseUrl } from "@/server/db/url";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { SIGN_IN_PATH } from "@/server/domains/identity/models/route-guard";
import { requestHeaders } from "@/server/http/request-headers";
import { defaultDataPath, defaultPublicUrl, hostCommand, runtimeOf } from "@/server/runtime";
import { getSetupState } from "@/server/setup/state";

export const generateMetadata = async () => {
  const t = await getTranslations("admin.setup.page");
  return { title: pageTitle(t("metaTitle")) };
};

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
    runtime: runtimeOf(),
    localUrl: defaultPublicUrl(),
    envFile: config.envFile,
    publicUrlFromEnvironment: Boolean(process.env.PUBLIC_URL),
    setupCodeCommand: hostCommand("setup-code"),
    currentDatabase:
      state === "incomplete" && config.databaseUrl
        ? redactDatabaseUrl(config.databaseUrl)
        : undefined,
    initial: {
      ...DEFAULT_VALUES,
      keep: state === "incomplete",
      path: defaultDataPath("ronne.db"),
      publicUrl: config.publicUrl ?? defaultPublicUrl(),
    },
  };
  return (
    <AuthShell here={await currentPath()} languages={await requestChoosableLocales()} wide>
      <SetupPage page={page} />
    </AuthShell>
  );
};

export default Setup;
