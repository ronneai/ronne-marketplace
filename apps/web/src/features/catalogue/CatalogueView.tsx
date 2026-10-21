import { RENDERERS } from "@ronneai/core/render";
import { ArrowUpDown, Check, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ItemCard } from "@/components/catalogue/ItemCard";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Disclosure } from "@/components/ui/Disclosure";
import { Input, inputClasses, Label } from "@/components/ui/Field";
import { TYPE_CLASSES, TYPE_DOT } from "@/components/ui/TypeBadge";
import type { CataloguePage } from "@/server/domains/items/actions/catalogue";
import { catalogueHref } from "./query";

/** An active filter, shown next to the Filters button: a link that removes it. */
const ActiveFilter = ({
  href,
  label,
  className,
  children,
}: {
  href: string;
  label: string;
  className?: string;
  children: ReactNode;
}) => (
  <li>
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "inline-flex h-7 pointer-coarse:h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus",
        className ?? "border-hairline bg-surface text-fg hover:border-strong",
      )}
    >
      {children}
      <X size={12} aria-hidden="true" className="opacity-70" />
    </Link>
  </li>
);

/** One type in the Filters panel: a checkbox with its colour dot, name and count. */
const typeOption =
  "flex min-h-9 pointer-coarse:min-h-11 cursor-pointer items-center gap-2 rounded-control border border-hairline px-3 text-sm text-fg hover:border-strong has-checked:border-accent has-checked:bg-tint has-checked:font-semibold";

/** The sorts, each with what it puts first (owner, 2026-10-02); their words are `catalogue.view.sort.<id>`. */
const SORTS = ["recent", "installs", "name"] as const;

/**
 * The catalogue (feature 018): search; a Filters button (type with counts, workspace (090), scope,
 * the tool it works in) with the active filters beside it, and Sort on the right (owner, 2026-10-02); then the
 * items, installable ones first. Links and GET forms only, so it works without JavaScript.
 */
