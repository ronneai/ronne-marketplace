import Link from "next/link";
import { cn } from "./cn";
import { ScrollStrip } from "./ScrollStrip";
import { stripTab } from "./scroll-strip";

/**
 * Tabs that are links (feature 122): each has its own address, so the back button, a bookmark and
 * the Documentation can point at one. The current tab has `aria-current="page"`; the row is a
 * `ScrollStrip` (066), so it scrolls sideways on a phone instead of squeezing the labels. The
 * workspace page and Admin › Settings use it; `Tabs` is for tabs that only switch what's shown.
 */
export const TabLinks = ({
  label,
  tabs,
  current,
  className,
}: {
  /** The nav's accessible name. */
  label: string;
  tabs: readonly { id: string; label: string; href: string }[];
  /** The `id` of the tab being shown. */
  current: string;
  className?: string;
}) => {
  return (
    <ScrollStrip label={label} className={cn("mb-4 gap-1 border-b border-hairline", className)}>
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={tab.id === current ? "page" : undefined}
          className={`${stripTab} -mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-fg aria-[current=page]:border-accent aria-[current=page]:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus`}
        >
          {tab.label}
        </Link>
      ))}
    </ScrollStrip>
  );
};
