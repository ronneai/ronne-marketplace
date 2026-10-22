import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { CardGrid } from "@/components/catalogue/CardGrid";
import { ItemCard } from "@/components/catalogue/ItemCard";
import { buttonClasses } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { TYPE_DOT } from "@/components/ui/TypeBadge";
import type { HomeLists } from "@/server/domains/items/actions/catalogue";
import { GLOBAL_WORKSPACE_NAME } from "@/server/domains/workspaces/models/workspace";

/** What waits for the viewer: their own work in progress and, for reviewers, the queue. */
export type ForYou = { drafts: number; changesRequested: number; needsReview: number };

/**
 * The places the later features fill (124): getting started (126), the viewer's favorites and the
 * pinned shelves (125). A slot left out, or null, draws nothing, not even a heading.
 */
export type HomeSlots = {
  gettingStarted?: ReactNode;
  favorites?: ReactNode;
  pinned?: ReactNode;
};

const Section = ({
  id,
  title,
  action,
  children,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <section aria-labelledby={id} className="grid grid-cols-1 gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id={id} className="text-lg font-semibold text-fg">
        {title}
      </h2>
      {action}
    </div>
    {children}
  </section>
);

const ItemList = ({
  entries,
  favorites,
}: {
  entries: HomeLists["recent"];
  favorites?: readonly string[];
}) => (
  <CardGrid>
    {entries.map((entry) => (
      <li key={entry.id}>
        {/* biome-ignore lint/plugin: an HTML tag name, not text a person reads */}
        <ItemCard entry={entry} heading="h3" favorited={favorites?.includes(entry.id)} compact />
      </li>
    ))}
  </CardGrid>
);

/**
 * The home page (feature 018, reworked in 124). Top to bottom, each part only when it has
 * something to show: the search box with a link for each type that has items; getting started,
 * what waits for the viewer, their favorites and the pinned shelves (slots the next features
 * fill); recently published; most used (once something was downloaded). The heading above it is
 * the page's, and the instance notice sits above that, in the app frame.
 */
export const HomeView = ({
  lists,
  forYou,
  isRoot = false,
  slots = {},
  favorites,
}: {
  lists: HomeLists;
  /** The ids of the listed items the person has favorited (125); without it, no stars. */
  favorites?: readonly string[];
  forYou: ForYou;
  /** Root is pointed at creating a scope first, when nothing is released (124). */
  isRoot?: boolean;
  slots?: HomeSlots;
}) => {
  const t = useTranslations("home");
  const typeText = useTranslations("types");
  const waiting = [
    forYou.drafts
      ? { href: "/submissions", text: t("waiting.drafts", { count: forYou.drafts }) }
      : null,
    forYou.changesRequested
      ? { href: "/submissions", text: t("waiting.changes", { count: forYou.changesRequested }) }
      : null,
    forYou.needsReview
      ? { href: "/reviews", text: t("waiting.review", { count: forYou.needsReview }) }
      : null,
  ].filter((line) => line !== null);

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid gap-3">
        <form method="get" action="/catalogue" className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label htmlFor="home-search">{t("search.label")}</Label>
            <Input
              id="home-search"
              name="q"
              type="search"
              placeholder={t("search.placeholder")}
              maxLength={100}
            />
          </div>
          <button type="submit" className={buttonClasses("primary")}>
            <Search size={16} aria-hidden="true" />
            {t("search.submit")}
          </button>
        </form>
        {lists.types.length ? (
          <nav
            aria-label={t("types.label")}
            className="flex flex-wrap items-center gap-x-4 gap-y-1"
          >
            <span className="text-sm text-muted">{t("types.label")}</span>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {lists.types.map((type) => (
                <li key={type}>
                  <Link
                    href={`/catalogue?type=${type}`}
                    className="touch-hit inline-flex items-center gap-1.5 text-sm text-fg underline-offset-2 hover:underline"
                  >
                    <span
                      aria-hidden="true"
                      className={`size-2 shrink-0 rounded-full ${TYPE_DOT[type]}`}
                    />
                    {typeText(`name.${type}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>

      {slots.gettingStarted ?? null}

      {waiting.length ? (
        <Section id="waiting" title={t("waiting.title")}>
          <Panel>
            <ul className="grid gap-1.5 text-sm">
              {waiting.map((line) => (
                <li key={line.text}>
                  <Link
                    href={line.href}
                    className="inline-flex items-center gap-1.5 text-fg underline-offset-2 hover:underline"
                  >
                    {line.text}
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </Section>
      ) : null}

      {slots.favorites ?? null}
      {slots.pinned ?? null}

      {lists.recent.length === 0 ? (
        <Panel className="grid gap-3 text-sm">
          <h2 className="font-semibold text-fg">{t("empty.title")}</h2>
          <p className="text-fg">{isRoot ? t("empty.root") : t("empty.others")}</p>
          <p className="text-muted">
            {t.rich("empty.how", {
              mono: (chunks) => <code className="font-mono">{chunks}</code>,
            })}
          </p>
          <p className="flex flex-wrap gap-2">
            {isRoot ? (
              <>
                <Link
                  href={`/workspaces/${GLOBAL_WORKSPACE_NAME}`}
                  className={buttonClasses("primary")}
                >
                  {t("empty.createScope")}
                </Link>
                <Link href="/submissions/new" className={buttonClasses("secondary")}>
                  {t("empty.submitFirst")}
                </Link>
              </>
            ) : (
              <Link href="/submissions/new" className={buttonClasses("secondary")}>
                {t("empty.submit")}
              </Link>
            )}
          </p>
        </Panel>
      ) : (
        <Section
          id="recent"
          title={t("recent.title")}
          action={
            <Link href="/catalogue" className="text-sm text-link underline underline-offset-2">
              {t("recent.seeAll")}
            </Link>
          }
        >
          <ItemList entries={lists.recent} favorites={favorites} />
        </Section>
      )}

      {lists.mostUsed.length ? (
        <Section id="most-used" title={t("mostUsed.title")}>
          <ItemList entries={lists.mostUsed} favorites={favorites} />
        </Section>
      ) : null}
    </div>
  );
};
