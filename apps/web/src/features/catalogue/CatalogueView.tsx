import Link from "next/link";
import { ItemCard } from "@/components/catalogue/ItemCard";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Input, inputClasses, Label } from "@/components/ui/Field";
import type { CataloguePage } from "@/server/domains/items/actions/catalogue";
import { catalogueHref } from "./query";

const chip = (active: boolean, empty = false) =>
  cn(
    "inline-flex h-7 items-center gap-1 rounded-control border px-2.5 font-mono text-xs outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus",
    active
      ? "border-accent-strong bg-accent-strong font-semibold text-on-accent"
      : "border-hairline bg-surface text-fg hover:border-strong",
    empty && !active ? "text-muted" : "",
  );

/**
 * The catalogue (feature 018): search, the type chips with their counts, the scope filter and sort,
 * then the items, installable ones first. Links and GET forms only, so it works without JavaScript.
 */
export const CatalogueView = ({ page, paged }: { page: CataloguePage; paged: boolean }) => {
  const { query } = page;
  const total = page.typeCounts.reduce((sum, t) => sum + t.count, 0);
  const filtered = Boolean(query.q || query.type || query.scope);
  return (
    <div className="grid grid-cols-1 gap-5">
      <form method="get" action="/catalogue" className="flex flex-wrap items-end gap-2">
        <div className="grid w-full min-w-0 gap-1.5 sm:w-auto sm:flex-1">
          <Label htmlFor="catalogue-search">Search</Label>
          <Input
            id="catalogue-search"
            name="q"
            type="search"
            placeholder="Name, description or keyword"
            maxLength={100}
            defaultValue={query.q}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="catalogue-scope">Scope</Label>
          <select
            id="catalogue-scope"
            name="scope"
            defaultValue={query.scope ?? ""}
            className={cn(inputClasses, "font-mono")}
          >
            <option value="">All scopes</option>
            {page.scopes.map((scope) => (
              <option key={scope} value={scope}>
                @{scope}
              </option>
            ))}
          </select>
        </div>
        {query.type ? <input type="hidden" name="type" value={query.type} /> : null}
        {query.sort === "name" ? <input type="hidden" name="sort" value="name" /> : null}
        <button type="submit" className={buttonClasses("secondary")}>
          Search
        </button>
        {filtered ? (
          <Link
            href={catalogueHref(query, { q: "", type: null, scope: null })}
            className={buttonClasses("ghost")}
          >
            Clear
          </Link>
        ) : null}
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Types" className="flex flex-wrap gap-1.5">
          <Link
            href={catalogueHref(query, { type: null })}
            aria-current={query.type ? undefined : "page"}
            className={chip(!query.type)}
          >
            All <span className="opacity-80">({total})</span>
          </Link>
          {page.typeCounts.map((t) => (
            <Link
              key={t.type}
              href={catalogueHref(query, { type: t.type })}
              aria-current={query.type === t.type ? "page" : undefined}
              className={chip(query.type === t.type, t.count === 0)}
            >
              {t.type} <span className="opacity-80">({t.count})</span>
            </Link>
          ))}
        </nav>
        <nav aria-label="Sort" className="flex items-center gap-1.5 text-xs text-muted">
          Sort:
          <Link
            href={catalogueHref(query, { sort: "recent" })}
            aria-current={query.sort === "recent" ? "page" : undefined}
            className={chip(query.sort === "recent")}
          >
            Recently published
          </Link>
          <Link
            href={catalogueHref(query, { sort: "name" })}
            aria-current={query.sort === "name" ? "page" : undefined}
            className={chip(query.sort === "name")}
          >
            Name
          </Link>
        </nav>
      </div>

      {page.entries.length === 0 ? (
        filtered || paged ? (
          <p className="rounded-panel border border-hairline bg-surface p-4 text-sm text-muted">
            No items match.{" "}
            <Link href="/catalogue" className="underline underline-offset-2">
              See every item
            </Link>
            .
          </p>
        ) : (
          <div className="grid gap-2 rounded-panel border border-hairline bg-surface p-4 text-sm">
            <p className="font-semibold text-fg">Nothing is published yet.</p>
            <p className="text-muted">
              Items arrive in three steps: someone submits one, a moderator reviews and approves it,
              and it's released as a version. Then it's listed here, ready to install with{" "}
              <code className="font-mono">rmk</code>.
            </p>
            <p>
              <Link href="/submissions/new" className={buttonClasses("secondary")}>
                Submit an item
              </Link>
            </p>
          </div>
        )
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {page.entries.map((entry) => (
            <li key={entry.id}>
              <ItemCard entry={entry} />
            </li>
          ))}
        </ul>
      )}

      {page.nextCursor || paged ? (
        <nav aria-label="Pages" className="flex flex-wrap justify-between gap-2">
          {paged ? (
            <Link href={catalogueHref(query)} className={buttonClasses("ghost")}>
              First page
            </Link>
          ) : (
            <span />
          )}
          {page.nextCursor ? (
            <Link
              href={catalogueHref(query, { cursor: page.nextCursor })}
              className={buttonClasses("secondary")}
            >
              Next page
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
};
