import type { ReactNode } from "react";
import type { Topic } from "@/components/help/topics";

/**
 * One topic of the Documentation (feature 033): its title, summary and sections. The sections come
 * from `topics.ts`, so their ids are the ones inline helpers link to.
 */
export const DocsPage = ({
  topic,
  sections,
}: {
  topic: Topic;
  /** Each section's content, by its id. */
  sections: Record<string, ReactNode>;
}) => (
  <article className="grid min-w-0 grid-cols-1 gap-8">
    <header className="grid gap-1">
      <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.02em] text-fg">
        {topic.title}
      </h1>
      <p className="text-sm text-muted">{topic.summary}</p>
    </header>
    {topic.sections.map((section) => (
      <section
        key={section.id}
        id={section.id}
        aria-labelledby={`${section.id}-title`}
        className="grid scroll-mt-20 gap-3"
      >
        <h2 id={`${section.id}-title`} className="text-lg font-semibold text-fg">
          {section.title}
        </h2>
        <div className="grid gap-3 text-sm leading-relaxed text-fg">{sections[section.id]}</div>
      </section>
    ))}
  </article>
);
