import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { CardGrid } from "@/components/catalogue/CardGrid";
import { ItemCard } from "@/components/catalogue/ItemCard";
import type { CatalogueEntry } from "@/server/domains/items/actions/catalogue";
import { ManageButton } from "./ManageButton";

const Section = ({
  id,
  title,
  action,
  children,
}: {
  id: string;
  title: string;
  action: ReactNode;
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

/** The cards of these items, in order, each with its star (`starred`: the ids that are favorites). */
const Cards = ({
  entries,
  starred,
}: {
  entries: readonly CatalogueEntry[];
  starred: readonly string[];
}) => (
  <CardGrid>
    {entries.map((entry) => (
      <li key={entry.id}>
        {/* biome-ignore lint/plugin: an HTML tag name, not text a person reads */}
        <ItemCard entry={entry} heading="h3" favorited={starred.includes(entry.id)} compact />
      </li>
    ))}
  </CardGrid>
);

/**
 * The person's latest favorites on Home (feature 125), with See all, which opens the catalogue on
 * them. Nothing, not even a heading, when there are none.
 */
export const FavoritesShelf = ({
  entries,
  starred,
}: {
  entries: readonly CatalogueEntry[];
  starred: readonly string[];
}) => {
  const t = useTranslations("shelves.home");
  if (entries.length === 0) return null;
  return (
    <Section
      id="favorites"
      title={t("favorites")}
      action={
        <Link
          href="/catalogue?favorites=1"
          className="text-sm text-link underline underline-offset-2"
        >
          {t("seeAll")}
        </Link>
      }
    >
      <Cards entries={entries} starred={starred} />
    </Section>
  );
};

/**
 * A pin shelf, in order (feature 125): Start here on Home, a workspace's on Home while it is the
 * current one and on its own page. Nothing when there are none. `manage` adds Manage, for whoever
 * may change the shelf: its key, and the shelf's name for the dialog.
 */
export const PinnedShelf = ({
  id,
  title,
  entries,
  starred,
  manage,
}: {
  id: string;
  title: string;
  entries: readonly CatalogueEntry[];
  starred: readonly string[];
  manage?: { key: string; label: string };
}) =>
  entries.length === 0 ? null : (
    <Section
      id={id}
      title={title}
      action={manage ? <ManageButton shelfKey={manage.key} label={manage.label} /> : null}
    >
      <Cards entries={entries} starred={starred} />
    </Section>
  );
