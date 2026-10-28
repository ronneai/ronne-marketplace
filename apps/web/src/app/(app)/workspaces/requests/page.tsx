import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Help } from "@/components/help/Help";
import { PageHeader } from "@/components/ui/Panel";
import { ItemMovesTable } from "@/features/workspace-requests/ItemMovesTable";
import { RequestsTable } from "@/features/workspace-requests/RequestsTable";
import { ScopeMovesTable } from "@/features/workspace-requests/ScopeMovesTable";
import { pageTitle } from "@/i18n/page-title";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { canInSomeShared } from "@/server/domains/identity/models/permissions";
import {
  itemMovesToAnswer,
  movesToAnswer,
  requestsToAnswerList,
} from "@/server/domains/workspaces/actions/workspaces";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../../hold";

export const generateMetadata = async () => {
  const t = await getTranslations("workspaces.page");
  return { title: pageTitle(t("requests")) };
};

/**
 * Requests to join (094): every open request the reader can answer, in every workspace where they
 * moderate or administer, and all of them for root. The nav's Requests count opens it. Anyone who
 * answers nowhere gets a 404.
 */
const WorkspaceRequests = async () => {
  await holdPage();
  const request = await requestHeaders();
  const me = await getCurrentUser(request);
  // Nobody asks to join a personal workspace (114): owning one answers nothing.
  if (!me || !canInSomeShared(me, "access_requests.answer")) notFound();
  const [{ requests, total }, { moves }, { moves: itemMoves }] = await Promise.all([
    requestsToAnswerList(request),
    movesToAnswer(request),
    itemMovesToAnswer(request),
  ]);
  // Scope moves (115) are root's, and a shared workspace's admins' for moves into theirs.
  const answersMoves = me.role === "root" || canInSomeShared(me, "scopes.move");
  const t = await getTranslations("workspaces");
  return (
    <>
      <PageHeader
        title={t("requests.pageTitle")}
        description={t("requests.pageDescription")}
        actions={<Help id="requests-who" />}
      />
      <RequestsTable requests={requests} total={total} showWorkspace />
      {answersMoves ? (
        <section aria-labelledby="scope-moves" className="mt-8 grid gap-3">
          <h2 id="scope-moves" className="text-base font-semibold text-fg">
            {t("workspacePage.scopeMoves")}
          </h2>
          <p className="text-sm text-muted">{t("requests.movesIntro")}</p>
          <ScopeMovesTable moves={moves} showTarget />
        </section>
      ) : null}
      {/* Item moves (134): every moderator and admin answers those of their workspaces' items. */}
      <section aria-labelledby="item-moves" className="mt-8 grid gap-3">
        <h2 id="item-moves" className="text-base font-semibold text-fg">
          {t("workspacePage.itemMoves")}
        </h2>
        <p className="text-sm text-muted">{t("requests.itemMovesIntro")}</p>
        <ItemMovesTable moves={itemMoves} />
      </section>
    </>
  );
};

export default WorkspaceRequests;
