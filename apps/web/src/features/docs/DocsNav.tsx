"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { docsHref, TOPICS } from "@/components/help/topics";

/** The Documentation's topics: a sidebar on wide screens, a list above the page on phones. */
export const DocsNav = () => {
  const path = usePathname() ?? "/docs";
  return (
    <nav aria-label="Documentation" className="grid content-start gap-0.5">
      {TOPICS.map((topic) => {
        const href = docsHref(topic.slug);
        return (
          <Link
            key={topic.slug}
            href={href}
            aria-current={path === href ? "page" : undefined}
            className="rounded-control px-3 py-1.5 text-sm text-muted outline-offset-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus aria-[current=page]:bg-tint aria-[current=page]:font-semibold aria-[current=page]:text-fg"
          >
            {topic.title}
          </Link>
        );
      })}
    </nav>
  );
};
