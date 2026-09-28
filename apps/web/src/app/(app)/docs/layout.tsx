import type { ReactNode } from "react";
import { DocsNav } from "@/features/docs/DocsNav";

/** The Documentation (feature 033): the topic list beside, or above, the topic's page. */
const DocsLayout = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-1 gap-6 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-10">
    <aside className="md:sticky md:top-20 md:self-start">
      <DocsNav />
    </aside>
    {children}
  </div>
);

export default DocsLayout;
