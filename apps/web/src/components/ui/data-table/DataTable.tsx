import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsUpDown,
} from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "../cn";
import { selectClasses } from "../Field";
import {
  isFiltered,
  type ListDefinition,
  type ListState,
  listParams,
  listUrl,
  sortUrl,
} from "./list-query";
import { SubmitOnChange } from "./SubmitOnChange";

/**
 * A table whose rows come from the server, a page at a time (feature 060). Its whole state is in
 * the URL (list-query.ts): sortable headers and the pagination bar are links, and the page size is
 * a GET form, so it works without JavaScript and every view can be linked. It's a server
 * component, so a column's `render` never crosses into a client component
 * (docs/knowledge/server-client-props.md). The server pages with `paginate` (server/db/keyset.ts).
 */
export type Column<Row, S extends string> = {
  id: string;
  /** Text for the header; empty for a column of actions, which then gets a screen-reader label. */
  header: string;
  /** The screen-reader label of a column with no header (062); "Actions" when not given. */
  srHeader?: string;
  render: (row: Row) => ReactNode;
  /** The list's sort key this column sorts by, when it's sortable. */
  sort?: S;
  /** A width for the column, such as `w-36`. */
  className?: string;
  mono?: boolean;
  /** One line, cut with an ellipsis; `title` gives the whole text. */
  truncate?: boolean;
  align?: "left" | "right";
  /** Hidden below the `sm` breakpoint. */
  hideOnMobile?: boolean;
};

export type TableTotal = { count: number; capped: boolean };

const SortIcon = ({ active, dir }: { active: boolean; dir: "asc" | "desc" }) => {
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return <Icon size={12} aria-hidden="true" className={cn("shrink-0", !active && "opacity-50")} />;
};

const pagerLink =
  "inline-flex h-8 items-center gap-1 rounded-control px-2.5 text-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/** A link, or the same label greyed out and inert when there's nowhere to go. */
const PageLink = ({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: ReactNode;
}) =>
  href ? (
    <Link href={href} aria-label={label} className={cn(pagerLink, "text-fg hover:bg-tint")}>
      {children}
    </Link>
  ) : (
    <span aria-disabled="true" className={cn(pagerLink, "text-muted opacity-50")}>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="inline-flex items-center gap-1">
        {children}
      </span>
    </span>
  );

