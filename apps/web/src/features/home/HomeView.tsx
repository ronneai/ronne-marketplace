import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ItemCard } from "@/components/catalogue/ItemCard";
import { TYPE_INFO } from "@/components/submissions/item-types";
import { buttonClasses } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { TYPE_DOT } from "@/components/ui/TypeBadge";
import type { HomeLists } from "@/server/domains/items/actions/catalogue";

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

const ItemList = ({ entries }: { entries: HomeLists["recent"] }) => (
  <ul className="grid grid-cols-1 gap-3">
    {entries.map((entry) => (
      <li key={entry.id}>
        {/* biome-ignore lint/plugin: an HTML tag name, not text a person reads */}
        <ItemCard entry={entry} heading="h3" />
      </li>
    ))}
  </ul>
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
  slots = {},
}: {
  lists: HomeLists;
  forYou: ForYou;
  slots?: HomeSlots;
}) => {
  const t = useTranslations("home");
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
                    {TYPE_INFO[type].label}
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
        <Panel className="grid gap-2 text-sm">
          <h2 className="font-semibold text-fg">{t("empty.title")}</h2>
          <p className="text-muted">
            {t.rich("empty.body", {
              mono: (chunks) => <code className="font-mono">{chunks}</code>,
            })}
          </p>
          <p>
            <Link href="/submissions/new" className={buttonClasses("secondary")}>
              {t("empty.submit")}
            </Link>
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
          <ItemList entries={lists.recent} />
        </Section>
      )}

      {lists.mostUsed.length ? (
        <Section id="most-used" title={t("mostUsed.title")}>
          <ItemList entries={lists.mostUsed} />
        </Section>
      ) : null}
    </div>
  );
};
