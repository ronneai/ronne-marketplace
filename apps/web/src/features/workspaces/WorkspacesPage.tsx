import Link from "next/link";
import { useTranslations } from "next-intl";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { LocalTime } from "@/components/ui/LocalTime";
import { PageHeader } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";
import { workspacePath } from "@/features/admin-workspaces/list";
import type { OwnRequest } from "@/server/domains/workspaces/models/access-request";
import type { MyWorkspace } from "@/server/domains/workspaces/services/access-requests";
import { AskToJoinButton, CancelRequestButton } from "./RequestControls";

/**
 * Where a request stands, for its requester (094): Requested (cancel), or Declined on a date with
 * the reason. Nothing for an answered or cancelled one: the row offers Ask to join again.
 */
export const RequestState = ({ request }: { request: OwnRequest }) => {
  const t = useTranslations("workspaces.request");
  if (request.status === "open")
    return (
      <span className="inline-flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>
          {t.rich("requested", {
            date: () => <LocalTime value={request.createdAt} precision="day" />,
          })}
        </span>
        <CancelRequestButton requestId={request.id} workspace={request.workspace} />
      </span>
    );
  if (request.status !== "declined" || !request.decidedAt) return null;
  const after = request.askAgainFrom;
  const decidedAt = request.decidedAt;
  return (
    <span className="grid gap-0.5 text-sm text-muted">
      <span>
        {t.rich(after ? "declinedAgain" : "declined", {
          date: () => <LocalTime value={decidedAt} precision="day" />,
          again: () => (after ? <LocalTime value={after} precision="day" /> : null),
        })}
      </span>
      {request.reason ? (
        <span className="text-fg">{t("reason", { reason: request.reason })}</span>
      ) : null}
    </span>
  );
};

/**
 * What a row, or a workspace's page (115), offers someone who isn't in the workspace: their
 * request's state, or Ask to join.
 */
export const NotIn = ({
  workspace,
  request,
}: {
  workspace: string;
  request: OwnRequest | undefined;
}) => {
  if (request?.status === "open") return <RequestState request={request} />;
  const canAsk = !request || request.askAgainFrom === null;
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      {request?.status === "declined" ? <RequestState request={request} /> : null}
      {canAsk ? <AskToJoinButton workspace={workspace} /> : null}
    </span>
  );
};

/**
 * /workspaces (094): the workspaces the reader sees, public ones and private ones they're in,
 * with their role in each, or Ask to join. Below, their requests to names not in that list: a
 * private workspace asked from its link, or a name no workspace has, which look the same.
 */
export const WorkspacesPage = ({
  workspaces,
  requests,
}: {
  workspaces: MyWorkspace[];
  requests: OwnRequest[];
}) => {
  const t = useTranslations("workspaces");
  const roles = useTranslations("common.roleTitle");
  const byName = new Map(requests.map((r) => [r.workspace, r]));
  const listed = new Set(workspaces.map((w) => w.name));
  const others = requests.filter(
    (r) => !listed.has(r.workspace) && (r.status === "open" || r.status === "declined"),
  );
  return (
    <>
      <PageHeader title={t("page.list")} description={t("list.description")} />
      <div className="grid gap-8">
        <Table>
          <thead>
            <tr>
              <Th>{t("list.workspace")}</Th>
              <Th>{t("list.visibility")}</Th>
              <Th>{t("list.you")}</Th>
            </tr>
          </thead>
          <tbody>
            {workspaces.map((w) => (
              <tr key={w.name}>
                <Td className="py-2">
                  {/* Its page (115): its scopes, and what the reader may do there. */}
                  <Link
                    href={workspacePath(w.name)}
                    className="block font-mono text-[13px] text-link hover:underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    {w.name}
                  </Link>
                  <span className="block text-xs text-muted">{w.description}</span>
                </Td>
                <Td>
                  <Badge>
                    {w.personal
                      ? t("list.kind.personal")
                      : w.isGlobal
                        ? t("list.kind.everyone")
                        : w.visibility === "private"
                          ? t("list.kind.private")
                          : t("list.kind.public")}
                  </Badge>
                </Td>
                <Td className="py-2">
                  {w.personal ? (
                    // Yours alone (114): its page has its scopes, Rename and Edit description.
                    <span className="inline-flex flex-wrap items-center gap-3">
                      <Badge tone="accent">{t("list.yours")}</Badge>
                      <Help id="personal-workspace" iconOnly />
                    </span>
                  ) : w.role ? (
                    <Badge tone="accent">{roles(w.role)}</Badge>
                  ) : (
                    <NotIn workspace={w.name} request={byName.get(w.name)} />
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {others.length > 0 ? (
          <section className="grid gap-3" aria-labelledby="other-requests">
            <h2 id="other-requests" className="text-base font-semibold text-fg">
              {t("list.otherTitle")}
            </h2>
            <p className="text-sm text-muted">{t("list.otherIntro")}</p>
            <Table>
              <thead>
                <tr>
                  <Th>{t("list.name")}</Th>
                  <Th>{t("list.request")}</Th>
                </tr>
              </thead>
              <tbody>
                {others.map((r) => (
                  <tr key={r.id}>
                    <Td mono>{r.workspace}</Td>
                    <Td className="py-2">
                      <RequestState request={r} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </section>
        ) : null}
      </div>
    </>
  );
};
