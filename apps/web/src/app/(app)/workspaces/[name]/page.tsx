import { formatScopeName } from "@ronneai/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { parseListQuery, type SearchParams } from "@/components/ui/data-table/list-query";
import { PageHeader } from "@/components/ui/Panel";
import { TabLinks } from "@/components/ui/TabLinks";
import { scopesQueryOf, workspaceScopesList } from "@/features/admin-scopes/list";
import { CreateScopeDialog, EditScopeButton } from "@/features/admin-scopes/ScopeDialogs";
import { ScopesTable } from "@/features/admin-scopes/ScopesTable";
import { workspacePath } from "@/features/admin-workspaces/list";
import { MoveScopeButton, MoveState } from "@/features/admin-workspaces/MoveScope";
import {
  DeleteWorkspaceButton,
  EditWorkspaceButton,
  RenameWorkspaceButton,
  VisibilityButton,
} from "@/features/admin-workspaces/WorkspaceDialogs";
import { loadPinnedShelf } from "@/features/pins/load-shelves";
import { PinnedShelf } from "@/features/pins/ShelfSections";
import {
  checkedMembersState,
  membersQueryOf,
  workspaceMembersList,
} from "@/features/workspace-members/list";
import { MembersTable } from "@/features/workspace-members/MembersTable";
import { RequestsTable } from "@/features/workspace-requests/RequestsTable";
import { ScopeMovesTable } from "@/features/workspace-requests/ScopeMovesTable";
import { NotIn } from "@/features/workspaces/WorkspacesPage";
import { pageTitle } from "@/i18n/page-title";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can } from "@/server/domains/identity/models/permissions";
import { pageScopes } from "@/server/domains/items/actions/scopes";
import { shelfKey } from "@/server/domains/shelves/models/shelf";
import {
  movesToAnswer,
  ownRequests,
  pageMembers,
  pendingRequests,
  scopeMovesIn,
  viewWorkspace,
} from "@/server/domains/workspaces/actions/workspaces";
import type { ScopeMove } from "@/server/domains/workspaces/models/scope-move";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../../hold";

export const generateMetadata = async () => {
  const t = await getTranslations("workspaces.page");
  return { title: pageTitle(t("workspace")) };
};

/** The name from the address; a malformed escape is left as typed, and then isn't found. */
const decoded = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * One workspace (feature 090), under Workspaces (115): for everyone who sees it, its description,
 * visibility, their role or Ask to join, and its scopes. What they may do shows to those allowed:
 * root and its admins edit the description, rename it (113), manage the members (092), create and
 * move scopes; its moderators answer requests to join (094); only root changes its visibility and
 * deletes it, while it has no scopes. `global` can't be changed or deleted. A workspace the reader
 * doesn't see is a 404, as a name no workspace has.
 */