/** The fields that keep the rest of the view when a GET form changes one part of it. */
export const HiddenListFields = <S extends string, F extends string>({
  list,
  state,
  omit,
}: {
  list: ListDefinition<S, F>;
  state: ListState<S, F>;
  /** The parameters the form itself sets. */
  omit: string[];
}) => (
  <>
    {[...listParams(list, { ...state, cursor: undefined })]
      .filter(([key]) => !omit.includes(key))
      .map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
  </>
);

const formatCount = (total: TableTotal, noun: string) =>
  `${total.count.toLocaleString("en-US")}${total.capped ? "+" : ""} ${noun}`;

export const DataTable = <Row, S extends string, F extends string>({
  list,
  state,
  columns,
  rows,
  rowKey,
  rowLabel,
  page,
  total,
  noun,
  toolbar,
  empty,
  pinned = [],
}: {
  list: ListDefinition<S, F>;
  state: ListState<S, F>;
  columns: Column<Row, S>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** What a row is called in the accessibility tree, such as the event's summary. */
  rowLabel?: (row: Row) => string;
  page: { next: string | null; previous: string | null };
  total: TableTotal;
  /** The plural for the count, such as `events`. */
  noun: string;
  /** The list's filters, above the table. */
  toolbar?: ReactNode;
  empty: { none: string; filtered: string };
  /**
   * Filters chosen outside the toolbar (such as status links, 063): they don't make the list
   * "filtered", and Clear filters keeps them.
   */
  pinned?: readonly F[];
}) => {
  const loose = (Object.keys(state.filters) as F[]).filter((key) => !pinned.includes(key));
  const filtered = loose.some((key) => state.filters[key]);
  const hide = (column: Column<Row, S>) => column.hideOnMobile && "hidden sm:table-cell";
  const pager = (
    <nav
      aria-label="Pages"
      className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted"
    >
      <span>{formatCount(total, noun)}</span>
      <div className="flex items-center gap-1">
        <PageLink
          href={page.previous ? listUrl(list, state, { cursor: null }) : null}
          label="First page"
        >
          <ChevronsLeft size={16} aria-hidden="true" />
        </PageLink>
        <PageLink
          href={page.previous ? listUrl(list, state, { cursor: page.previous }) : null}
          label="Previous page"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Previous
        </PageLink>
        <PageLink
          href={page.next ? listUrl(list, state, { cursor: page.next }) : null}
          label="Next page"
        >
          Next
          <ChevronRight size={16} aria-hidden="true" />
        </PageLink>
      </div>
      <Form action={list.path} scroll={false} className="flex items-center gap-2">
        <HiddenListFields list={list} state={state} omit={["size"]} />
        <label htmlFor="page-size">Show</label>
        <select
          id="page-size"
          name="size"
          defaultValue={state.size}
          className={cn(selectClasses, "h-8 w-auto py-0")}
        >
          {list.sizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <button type="submit" data-submit className={cn(pagerLink, "border border-strong")}>
          Show
        </button>
        <SubmitOnChange />
      </Form>
    </nav>
  );
  return (
    <div className="grid gap-3">
      {toolbar}
      {rows.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-panel border border-hairline bg-surface p-4 text-sm text-muted">
          <span>
            {/* A later page emptied by changes since (062): the list itself may not be. */}
            {state.cursor ? "Nothing left on this page." : filtered ? empty.filtered : empty.none}
          </span>
          {state.cursor ? (
            <Link
              href={listUrl(list, state, { cursor: null })}
              className="text-link underline-offset-2 hover:underline"
            >
              First page
            </Link>
          ) : null}
          {filtered && !state.cursor ? (
            <Link
              href={listUrl(list, state, {
                filters: Object.fromEntries(loose.map((k) => [k, ""])) as Partial<
                  Record<F, string>
                >,
              })}
              className="text-link underline-offset-2 hover:underline"
            >
              Clear filters
            </Link>
          ) : null}
        </div>
      ) : null}
      {rows.length === 0 ? null : (
        <>
          <div className="relative min-w-0 overflow-x-auto rounded-panel border border-hairline bg-surface">
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <thead>
                <tr>
                  {columns.map((column) => {
                    const active = column.sort !== undefined && column.sort === state.sort;
                    return (
                      <th
                        key={column.id}
                        scope="col"
                        aria-sort={
                          active ? (state.dir === "asc" ? "ascending" : "descending") : undefined
                        }
                        className={cn(
                          "h-9 border-b border-hairline bg-canvas px-3 text-xs font-semibold text-muted",
                          column.align === "right" && "text-right",
                          column.className,
                          hide(column),
                        )}
                      >
                        {column.sort !== undefined ? (
                          <Link
                            href={sortUrl(list, state, column.sort)}
                            className="inline-flex items-center gap-1 rounded-sm hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
                          >
                            {column.header}
                            <SortIcon active={active} dir={state.dir} />
                          </Link>
                        ) : column.header ? (
                          column.header
                        ) : (
                          <span className="sr-only">{column.srHeader ?? "Actions"}</span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    aria-label={rowLabel?.(row)}
                    className="relative hover:bg-tint"
                  >
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        className={cn(
                          "h-10 border-b border-hairline px-3 text-fg",
                          column.mono && "font-mono text-[13px]",
                          column.truncate && "truncate",
                          column.align === "right" && "text-right",
                          hide(column),
                        )}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pager}
        </>
      )}
    </div>
  );
};
