import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Notice } from "@/components/ui/Notice";
import { PageHeader, Panel } from "@/components/ui/Panel";
import type { JoinTarget } from "@/server/domains/workspaces/services/access-requests";
import { AskToJoinForm } from "./RequestControls";
import { RequestState } from "./WorkspacesPage";

/** The link to the Workspaces page, written inside the sentence that mentions it. */
const toWorkspaces = (chunks: ReactNode) => (
  <Link
    href="/workspaces"
    className="text-link hover:underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
  >
    {chunks}
  </Link>
);

/**
 * /workspaces/<name>/join (094): the link root or a workspace's moderators send. A public
 * workspace shows its description; a private one the reader isn't in shows only its name, as a
 * name no workspace has does, so the page can't tell them apart. Members are told they're in.
 */
export const JoinPage = ({ target }: { target: JoinTarget }) => {
  const t = useTranslations("workspaces.join");
  const title = t.rich("title", {
    name: target.name,
    mono: (chunks) => <span className="font-mono">{chunks}</span>,
  });
  if (target.kind === "member")
    return (
      <>
        <PageHeader title={title} />
        <Notice kind="info" title={t("memberTitle")}>
          <p className="mt-1 text-muted">{t.rich("memberBody", { link: toWorkspaces })}</p>
        </Notice>
      </>
    );
  const { request } = target;
  const waiting = request && (request.status === "open" || request.askAgainFrom !== null);
  return (
    <>
      <PageHeader
        title={title}
        description={target.kind === "open" ? target.description : undefined}
      />
      <Panel padding="lg" className="grid max-w-xl gap-4">
        {request && (request.status === "open" || request.status === "declined") ? (
          <RequestState request={request} />
        ) : null}
        {waiting ? null : (
          <>
            <p className="text-sm text-muted">{t.rich("waiting", { link: toWorkspaces })}</p>
            <AskToJoinForm workspace={target.name} />
          </>
        )}
      </Panel>
    </>
  );
};
