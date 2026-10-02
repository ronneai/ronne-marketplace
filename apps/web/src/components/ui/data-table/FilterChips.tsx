import { X } from "lucide-react";
import Link from "next/link";
import { type ListDefinition, type ListState, listUrl } from "./list-query";

/**
 * The active filters of a server data table as chips (feature 060): each removes its own filter,
 * and Clear removes them all. Keeps the sort and size, and starts again at the first page.
 * `labels` names each filter; `display` can show a value differently (a role, a status).
 */
export const FilterChips = <S extends string, F extends string>({
  list,
  state,
  labels,
  hidden = [],
  display = {},
}: {
  list: ListDefinition<S, F>;
  state: ListState<S, F>;
  labels: Record<F, string>;
  /** Filters shown elsewhere (such as status links), never as chips, and kept by Clear. */
  hidden?: readonly F[];
  display?: Partial<Record<F, (value: string) => string>>;
}) => {
  const keys = (Object.keys(state.filters) as F[]).filter((key) => !hidden.includes(key));
  const active = keys.filter((key) => state.filters[key]);
  if (active.length === 0) return null;
  const cleared = Object.fromEntries(keys.map((key) => [key, ""])) as Partial<Record<F, string>>;
  return (
    <ul aria-label="Active filters" className="flex flex-wrap items-center gap-2 text-xs">
      {active.map((key) => (
        <li key={key}>
          <Link
            href={listUrl(list, state, {
              filters: { [key]: "" } as unknown as Partial<Record<F, string>>,
            })}
            scroll={false}
            aria-label={`Remove the ${labels[key].toLowerCase()} filter`}
            className="inline-flex items-center gap-1 rounded-control border border-hairline bg-surface px-2 py-1 text-fg hover:border-strong"
          >
            <span className="text-muted">{labels[key]}:</span>
            <span className="font-mono">
              {display[key]?.(state.filters[key]) ?? state.filters[key]}
            </span>
            <X size={12} aria-hidden="true" className="text-muted" />
          </Link>
        </li>
      ))}
      <li>
        <Link
          href={listUrl(list, state, { filters: cleared })}
          scroll={false}
          className="text-link underline-offset-2 hover:underline"
        >
          Clear
        </Link>
      </li>
    </ul>
  );
};
