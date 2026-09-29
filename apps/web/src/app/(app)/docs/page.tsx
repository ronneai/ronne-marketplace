import { TOPICS } from "@/components/help/topics";
import { CONTENT } from "@/features/docs/content";
import { DocsPage } from "@/features/docs/DocsPage";

export const metadata = { title: "Documentation · Ronne AI Marketplace" };

/** The Documentation's overview (feature 033). */
const Docs = () => <DocsPage topic={TOPICS[0]} sections={CONTENT.overview} />;

export default Docs;
