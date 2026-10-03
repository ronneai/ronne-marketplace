"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { docsHref, TOPIC_GROUPS, topicOf } from "@/components/help/topics";
import { ScrollStrip } from "@/components/ui/ScrollStrip";

/**
 * The Documentation's topics, in labelled groups: a sidebar with a line between groups on wide
 * screens, a `ScrollStrip` on phones (066), each group's label a small heading inside it, the
 * current topic scrolled into view.
 */
export const DocsNav = () => {
  const path = usePathname() ?? "/docs";
  return (
    <ScrollStrip
      label="Documentation"
      className="gap-3 border-b border-hairline pb-2 md:grid md:content-start md:gap-0 md:border-b-0 md:pb-0"
    >
      {TOPIC_GROUPS.map((group, i) => (
        <div
          key={group.label}
          className="flex shrink-0 items-center gap-1 md:grid md:gap-0.5 md:border-t md:border-hairline md:py-3 md:first:border-t-0 md:first:pt-0"
        >
          <p
            id={`docs-group-${i}`}
            className="shrink-0 pl-1 font-mono text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap text-muted uppercase md:px-3 md:pb-1"
          >
            {group.label}
          </p>
          <ul aria-labelledby={`docs-group-${i}`} className="flex gap-1 md:grid md:gap-0.5">
            {group.topics.map((slug) => {
              const topic = topicOf(slug);
              if (!topic) return null;
              const href = docsHref(topic.slug);
              return (
                <li key={slug} className="shrink-0 md:grid">
                  <Link
                    href={href}
                    aria-current={path === href ? "page" : undefined}
                    className="flex items-center whitespace-nowrap rounded-control px-3 py-1.5 pointer-coarse:min-h-11 text-sm text-muted outline-offset-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus aria-[current=page]:bg-tint aria-[current=page]:font-semibold aria-[current=page]:text-fg md:whitespace-normal"
                  >
                    {topic.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </ScrollStrip>
  );
};
