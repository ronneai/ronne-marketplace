import Form from "next/form";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { type Column, DataTable, HiddenListFields } from "@/components/ui/data-table/DataTable";
import { FilterChips } from "@/components/ui/data-table/FilterChips";
import { SubmitOnChange } from "@/components/ui/data-table/SubmitOnChange";
import { Input, Label } from "@/components/ui/Field";
import { LocalTime } from "@/components/ui/LocalTime";
import type { Scope } from "@/server/domains/items/models/scope";
import type { ScopesList, ScopesListState } from "./list";

const Search = ({ list, state }: { list: ScopesList; state: ScopesListState }) => (
  <div className="grid gap-2">
    <Form action={list.path} scroll={false} className="flex flex-wrap items-end gap-2">
      <HiddenListFields list={list} state={state} omit={["q"]} />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <Label htmlFor="scope-search">Search</Label>
        <Input
          id="scope-search"
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

const columns = (actions?: (scope: Scope) => ReactNode): Column<Scope, "name" | "created">[] => [
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
export const ScopesTable = ({
  list,
  state,
  scopes,
  page,
  total,
  actions,
}: {
  list: ScopesList;
  state: ScopesListState;
  scopes: Scope[];
  page: { next: string | null; previous: string | null };
  total: { count: number; capped: boolean };
  actions?: (scope: Scope) => ReactNode;
}) => (
  <DataTable
    list={list}
    state={state}
    columns={columns(actions)}
    rows={scopes}
    rowKey={(scope) => scope.id}
    page={page}
    total={total}
    noun={total.count === 1 && !total.capped ? "scope" : "scopes"}
    toolbar={<Search list={list} state={state} />}
    empty={{
      none: "No scopes yet. Root creates the first one in the admin area.",
      filtered: "No scopes match this search.",
    }}
  />
);
