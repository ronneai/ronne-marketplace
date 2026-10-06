import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { type Column, DataTable, HiddenListFields } from "@/components/ui/data-table/DataTable";
import { FilterChips } from "@/components/ui/data-table/FilterChips";
import { SubmitOnChange } from "@/components/ui/data-table/SubmitOnChange";
import { Input, Label, selectClasses } from "@/components/ui/Field";
import { LocalTime } from "@/components/ui/LocalTime";
import type { Scope } from "@/server/domains/items/models/scope";
import type { ScopeFilter, ScopesList, ScopesListState } from "./list";

/** A workspace as the filter and column need it (090). */
export type WorkspaceOption = { name: string };

const workspaceLink = (name: string) => `/admin/workspaces/${encodeURIComponent(name)}`;

const Search = <F extends ScopeFilter>({
  list,
  state,
  workspaces,
}: {
  list: ScopesList<F>;
  state: ScopesListState<F>;
  workspaces?: WorkspaceOption[];
}) => {
  const filters = state.filters as Record<string, string>;
  return (
    <div className="grid gap-2">
      <Form action={list.path} scroll={false} className="flex flex-wrap items-end gap-2">
        <HiddenListFields
          list={list}
          state={state}
          omit={(workspaces ? ["q", "workspace"] : ["q"]) as F[]}
        />
        <div className="grid min-w-0 flex-1 gap-1.5">
          <Label htmlFor="scope-search">Search</Label>
          <Input
            id="scope-search"
            name="q"
            type="search"
            placeholder="Name or description"
            maxLength={100}
            defaultValue={filters.q}
          />
        </div>
        {workspaces ? (
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="scope-workspace">Workspace</Label>
            <select
              id="scope-workspace"
              name="workspace"
              defaultValue={filters.workspace}
              className={selectClasses}
            >
              <option value="">Any workspace</option>
              {workspaces.map((workspace) => (
                <option key={workspace.name} value={workspace.name}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <button type="submit" data-submit className={buttonClasses("secondary")}>
          Search
        </button>
        <SubmitOnChange />
      </Form>
      <FilterChips
        list={list}
        state={state}
        labels={{ q: "Search", workspace: "Workspace" } as Record<F, string>}
      />
    </div>
  );
};

const columns = (
  actions?: (scope: Scope) => ReactNode,
  withWorkspace = false,
): Column<Scope, "name" | "created">[] => [
  {
    id: "name",
    header: "Scope",
    sort: "name",
    className: "w-48",
    mono: true,
    truncate: true,
    render: (scope) => <span title={`@${scope.name}`}>@{scope.name}</span>,
  },
  {
    id: "description",
    header: "Description",
    truncate: true,
    render: (scope) => <span title={scope.description}>{scope.description}</span>,
  },
  ...(withWorkspace
    ? [
        {
          id: "workspace",
          header: "Workspace",
          className: "w-36",
          mono: true,
          truncate: true,
          render: (scope: Scope) => (
            <Link
              href={workspaceLink(scope.workspace.name)}
              title={scope.workspace.name}
              className="text-link hover:underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
            >
              {scope.workspace.name}
            </Link>
          ),
        },
      ]
    : []),
  {
    id: "creator",
    header: "Created by",
    className: "w-56",
    mono: true,
    truncate: true,
    hideOnMobile: true,
    render: (scope) => <span className="text-muted">{scope.createdBy?.email ?? "—"}</span>,
  },
  {
    id: "created",
    header: "Created",
    sort: "created",
    className: "w-28",
    mono: true,
    hideOnMobile: true,
    render: (scope) => <LocalTime value={scope.createdAt} precision="day" />,
  },
  ...(actions
    ? [
        {
          id: "actions",
          header: "",
          className: "w-20",
          align: "right" as const,
          render: actions,
        },
      ]
    : []),
];

/**
 * The scope list on /admin/scopes (feature 010, on the server data table since 061), with an
 * edit button per row. The read-only /scopes page went in 064.
 */
export const ScopesTable = <F extends ScopeFilter>({
  list,
  state,
  scopes,
  page,
  total,
  actions,
  workspaces,
}: {
  list: ScopesList<F>;
  state: ScopesListState<F>;
  scopes: Scope[];
  page: { next: string | null; previous: string | null };
  total: { count: number; capped: boolean };
  actions?: (scope: Scope) => ReactNode;
  /** Every workspace, for the Workspace filter and column (090); left out on a workspace's page. */
  workspaces?: WorkspaceOption[];
}) => (
  <DataTable
    list={list}
    state={state}
    columns={columns(actions, workspaces !== undefined)}
    rows={scopes}
    rowKey={(scope) => scope.id}
    page={page}
    total={total}
    noun={total.count === 1 && !total.capped ? "scope" : "scopes"}
    toolbar={<Search list={list} state={state} workspaces={workspaces} />}
    empty={{
      none: "No scopes yet. Root creates the first one in the admin area.",
      filtered: "No scopes match these filters.",
    }}
  />
);
