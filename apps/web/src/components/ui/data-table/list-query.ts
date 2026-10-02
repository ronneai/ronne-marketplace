/**
 * A server data table's state lives in its URL (feature 060): the sort, its direction, the page
 * size, the cursor and the list's own filters. So every view has a link, the back button works,
 * and a page renders on the server without JavaScript. A list defines what it allows once, and
 * the page and its server action both read the URL through it. Anything malformed falls back to
 * the default rather than being trusted.
 */
export type SortDir = "asc" | "desc";

/** `string`: trimmed text, at most 200 characters. `day`: a `YYYY-MM-DD` date, or nothing. */
export type FilterKind = "string" | "day";

export type ListDefinition<S extends string, F extends string> = {
  /** The page's path, such as `/admin/audit`. */
  path: string;
  /**
   * Parameters every URL of this list keeps (062), such as a tab: written first, never a filter
   * or a chip, and kept by Clear.
   */
  fixed?: Readonly<Record<string, string>>;
  /** The sort keys allowed, each with the direction it starts in. */
  sorts: Record<S, SortDir>;
  defaultSort: NoInfer<S>;
  sizes: readonly number[];
  defaultSize: number;
  filters: Record<F, FilterKind>;
};

export const defineList = <S extends string, F extends string>(
  definition: ListDefinition<S, F>,
): ListDefinition<S, F> => definition;

export type ListState<S extends string, F extends string> = {
  sort: S;
  dir: SortDir;
  size: number;
  cursor?: string;
  /** Every filter, "" when unset. */
  filters: Record<F, string>;
};

export type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  ((Array.isArray(value) ? value[0] : value) ?? "").trim();

const MAX_FILTER = 200;
const MAX_CURSOR = 1024;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const isDay = (value: string): boolean => {
  if (!DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

const filterValue = (kind: FilterKind, raw: string): string => {
  if (kind === "day") return isDay(raw) ? raw : "";
  return raw.slice(0, MAX_FILTER);
};

const keys = <K extends string>(record: Record<K, unknown>) => Object.keys(record) as K[];

export const parseListQuery = <S extends string, F extends string>(
  list: ListDefinition<S, F>,
  params: SearchParams,
): ListState<S, F> => {
  const sortParam = first(params.sort);
  const sort = keys(list.sorts).includes(sortParam as S) ? (sortParam as S) : list.defaultSort;
  const dirParam = first(params.dir);
  const dir: SortDir = dirParam === "asc" || dirParam === "desc" ? dirParam : list.sorts[sort];
  const sizeParam = Number(first(params.size));
  const size = list.sizes.includes(sizeParam) ? sizeParam : list.defaultSize;
  const cursorParam = first(params.cursor);
  const filters = {} as Record<F, string>;
  for (const key of keys(list.filters))
    filters[key] = filterValue(list.filters[key], first(params[key]));
  return {
    sort,
    dir,
    size,
    cursor: cursorParam && cursorParam.length <= MAX_CURSOR ? cursorParam : undefined,
    filters,
  };
};

export type ListChange<S extends string, F extends string> = {
  sort?: S;
  dir?: SortDir;
  size?: number;
  /** A new cursor, or null for the first page. */
  cursor?: string | null;
  filters?: Partial<Record<F, string>>;
};

/** The query parameters of a state, defaults left out, so the plain path is the default view. */
export const listParams = <S extends string, F extends string>(
  list: ListDefinition<S, F>,
  state: ListState<S, F>,
): URLSearchParams => {
  const params = new URLSearchParams(list.fixed);
  for (const key of keys(list.filters)) if (state.filters[key]) params.set(key, state.filters[key]);
  if (state.sort !== list.defaultSort) params.set("sort", state.sort);
  if (state.dir !== list.sorts[state.sort]) params.set("dir", state.dir);
  if (state.size !== list.defaultSize) params.set("size", String(state.size));
  if (state.cursor) params.set("cursor", state.cursor);
  return params;
};

/**
 * The URL of the state with `change` applied. Changing the sort, direction, size or a filter
 * starts again at the first page, since a cursor only means something in its own view.
 */
export const listUrl = <S extends string, F extends string>(
  list: ListDefinition<S, F>,
  state: ListState<S, F>,
  change: ListChange<S, F> = {},
  extra: Record<string, string> = {},
): string => {
  const reorders =
    change.sort !== undefined ||
    change.dir !== undefined ||
    change.size !== undefined ||
    change.filters !== undefined;
  const next: ListState<S, F> = {
    sort: change.sort ?? state.sort,
    dir: change.dir ?? (change.sort !== undefined ? list.sorts[change.sort] : state.dir),
    size: change.size ?? state.size,
    filters: { ...state.filters, ...change.filters },
    cursor:
      change.cursor === null ? undefined : (change.cursor ?? (reorders ? undefined : state.cursor)),
  };
  const params = listParams(list, next);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const query = params.toString();
  return query ? `${list.path}?${query}` : list.path;
};

/** A sortable header's link: sorts by `key`, or flips the direction when it already is the sort. */
export const sortUrl = <S extends string, F extends string>(
  list: ListDefinition<S, F>,
  state: ListState<S, F>,
  key: S,
): string =>
  key === state.sort
    ? listUrl(list, state, { dir: state.dir === "asc" ? "desc" : "asc" })
    : listUrl(list, state, { sort: key });

/** Whether any filter is set. */
export const isFiltered = <S extends string, F extends string>(state: ListState<S, F>): boolean =>
  Object.values<string>(state.filters).some(Boolean);
