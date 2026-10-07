import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { parseListQuery, type SearchParams } from "@/components/ui/data-table/list-query";
import { PageHeader } from "@/components/ui/Panel";
import { ScrollStrip } from "@/components/ui/ScrollStrip";
import { stripTab } from "@/components/ui/scroll-strip";
import { scopesQueryOf, workspaceScopesList } from "@/features/admin-scopes/list";
import { CreateScopeDialog, EditScopeButton } from "@/features/admin-scopes/ScopeDialogs";
import { ScopesTable } from "@/features/admin-scopes/ScopesTable";
import { workspacePath } from "@/features/admin-workspaces/list";
import {
  DeleteWorkspaceButton,
  EditWorkspaceButton,
} from "@/features/admin-workspaces/WorkspaceDialogs";
import { VISIBILITY_LABELS } from "@/features/admin-workspaces/WorkspacesTable";
import {
  checkedMembersState,
  membersQueryOf,
  workspaceMembersList,
} from "@/features/workspace-members/list";
import { MembersTable } from "@/features/workspace-members/MembersTable";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can, canInSome } from "@/server/domains/identity/models/permissions";
import { pageScopes } from "@/server/domains/items/actions/scopes";
import { findWorkspace, pageMembers } from "@/server/domains/workspaces/actions/workspaces";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Workspace · Admin · Ronne AI Marketplace" };

/** The name from the address; a malformed escape is left as typed, and then isn't found. */
const decoded = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * One workspace (feature 090): its description, its members (092) and its scopes. Root and the
 * workspace's admins edit the description, manage the members and create scopes; only root deletes
 * it, while it has no scopes. `global`'s description can't be edited, and it can't be deleted. A
 * workspace the admin doesn't administer is a 404, as for anyone else.
 */
const AdminWorkspace = async ({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<SearchParams>;
}) => {
  const request = await requestHeaders();
  const me = await getCurrentUser(request);
  if (!me || !canInSome(me, "members.manage")) notFound();
  const { name } = await params;
  const workspace = await findWorkspace(request, decoded(name));
  if (!workspace) notFound();
  const path = workspacePath(workspace.name);
  const query = await searchParams;
  // Two tabs on this page's own address (092): its scopes, and with `tab=members` its members.
  const tab = query.tab === "members" ? "members" : "scopes";

  const content = async () => {
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
          actions={(scope) => <EditScopeButton name={scope.name} description={scope.description} />}
        />
      </>
    );
  };

  return (
    <>
      <p className="mb-2 text-sm">
        <Link
          href="/admin/workspaces"
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
              {can(me, "workspaces.manage") ? (
                <DeleteWorkspaceButton name={workspace.name} scopes={workspace.scopes} />
              ) : null}
            </>
          )
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted">
        <Badge>{VISIBILITY_LABELS[workspace.visibility]}</Badge>
        {workspace.isGlobal ? (
          <span>Every instance has it, and everyone is in it. It can't be changed or deleted.</span>
        ) : null}
      </div>
      <ScrollStrip label="Workspace" className="mb-4 gap-1 border-b border-hairline">
        {(
          [
            ["scopes", "Scopes", path],
            ["members", "Members", `${path}?tab=members`],
          ] as const
        ).map(([id, label, href]) => (
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

export default AdminWorkspace;
