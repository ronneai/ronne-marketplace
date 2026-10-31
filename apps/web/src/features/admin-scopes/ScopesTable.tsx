import Form from "next/form";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { type Column, DataTable, HiddenListFields } from "@/components/ui/data-table/DataTable";
import { FilterChips } from "@/components/ui/data-table/FilterChips";
import { SubmitOnChange } from "@/components/ui/data-table/SubmitOnChange";
import { Input, Label } from "@/components/ui/Field";
import { LocalTime } from "@/components/ui/LocalTime";
import type { Scope } from "@/server/domains/items/models/scope";
import type { ScopesList, ScopesListState } from "./list";

const Search = ({ list, state }: { list: ScopesList; state: ScopesListState }) => {
  const t = useTranslations("admin.scopes.search");
  return (
    <div className="grid gap-2">
      <Form action={list.path} scroll={false} className="flex flex-wrap items-end gap-2">
        <HiddenListFields list={list} state={state} omit={["q"]} />
        <div className="grid min-w-0 flex-1 gap-1.5">
          <Label htmlFor="scope-search">{t("label")}</Label>
          <Input
            id="scope-search"
            name="q"
            type="search"
            placeholder={t("placeholder")}
            maxLength={100}
            defaultValue={state.filters.q}
          />
        </div>
        <button type="submit" data-submit className={buttonClasses("secondary")}>
          {t("submit")}
        </button>
        <SubmitOnChange />
      </Form>
      <FilterChips list={list} state={state} labels={{ q: t("label") }} />
    </div>
  );
};

type ScopesT = ReturnType<typeof useTranslations<"admin.scopes">>;

const columns = (
  t: ScopesT,
  actions?: (scope: Scope) => ReactNode,
  note?: (scope: Scope) => ReactNode,
): Column<Scope, "name" | "created">[] => [
  {
    id: "name",
    header: t("columns.scope"),
    sort: "name",
    className: "w-48",
    mono: true,
    truncate: true,
    render: (scope) => <span title={`@${scope.name}`}>@{scope.name}</span>,
  },
  {
    id: "description",
    header: t("columns.description"),
    truncate: true,
    render: (scope) => {
      const extra = note?.(scope);
      return (
        <>
          <span title={scope.description} className={extra ? "block truncate" : undefined}>
            {scope.description}
          </span>
          {/* A line of its own under the description, which may wrap (115). */}
          {extra ? <div className="mt-0.5 mb-1.5 whitespace-normal">{extra}</div> : null}
        </>
      );
    },
  },
  {
    id: "creator",
    header: t("columns.creator"),
    className: "w-56",
    truncate: true,
    hideOnMobile: true,
    render: (scope) => <span className="text-muted">{scope.createdBy?.email ?? "—"}</span>,
  },
  {
    id: "created",
    header: t("columns.created"),
    sort: "created",
    className: "w-28",
    hideOnMobile: true,
    render: (scope) => <LocalTime value={scope.createdAt} precision="day" />,
  },
  ...(actions
    ? [
        {
          id: "actions",
          header: "",
          // Two icon buttons, Edit and Move, on one line (115): the cell's `flex-nowrap` keeps them
          // there. No `whitespace-nowrap`: their dialogs sit in the cell and would inherit it.
          className: "w-24 pointer-coarse:w-30",
          align: "right" as const,
          render: actions,
        },
      ]
    : []),
];

/**
 * A workspace's scopes on its page (feature 010, on the server data table since 061; the only
 * scope list since Admin › Scopes went, 115), with what the reader may do to each.
 */
export const ScopesTable = ({
  list,
  state,
  scopes,
  page,
  total,
  actions,
  note,
}: {
  list: ScopesList;
  state: ScopesListState;
  scopes: Scope[];
  page: { next: string | null; previous: string | null };
  total: { count: number; capped: boolean };
  actions?: (scope: Scope) => ReactNode;
  /** A line under a scope's description, such as its move's state (115). */
  note?: (scope: Scope) => ReactNode;
}) => {
  const t = useTranslations("admin.scopes");
  return (
    <DataTable
      list={list}
      state={state}
      columns={columns(t, actions, note)}
      rows={scopes}
      rowKey={(scope) => scope.id}
      page={page}
      total={total}
      noun="scope"
      toolbar={<Search list={list} state={state} />}
      empty={{ none: t("empty.none"), filtered: t("empty.filtered") }}
    />
  );
};
