import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ItemCard } from "@/components/catalogue/ItemCard";
import { buttonClasses } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import type { HomeLists } from "@/server/domains/items/actions/catalogue";

/** What waits for the viewer: their own work in progress and, for reviewers, the queue. */
export type ForYou = { drafts: number; changesRequested: number; needsReview: number };

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

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

/**
 * The home page (feature 018): a search box into the catalogue, what's waiting for the viewer,
 * recently published and most used items. More sections join it later, so it stays a page of its
 * own rather than a redirect. Most used only shows once something has been downloaded.
 */
export const HomeView = ({ lists, forYou }: { lists: HomeLists; forYou: ForYou }) => {
  const waiting = [
    forYou.drafts
      ? {
          href: "/submissions",
          text: `You have ${plural(forYou.drafts, "draft", "drafts")} in progress.`,
        }
      : null,
    forYou.changesRequested
      ? {
          href: "/submissions",
          text: `${plural(forYou.changesRequested, "submission of yours needs", "submissions of yours need")} changes.`,
        }
      : null,
    forYou.needsReview
      ? {
          href: "/reviews",
          text: `${plural(forYou.needsReview, "submission waits", "submissions wait")} for review.`,
        }
      : null,
  ].filter((line) => line !== null);

  return (
    <div className="grid grid-cols-1 gap-8">
      <form method="get" action="/catalogue" className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-0 flex-1 gap-1.5">
          <Label htmlFor="home-search">Search the catalogue</Label>
          <Input
            id="home-search"
            name="q"
            type="search"
            placeholder="Name, description or keyword"
            maxLength={100}
          />
        </div>
        <button type="submit" className={buttonClasses("primary")}>
          <Search size={16} aria-hidden="true" />
          Search
        </button>
      </form>

      {waiting.length ? (
        <Section id="for-you" title="For you">
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

      {lists.recent.length === 0 ? (
        <Panel className="grid gap-2 text-sm">
          <h2 className="font-semibold text-fg">Nothing is published yet.</h2>
          <p className="text-muted">
            Items arrive in three steps: someone submits one, a moderator reviews and approves it,
            and it's released as a version. Then it's in the catalogue, ready to install with{" "}
            <code className="font-mono">rmk</code>.
          </p>
          <p>
            <Link href="/submissions/new" className={buttonClasses("secondary")}>
              Submit an item
            </Link>
          </p>
        </Panel>
      ) : (
        <Section
          id="recent"
          title="Recently published"
          action={
            <Link href="/catalogue" className="text-sm text-link underline underline-offset-2">
              See all
            </Link>
          }
        >
          <ul className="grid grid-cols-1 gap-3">
            {lists.recent.map((entry) => (
              <li key={entry.id}>
                <ItemCard entry={entry} heading="h3" />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {lists.mostUsed.length ? (
        <Section id="most-used" title="Most used">
          <ul className="grid grid-cols-1 gap-3">
            {lists.mostUsed.map((entry) => (
              <li key={entry.id}>
                <ItemCard entry={entry} heading="h3" />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
};
