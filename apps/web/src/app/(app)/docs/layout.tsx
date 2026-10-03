import type { ReactNode } from "react";
import { DocsNav } from "@/features/docs/DocsNav";

/** The Documentation (feature 033): the topic list beside, or above, the topic's page. */
const DocsLayout = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-1 gap-6 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-10">
    {/* A landscape tablet is shorter than the topic list: the sidebar scrolls on its own (066). */}
    <aside className="min-w-0 md:sticky md:top-20 md:max-h-[calc(100dvh-6rem)] md:self-start md:overflow-y-auto">
      <DocsNav />
    </aside>
    {children}
  </div>
);

export default DocsLayout;
