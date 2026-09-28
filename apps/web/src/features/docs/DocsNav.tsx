"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { docsHref, TOPICS } from "@/components/help/topics";

/** The Documentation's topics: a sidebar on wide screens, a row that scrolls sideways on phones. */
export const DocsNav = () => {
  const path = usePathname() ?? "/docs";
  return (
    <nav
      aria-label="Documentation"
      className="flex gap-1 overflow-x-auto border-b border-hairline pb-2 [scrollbar-width:none] md:grid md:content-start md:gap-0.5 md:border-b-0 md:pb-0"
    >
      {TOPICS.map((topic) => {
        const href = docsHref(topic.slug);
        return (
          <Link
            key={topic.slug}
            href={href}
            aria-current={path === href ? "page" : undefined}
            className="shrink-0 whitespace-nowrap rounded-control px-3 py-1.5 text-sm md:whitespace-normal text-muted outline-offset-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus aria-[current=page]:bg-tint aria-[current=page]:font-semibold aria-[current=page]:text-fg"
          >
            {topic.title}
          </Link>
        );
      })}
    </nav>
  );
};
