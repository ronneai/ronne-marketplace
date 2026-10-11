import { formatScopeName } from "@ronneai/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { parseListQuery, type SearchParams } from "@/components/ui/data-table/list-query";
import { PageHeader } from "@/components/ui/Panel";
import { ScrollStrip } from "@/components/ui/ScrollStrip";
import { stripTab } from "@/components/ui/scroll-strip";
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
import { VISIBILITY_LABELS } from "@/features/admin-workspaces/WorkspacesTable";
import {
  checkedMembersState,
  membersQueryOf,
  workspaceMembersList,
} from "@/features/workspace-members/list";
import { MembersTable } from "@/features/workspace-members/MembersTable";
import { RequestsTable } from "@/features/workspace-requests/RequestsTable";
import { ScopeMovesTable } from "@/features/workspace-requests/ScopeMovesTable";
import { NotIn } from "@/features/workspaces/WorkspacesPage";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can } from "@/server/domains/identity/models/permissions";
import { pageScopes } from "@/server/domains/items/actions/scopes";
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

export const metadata = { title: "Workspace · Ronne AI Marketplace" };

const ROLE_LABELS = { Root: "Root", admin: "Admin", moderator: "Moderator", user: "User" } as const;

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
  const request = await requestHeaders();
  const me = await getCurrentUser(request);
  if (!me) notFound();
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
    ["scopes", "Scopes", path],
    ...(!personal && can(me, "members.manage", workspace.id)
      ? ([["members", "Members", `${path}?tab=members`]] as const)
      : []),
    ...(!personal && can(me, "access_requests.answer", workspace.id)
      ? ([["requests", "Requests", `${path}?tab=requests`]] as const)
      : []),
  ] as const;
  const tab = tabs.some(([id]) => id === query.tab)
    ? (query.tab as "members" | "requests")
    : "scopes";
  const role = me.role === "root" ? "Root" : me.workspaces[workspace.id];

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
                Scope moves
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
            <CreateScopeDialog workspaces={[{ id: workspace.id, name: workspace.name }]} />
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
          All workspaces
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
        <Badge>{personal ? "Personal" : VISIBILITY_LABELS[workspace.visibility]}</Badge>
        {workspace.isGlobal ? (
          <span>Every instance has it, and everyone is in it. It can't be changed or deleted.</span>
        ) : null}
        {personal ? (
          <span>
            {workspace.ownerId === me.id ? "Yours" : "Its owner's"} alone, always private. Its items
            are released without review.
          </span>
        ) : null}
        {/* Their role there, or Ask to join where they aren't a member (094). */}
        {personal ? null : role ? (
          <Badge tone="accent">{ROLE_LABELS[role]}</Badge>
        ) : (
          <NotIn
            workspace={workspace.name}
            request={(await ownRequests(request)).find((r) => r.workspace === workspace.name)}
          />
        )}
      </div>
      <ScrollStrip label="Workspace" className="mb-4 gap-1 border-b border-hairline">
        {tabs.map(([id, label, href]) => (
          <Link
            key={id}
            href={href}
            aria-current={tab === id ? "page" : undefined}
            className={`${stripTab} -mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-fg aria-[current=page]:border-accent aria-[current=page]:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus`}
          >
            {label}
          </Link>
        ))}
      </ScrollStrip>
      {await content()}
    </>
  );
};

export default WorkspacePage;