const WorkspacePage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<SearchParams>;
}) => {
  await holdPage();
  const request = await requestHeaders();
  const me = await getCurrentUser(request);
  if (!me) notFound();
  const t = await getTranslations("workspaces");
  const roles = await getTranslations("common.roleTitle");
  const shelves = await getTranslations("shelves");
  const { name } = await params;
  const workspace = await viewWorkspace(request, decoded(name));
  if (!workspace) notFound();
  const path = workspacePath(workspace.name);
  const query = await searchParams;
  // A personal workspace (114) is its owner's alone: no members to manage, no requests to answer,
  // no visibility to change, never deleted. Only its scopes.
  const personal = workspace.ownerId !== null;
  // Tabs on this page's own address: its scopes, for everyone; `tab=members`, its members (092),
  // for root and its admins; `tab=requests`, the requests to join it (094) and the scope moves into
  // it (115), for whoever answers them. Asked for without the right, a tab shows the scopes.
  const tabs = [
    ["scopes", t("workspacePage.scopes"), path],
    ...(!personal && can(me, "members.manage", workspace.id)
      ? ([["members", t("workspacePage.members"), `${path}?tab=members`]] as const)
      : []),
    ...(!personal && can(me, "access_requests.answer", workspace.id)
      ? ([["requests", t("workspacePage.requests"), `${path}?tab=requests`]] as const)
      : []),
  ] as const;
  const tab = tabs.some(([id]) => id === query.tab)
    ? (query.tab as "members" | "requests")
    : "scopes";
  const role = me.role === "root" ? "root" : me.workspaces[workspace.id];

  const content = async () => {
    if (tab === "requests") {
      const [{ requests, total }, { moves }] = await Promise.all([
        pendingRequests(request, workspace.id),
        movesToAnswer(request, { workspaceId: workspace.id }),
      ]);
      return (
        <div className="grid gap-3">
          <Help id="requests-who" />
          {/* The moves into it (115), for root and its admins (global's are root's alone). */}
          {moves.length > 0 ? (
            <section aria-labelledby="scope-moves" className="mb-4 grid gap-3">
              <h2 id="scope-moves" className="text-base font-semibold text-fg">
                {t("workspacePage.scopeMoves")}
              </h2>
              <ScopeMovesTable moves={moves} />
            </section>
          ) : null}
          <RequestsTable
            requests={requests.map((r) => ({
              ...r,
              canPickRole: can(me, "members.manage", workspace.id),
            }))}
            total={total}
          />
        </div>
      );
    }
    if (tab === "members") {
      const list = workspaceMembersList(path);
      const state = checkedMembersState(parseListQuery(list, query));
      const members = await pageMembers(request, {
        ...membersQueryOf(state),
        workspaceId: workspace.id,
      });
      return (
        <MembersTable
          workspace={{ id: workspace.id, name: workspace.name, isGlobal: workspace.isGlobal }}
          list={list}
          state={state}
          members={members.rows}
          page={{ next: members.next, previous: members.previous }}
          total={members.total}
          me={me.id}
        />
      );
    }
    const list = workspaceScopesList(path);
    const state = parseListQuery(list, query);
    const scopes = await pageScopes(request, {
      ...scopesQueryOf(state),
      workspaceId: workspace.id,
    });
    // Move… for root and the workspace's admins (115), and each scope's open or declined move.
    const canMove = can(me, "scopes.move", workspace.id);
    const canEdit = can(me, "scopes.create", workspace.id);
    const moves = canMove ? await scopeMovesIn(request, { workspaceId: workspace.id }) : {};
    return (
      <>
        {can(me, "scopes.create", workspace.id) ? (
          <div className="mb-3">
            <CreateScopeDialog workspace={{ id: workspace.id, name: workspace.name }} />
          </div>
        ) : null}
        <ScopesTable
          list={list}
          state={state}
          scopes={scopes.scopes}
          page={{ next: scopes.next, previous: scopes.previous }}
          total={scopes.total}
          note={(scope) =>
            moves[scope.id] ? (
              <MoveState move={moves[scope.id] as ScopeMove} workspace={workspace.name} />
            ) : null
          }
          // Only for those who may edit or move a scope: everyone else gets no actions column.
          actions={
            !canEdit && !canMove
              ? undefined
              : (scope) => (
                  <span className="inline-flex flex-nowrap items-center gap-1">
                    {/* Scope names are unique per workspace (118): `acme/infra` says which one. */}
                    {canEdit ? (
                      <EditScopeButton
                        name={formatScopeName({
                          workspace: scope.workspace.name,
                          scope: scope.name,
                        }).slice(1)}
                        description={scope.description}
                      />
                    ) : null}
                    {canMove && moves[scope.id]?.status !== "open" ? (
                      <MoveScopeButton
                        scope={{ id: scope.id, name: scope.name }}
                        workspace={workspace.name}
                      />
                    ) : null}
                  </span>
                )
          }
        />
      </>
    );
  };

  return (
    <>
      <p className="mb-2 text-sm">
        <Link
          href="/workspaces"
          className="text-link hover:underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
        >
          {t("workspacePage.all")}
        </Link>
      </p>
      <PageHeader
        title={<span className="font-mono">{workspace.name}</span>}
        description={workspace.description}
        actions={
          workspace.isGlobal ? null : (
            <>
              {can(me, "workspace.edit", workspace.id) ? (
                <EditWorkspaceButton name={workspace.name} description={workspace.description} />
              ) : null}
              {can(me, "workspace.rename", workspace.id) ? (
                <RenameWorkspaceButton name={workspace.name} />
              ) : null}
              {can(me, "workspaces.manage") && !personal ? (
                <>
                  <VisibilityButton name={workspace.name} visibility={workspace.visibility} />
                  <DeleteWorkspaceButton name={workspace.name} scopes={workspace.scopes} />
                </>
              ) : null}
            </>
          )
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted">
        <Badge>
          {personal
            ? t("list.kind.personal")
            : workspace.visibility === "private"
              ? t("list.kind.private")
              : t("list.kind.public")}
        </Badge>
        {workspace.isGlobal ? <span>{t("workspacePage.global")}</span> : null}
        {personal ? (
          <span>
            {t("workspacePage.personal", { owner: workspace.ownerId === me.id ? "you" : "other" })}
          </span>
        ) : null}
        {/* Their role there, or Ask to join where they aren't a member (094). */}
        {personal ? null : role ? (
          <Badge tone="accent">{roles(role)}</Badge>
        ) : (
          <NotIn
            workspace={workspace.name}
            request={(await ownRequests(request)).find((r) => r.workspace === workspace.name)}
          />
        )}
      </div>
      {/* Its pinned items (125), for whoever sees the workspace; Manage for its admins and root. */}
      {
        await (async () => {
          const shelf = { kind: "workspace" as const, workspaceId: workspace.id };
          const pinned = await loadPinnedShelf(request, shelf);
          return (
            <div className="mb-6 empty:hidden">
              <PinnedShelf
                id="workspace-pins"
                title={shelves("home.workspacePins")}
                entries={pinned.entries}
                starred={pinned.starred}
                manage={
                  can(me, "pins.manage", workspace.id)
                    ? { key: shelfKey(shelf), label: workspace.name }
                    : undefined
                }
              />
            </div>
          );
        })()
      }
      <TabLinks
        label={t("workspacePage.tabsLabel")}
        current={tab}
        tabs={tabs.map(([id, label, href]) => ({ id, label, href }))}
      />
      {await content()}
    </>
  );
};

export default WorkspacePage;
