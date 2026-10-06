import Form from "next/form";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { type Column, DataTable, HiddenListFields } from "@/components/ui/data-table/DataTable";
import { FilterChips } from "@/components/ui/data-table/FilterChips";
import { SubmitOnChange } from "@/components/ui/data-table/SubmitOnChange";
import { Input, Label } from "@/components/ui/Field";
import { LocalTime } from "@/components/ui/LocalTime";
import type { Workspace } from "@/server/domains/workspaces/models/workspace";
import { type WorkspacesList, type WorkspacesListState, workspacePath } from "./list";

const Search = ({ list, state }: { list: WorkspacesList; state: WorkspacesListState }) => (
  <div className="grid gap-2">
    <Form action={list.path} scroll={false} className="flex flex-wrap items-end gap-2">
      <HiddenListFields list={list} state={state} omit={["q"]} />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <Label htmlFor="workspace-search">Search</Label>
        <Input
          id="workspace-search"
          name="q"
          type="search"
          placeholder="Name or description"
          maxLength={100}
          defaultValue={state.filters.q}
        />
      </div>
      <button type="submit" data-submit className={buttonClasses("secondary")}>
        Search
      </button>
      <SubmitOnChange />
    </Form>
    <FilterChips list={list} state={state} labels={{ q: "Search" }} />
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
    id: "created",
    header: "Created",
    sort: "created",
    className: "w-28",
    mono: true,
    hideOnMobile: true,
    render: (workspace) => <LocalTime value={workspace.createdAt} precision="day" />,
  },
];

/** Admin › Workspaces (feature 090): `global` first, then sorted, searched and paged on the server. */
export const WorkspacesTable = ({
  list,
  state,
  workspaces,
  page,
  total,
}: {
  list: WorkspacesList;
  state: WorkspacesListState;
  workspaces: Workspace[];
  page: { next: string | null; previous: string | null };
  total: { count: number; capped: boolean };
}) => (
  <DataTable
    list={list}
    state={state}
    columns={columns}
    rows={workspaces}
    rowKey={(workspace) => workspace.id}
    page={page}
    total={total}
    noun={total.count === 1 && !total.capped ? "workspace" : "workspaces"}
    toolbar={<Search list={list} state={state} />}
    empty={{
      none: "No workspaces yet.",
      filtered: "No workspaces match this search.",
    }}
  />
);
