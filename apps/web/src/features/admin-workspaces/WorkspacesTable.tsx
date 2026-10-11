import Form from "next/form";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { type Column, DataTable, HiddenListFields } from "@/components/ui/data-table/DataTable";
import { FilterChips } from "@/components/ui/data-table/FilterChips";
import { listUrl } from "@/components/ui/data-table/list-query";
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
          placeholder={
            state.filters.kind === "personal" ? "Name, description or owner" : "Name or description"
          }
          maxLength={100}
          defaultValue={state.filters.q}
        />
      </div>
      <button type="submit" data-submit className={buttonClasses("secondary")}>
        Search
      </button>
      <SubmitOnChange />
    </Form>
    <FilterChips
      list={list}
      state={state}
      labels={{ q: "Search", kind: "Kind" }}
      hidden={["kind"]}
    />
  </div>
);

type KindCounts = Record<"shared" | "personal", { count: number; capped: boolean }>;

const tabClasses =
  "rounded-full border border-hairline px-3 py-1 text-sm text-muted hover:text-fg aria-[current=page]:border-transparent aria-[current=page]:bg-fg aria-[current=page]:text-canvas outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/**
 * Shared and Personal (114, as tabs since 115): root's two lists, each with how many match the
 * search, the one shown marked. Switching keeps the search and sort, and starts at the first page.
 */
const KindTabs = ({
  list,
  state,
  counts,
}: {
  list: WorkspacesList;
  state: WorkspacesListState;
  counts: KindCounts;
}) => (
  <nav aria-label="Kind" className="flex flex-wrap gap-2">
    {(
      [
        ["", "Shared", counts.shared],
        ["personal", "Personal", counts.personal],
      ] as const
    ).map(([kind, label, n]) => (
      <Link
        key={label}
        href={listUrl(list, state, { filters: { kind } })}
        aria-current={state.filters.kind === kind ? "page" : undefined}
        className={tabClasses}
      >
        {label} ({n.count}
        {n.capped ? "+" : ""})
      </Link>
    ))}
  </nav>
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

/** Root's Workspaces list (feature 090; under Workspaces since 115): `global` first, then sorted, searched and paged on the server. */
export const WorkspacesTable = ({
  list,
  state,
  workspaces,
  page,
  total,
  kinds,
}: {
  list: WorkspacesList;
  state: WorkspacesListState;
  workspaces: Workspace[];
  page: { next: string | null; previous: string | null };
  total: { count: number; capped: boolean };
  /** Root's Shared and Personal tabs (114, 115), with how many of each match the search. */
  kinds?: KindCounts;
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
    toolbar={
      <div className="grid gap-3">
        {kinds ? <KindTabs list={list} state={state} counts={kinds} /> : null}
        <Search list={list} state={state} />
      </div>
    }
    empty={{
      none: "No workspaces yet.",
      filtered: "No workspaces match this search.",
    }}
  />
);
