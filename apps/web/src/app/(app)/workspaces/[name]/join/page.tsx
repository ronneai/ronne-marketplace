import { getTranslations } from "next-intl/server";
import { JoinPage } from "@/features/workspaces/JoinPage";
import { pageTitle } from "@/i18n/page-title";
import { joinTarget } from "@/server/domains/workspaces/actions/workspaces";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../../../hold";

export const generateMetadata = async () => {
  const t = await getTranslations("workspaces.page");
  return { title: pageTitle(t("join")) };
};

/** The name from the address; a malformed escape is left as typed. */
const decoded = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * A workspace's join link (094). Any signed-in user opens it; a private workspace they aren't in
 * looks the same as a name no workspace has, so the link confirms nothing.
 */
const JoinWorkspace = async ({ params }: { params: Promise<{ name: string }> }) => {
  await holdPage();
  const { name } = await params;
  const target = await joinTarget(await requestHeaders(), decoded(name));
  return <JoinPage target={target} />;
};

export default JoinWorkspace;
