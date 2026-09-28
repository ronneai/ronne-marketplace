"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { docsHref, TOPIC_GROUPS, topicOf } from "@/components/help/topics";

/**
 * The Documentation's topics, in labelled groups: a sidebar with a line between groups on wide
 * screens, a row that scrolls sideways on phones.
 */
export const DocsNav = () => {
  const path = usePathname() ?? "/docs";
  const current = useRef<HTMLAnchorElement>(null);
  // On a phone the row scrolls sideways: bring the current topic into view. `nearest` leaves the
  // page itself, and the sidebar on wide screens, where they are.
  useEffect(() => {
    if (path) current.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [path]);
  return (
    <nav
      aria-label="Documentation"
      className="flex gap-3 overflow-x-auto border-b border-hairline pb-2 [scrollbar-width:none] md:grid md:content-start md:gap-0 md:border-b-0 md:pb-0"
    >
      {TOPIC_GROUPS.map((group, i) => (
        <div
          key={group.label}
          className="flex shrink-0 items-center gap-1 md:grid md:gap-0.5 md:border-t md:border-hairline md:py-3 md:first:border-t-0 md:first:pt-0"
        >
          <p
            id={`docs-group-${i}`}
            className="hidden px-3 pb-1 font-mono text-[11px] font-semibold tracking-[0.06em] text-muted uppercase md:block"
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
                    ref={path === href ? current : undefined}
                    aria-current={path === href ? "page" : undefined}
                    className="block whitespace-nowrap rounded-control px-3 py-1.5 text-sm text-muted outline-offset-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus aria-[current=page]:bg-tint aria-[current=page]:font-semibold aria-[current=page]:text-fg md:whitespace-normal"
                  >
                    {topic.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
};