export const CatalogueView = ({
  page,
  paged,
  keepAll = false,
  favorites,
}: {
  page: CataloguePage;
  paged: boolean;
  /** The ids of the items on the page the person has favorited (125); without it, no stars. */
  favorites?: readonly string[];
  /**
   * A current workspace is set (120): a link meaning every workspace (a cleared workspace filter,
   * Clear all) writes an explicit empty `?workspace=`, or the page would redirect back to it.
   */
  keepAll?: boolean;
}) => {
  const typeText = useTranslations("types");
  const t = useTranslations("catalogue.view");
  const { query } = page;
  const href = (changes: Parameters<typeof catalogueHref>[1] = {}) =>
    catalogueHref(query, changes, keepAll);
  const total = page.typeCounts.reduce((sum, entry) => sum + entry.count, 0);
  const filtered = Boolean(
    query.q || query.types.length || query.scope || query.workspace || query.tool,
  );
  const activeCount =
    query.types.length + [query.scope, query.workspace, query.tool].filter(Boolean).length;
  // Only worth a choice once there's more than `global` (090), or one is chosen. A chosen name
  // that isn't a workspace stays an option, so Apply keeps it, as its active filter says.
  const workspaceFilter = page.workspaces.length > 1 || query.workspace !== null;
  const workspaceOptions =
    query.workspace && !page.workspaces.includes(query.workspace)
      ? [...page.workspaces, query.workspace]
      : page.workspaces;
  const none = { types: [], scope: null, workspace: null, tool: null };
  const sort = SORTS.find((id) => id === query.sort) ?? SORTS[0];
  return (
    <div className="grid grid-cols-1 gap-5">
      <form method="get" action="/catalogue" className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-0 flex-1 basis-60 gap-1.5">
          <Label htmlFor="catalogue-search">{t("search.label")}</Label>
          <Input
            id="catalogue-search"
            name="q"
            type="search"
            placeholder={t("search.placeholder")}
            maxLength={100}
            defaultValue={query.q}
          />
        </div>
        {query.types.map((type) => (
          <input key={type} type="hidden" name="type" value={type} />
        ))}
        {query.scope ? <input type="hidden" name="scope" value={query.scope} /> : null}
        {query.workspace || keepAll ? (
          <input type="hidden" name="workspace" value={query.workspace ?? ""} />
        ) : null}
        {query.tool ? <input type="hidden" name="tool" value={query.tool} /> : null}
        {query.sort !== "recent" ? <input type="hidden" name="sort" value={query.sort} /> : null}
        <button type="submit" className={buttonClasses("secondary")}>
          {t("search.submit")}
        </button>
      </form>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Disclosure
            summary={
              <>
                <SlidersHorizontal size={16} aria-hidden="true" />
                {t("filters.button")}
                {activeCount ? (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-strong px-1.5 text-[11px] text-on-accent">
                    {activeCount}
                    <span className="sr-only"> {t("filters.on")}</span>
                  </span>
                ) : null}
              </>
            }
          >
            <form method="get" action="/catalogue" className="grid gap-4">
              {query.q ? <input type="hidden" name="q" value={query.q} /> : null}
              {query.sort !== "recent" ? (
                <input type="hidden" name="sort" value={query.sort} />
              ) : null}
              <details open={query.types.length > 0} className="group/types">
                <summary className="flex min-h-9 pointer-coarse:min-h-11 cursor-pointer list-none items-center gap-2 rounded-control text-sm font-semibold text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    size={16}
                    aria-hidden="true"
                    className="transition-none group-open/types:rotate-90"
                  />
                  {t("filters.type")}
                  <span className="font-normal text-muted">
                    {query.types.length === 0
                      ? t("filters.typeAll", { total })
                      : query.types.map((type) => typeText(`name.${type}`)).join(", ")}
                  </span>
                </summary>
                <fieldset className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  <legend className="sr-only">{t("filters.typesLegend")}</legend>
                  {page.typeCounts.map((entry) => (
                    <label
                      key={entry.type}
                      className={cn(typeOption, entry.count === 0 && "text-muted")}
                    >
                      <input
                        type="checkbox"
                        name="type"
                        value={entry.type}
                        defaultChecked={query.types.includes(entry.type)}
                        className="size-4 shrink-0 rounded-sm border border-strong accent-(--accent) outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
                      />
                      <span
                        aria-hidden="true"
                        className={cn("size-2 shrink-0 rounded-full", TYPE_DOT[entry.type])}
                      />
                      {typeText(`name.${entry.type}`)}
                      <span className="ml-auto text-xs text-muted">{entry.count}</span>
                    </label>
                  ))}
                </fieldset>
              </details>
              <div className="grid gap-3 sm:grid-cols-2">
                {workspaceFilter ? (
                  <div className="grid min-w-0 gap-1.5">
                    <Label htmlFor="catalogue-workspace">{t("filters.workspace")}</Label>
                    <select
                      id="catalogue-workspace"
                      name="workspace"
                      defaultValue={query.workspace ?? ""}
                      className={cn(inputClasses, "min-w-0")}
                    >
                      <option value="">{t("filters.allWorkspaces")}</option>
                      {workspaceOptions.map((workspace) => (
                        <option key={workspace} value={workspace}>
                          {workspace === page.personal
                            ? t("filters.personal", { workspace })
                            : workspace}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : keepAll ? (
                  <input type="hidden" name="workspace" value="" />
                ) : null}
                <div className="grid min-w-0 gap-1.5">
                  <Label htmlFor="catalogue-scope">{t("filters.scope")}</Label>
                  <select
                    id="catalogue-scope"
                    name="scope"
                    defaultValue={query.scope ?? ""}
                    className={cn(inputClasses, "min-w-0")}
                  >
                    <option value="">{t("filters.allScopes")}</option>
                    {page.scopes.map((scope) => (
                      <option key={scope} value={scope}>
                        @{scope}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid min-w-0 gap-1.5">
                  <Label htmlFor="catalogue-tool">{t("filters.worksIn")}</Label>
                  <select
                    id="catalogue-tool"
                    name="tool"
                    defaultValue={query.tool ?? ""}
                    className={cn(inputClasses, "min-w-0")}
                  >
                    <option value="">{t("filters.anyTool")}</option>
                    {RENDERERS.map((renderer) => (
                      <option key={renderer.id} value={renderer.id}>
                        {renderer.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline pt-3">
                {activeCount ? (
                  <Link href={href(none)} className={buttonClasses("ghost")}>
                    {t("filters.clear")}
                  </Link>
                ) : null}
                <button type="submit" className={buttonClasses("primary")}>
                  {t("filters.apply")}
                </button>
              </div>
            </form>
          </Disclosure>
          {filtered ? (
            <ul aria-label={t("active.label")} className="flex flex-wrap items-center gap-1.5">
              {query.q ? (
                <ActiveFilter href={href({ q: "" })} label={t("active.removeSearch")}>
                  <span className="font-normal text-muted">{t("active.searchChip")}</span> {query.q}
                </ActiveFilter>
              ) : null}
              {query.types.map((type) => (
                <ActiveFilter
                  key={type}
                  href={href({ types: query.types.filter((other) => other !== type) })}
                  label={t("active.removeType", { type: typeText(`name.${type}`) })}
                  className={TYPE_CLASSES[type]}
                >
                  <span aria-hidden="true" className={cn("size-2 rounded-full", TYPE_DOT[type])} />
                  {typeText(`name.${type}`)}
                </ActiveFilter>
              ))}
              {query.workspace ? (
                <ActiveFilter href={href({ workspace: null })} label={t("active.removeWorkspace")}>
                  <span className="font-normal text-muted">{t("filters.workspace")}</span>{" "}
                  {query.workspace}
                </ActiveFilter>
              ) : null}
              {query.scope ? (
                <ActiveFilter href={href({ scope: null })} label={t("active.removeScope")}>
                  <span className="font-normal text-muted">{t("filters.scope")}</span> @
                  {query.scope}
                </ActiveFilter>
              ) : null}
              {query.tool ? (
                <ActiveFilter href={href({ tool: null })} label={t("active.removeTool")}>
                  <span className="font-normal text-muted">{t("filters.worksIn")}</span>{" "}
                  {RENDERERS.find((r) => r.id === query.tool)?.name ?? query.tool}
                </ActiveFilter>
              ) : null}
              <li>
                <Link
                  href={href({ q: "", ...none })}
                  className="touch-hit text-xs font-semibold text-link underline-offset-2 hover:underline"
                >
                  {t("active.clearAll")}
                </Link>
              </li>
            </ul>
          ) : null}
        </div>
        <Disclosure
          align="right"
          panelClassName="w-72 p-1"
          summary={
            <>
              <ArrowUpDown size={16} aria-hidden="true" />
              <span>
                {t.rich("sort.summary", {
                  value: () => <span className="font-normal">{t(`sort.${sort}.label`)}</span>,
                })}
              </span>
            </>
          }
        >
          <nav aria-label={t("sort.label")} className="grid gap-0.5">
            {SORTS.map((option) => (
              <Link
                key={option}
                href={href({ sort: option })}
                aria-current={query.sort === option ? "page" : undefined}
                className="grid grid-cols-[1rem_1fr] items-start gap-x-2 rounded-control px-3 py-2 pointer-coarse:py-3 text-sm text-fg hover:bg-tint aria-[current=page]:bg-tint"
              >
                <span className="pt-0.5">
                  {query.sort === option ? <Check size={14} aria-hidden="true" /> : null}
                </span>
                <span className="grid">
                  <span className={query.sort === option ? "font-semibold" : undefined}>
                    {t(`sort.${option}.label`)}
                  </span>
                  <span className="text-xs text-muted">{t(`sort.${option}.hint`)}</span>
                </span>
              </Link>
            ))}
          </nav>
        </Disclosure>
      </div>

      {page.entries.length === 0 ? (
        filtered || paged ? (
          <p className="rounded-panel border border-hairline bg-surface p-4 text-sm text-muted">
            {t.rich("empty.noMatch", {
              see: (chunks) => (
                <Link href={href({ q: "", ...none })} className="underline underline-offset-2">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        ) : (
          <div className="grid gap-2 rounded-panel border border-hairline bg-surface p-4 text-sm">
            <p className="font-semibold text-fg">{t("empty.title")}</p>
            <p className="text-muted">
              {t.rich("empty.how", {
                mono: (chunks) => <code className="font-mono">{chunks}</code>,
              })}
            </p>
            <p>
              <Link href="/submissions/new" className={buttonClasses("secondary")}>
                {t("empty.submit")}
              </Link>
            </p>
          </div>
        )
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {page.entries.map((entry) => (
            <li key={entry.id}>
              <ItemCard entry={entry} favorited={favorites?.includes(entry.id)} />
            </li>
          ))}
        </ul>
      )}

      {page.nextCursor || paged ? (
        <nav aria-label={t("pager.label")} className="flex flex-wrap justify-between gap-2">
          {paged ? (
            <Link href={href()} className={buttonClasses("ghost")}>
              {t("pager.first")}
            </Link>
          ) : (
            <span />
          )}
          {page.nextCursor ? (
            <Link href={href({ cursor: page.nextCursor })} className={buttonClasses("secondary")}>
              {t("pager.next")}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
};
