import { getTranslations } from "next-intl/server";
import { Help } from "@/components/help/Help";
import { parseListQuery, type SearchParams } from "@/components/ui/data-table/list-query";
import { PageHeader } from "@/components/ui/Panel";
import {
  ADMIN_WORKSPACES_LIST,
  checkedWorkspacesState,
  workspacesQueryOf,
} from "@/features/admin-workspaces/list";
import { CreateWorkspaceDialog } from "@/features/admin-workspaces/WorkspaceDialogs";
import { WorkspacesTable } from "@/features/admin-workspaces/WorkspacesTable";
import { WorkspacesPage } from "@/features/workspaces/WorkspacesPage";
import { pageTitle } from "@/i18n/page-title";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can } from "@/server/domains/identity/models/permissions";
import {
  myWorkspaces,
  ownRequests,
  pageWorkspaces,
} from "@/server/domains/workspaces/actions/workspaces";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../hold";

export const generateMetadata = async () => {
  const t = await getTranslations("workspaces.page");
  return { title: pageTitle(t("list")) };
};

/**
 * Workspaces (094; everything about them here since 115). Root gets every workspace as a server
 * data table, searched and paged, with New workspace and the Kind filter: shared ones, or personal
 * ones with their owners (114). Everyone else, the workspaces they see, with their role in each
 * or Ask to join, and their requests to join. Each name opens the workspace's page. The (app)
 * layout requires a session.
 */
const Workspaces = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  await holdPage();
  const request = await requestHeaders();
  const me = await getCurrentUser(request);
  const t = await getTranslations("workspaces");
  if (can(me, "workspaces.manage")) {
    const state = checkedWorkspacesState(parseListQuery(ADMIN_WORKSPACES_LIST, await searchParams));
    const { workspaces, next, previous, total, kinds } = await pageWorkspaces(
      request,
      workspacesQueryOf(state),
    );
    return (
      <>
        <PageHeader
          title={t("page.list")}
          description={t("list.rootDescription")}
          actions={<CreateWorkspaceDialog />}
        />
        <Help id="workspace" className="mb-4" />
        <WorkspacesTable
          list={ADMIN_WORKSPACES_LIST}
          state={state}
          workspaces={workspaces}
          page={{ next, previous }}
          total={total}
          kinds={kinds}
        />
      </>
    );
  }
  const [workspaces, requests] = await Promise.all([myWorkspaces(request), ownRequests(request)]);
  return <WorkspacesPage workspaces={workspaces} requests={requests} />;
};

export default Workspaces;
