import Form from "next/form";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { type Column, DataTable, HiddenListFields } from "@/components/ui/data-table/DataTable";
import { FilterChips } from "@/components/ui/data-table/FilterChips";
import { SubmitOnChange } from "@/components/ui/data-table/SubmitOnChange";
import { Input, Label, selectClasses } from "@/components/ui/Field";
import { LocalTime } from "@/components/ui/LocalTime";
import type { Workspace } from "@/server/domains/workspaces/models/workspace";
import { type WorkspacesList, type WorkspacesListState, workspacePath } from "./list";

const Search = ({
  list,
  state,
  kinds,
}: {
  list: WorkspacesList;
  state: WorkspacesListState;
  kinds: boolean;
}) => (
  <div className="grid gap-2">
    <Form action={list.path} scroll={false} className="flex flex-wrap items-end gap-2">
      <HiddenListFields list={list} state={state} omit={kinds ? ["q", "kind"] : ["q"]} />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <Label htmlFor="workspace-search">Search</Label>
        <Input
          id="workspace-search"
          name="q"
          type="search"
          placeholder={
            state.filters.kind === "personal" ? "Name, description or owner" : "Name or description"
          }
          maxLength={100}
          defaultValue={state.filters.q}
        />
      </div>
      {kinds ? (
        // Root's (114): every user has a personal workspace, so they're listed on their own.
        <div className="grid gap-1.5">
          <Label htmlFor="workspace-kind">Kind</Label>
          <select
            id="workspace-kind"
            name="kind"
            defaultValue={state.filters.kind}
            className={selectClasses}
          >
            <option value="">Shared</option>
            <option value="personal">Personal</option>
          </select>
        </div>
      ) : null}
      <button type="submit" data-submit className={buttonClasses("secondary")}>
        Search
      </button>
      <SubmitOnChange />
    </Form>
    <FilterChips list={list} state={state} labels={{ q: "Search", kind: "Kind" }} />
  </div>
);

export const VISIBILITY_LABELS: Record<Workspace["visibility"], string> = {
  public: "Public",
  private: "Private",
};

const columns: Column<Workspace, "name" | "created">[] = [
  {
    id: "name",
    header: "Workspace",
    sort: "name",
    className: "w-48",
    mono: true,
    truncate: true,
    render: (workspace) => (
      <Link
        href={workspacePath(workspace.name)}
        title={workspace.name}
        className="text-link hover:underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
      >
        {workspace.name}
      </Link>
    ),
  },
  {
    id: "description",
    header: "Description",
    truncate: true,
    render: (workspace) => <span title={workspace.description}>{workspace.description}</span>,
  },
  {
    id: "visibility",
    header: "Visibility",
    className: "w-28",
    render: (workspace) => <Badge>{VISIBILITY_LABELS[workspace.visibility]}</Badge>,
  },
  {
    id: "scopes",
    header: "Scopes",
    className: "w-20",
    mono: true,
    align: "right",
    render: (workspace) => workspace.scopes,
  },
  {
    id: "moderators",
    header: "Moderators",
    className: "w-32",
    // With none, only root reviews its submissions (091). "None": the header already says what.
    render: (workspace) =>
      workspace.moderators > 0 ? (
        <span className="font-mono">{workspace.moderators}</span>
      ) : (
        <span className="text-muted">None</span>
      ),
  },
  {
    id: "created",
    header: "Created",
    sort: "created",
    className: "w-28",
    mono: true,
    hideOnMobile: true,
    render: (workspace) => <LocalTime value={workspace.createdAt} precision="day" />,
  },
];

/**
 * A personal workspace's columns (114): its owner instead of visibility and moderators, which are
 * always private and nobody.
 */
const personalColumns: Column<Workspace, "name" | "created">[] = [
  ...columns.filter((c) => c.id === "name"),
  {
    id: "owner",
    header: "Owner",
    truncate: true,
    render: (workspace) => <span title={workspace.ownerEmail ?? ""}>{workspace.ownerEmail}</span>,
  },
  ...columns.filter((c) => c.id === "scopes" || c.id === "created"),
];

/** Admin › Workspaces (feature 090): `global` first, then sorted, searched and paged on the server. */
export const WorkspacesTable = ({
  list,
  state,
  workspaces,
  page,
  total,
  kinds = false,
}: {
  list: WorkspacesList;
  state: WorkspacesListState;
  workspaces: Workspace[];
  page: { next: string | null; previous: string | null };
  total: { count: number; capped: boolean };
  /** The Kind filter, root's (114). */
  kinds?: boolean;
}) => (
  <DataTable
    list={list}
    state={state}
    columns={state.filters.kind === "personal" ? personalColumns : columns}
    rows={workspaces}
    rowKey={(workspace) => workspace.id}
    page={page}
    total={total}
    noun={total.count === 1 && !total.capped ? "workspace" : "workspaces"}
    toolbar={<Search list={list} state={state} kinds={kinds} />}
    empty={{
      none: "No workspaces yet.",
      filtered: "No workspaces match this search.",
    }}
  />
);
