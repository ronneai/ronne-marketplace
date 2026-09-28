import { notFound } from "next/navigation";
import { topicOf } from "@/components/help/topics";
import { CONTENT } from "@/features/docs/content";
import { DocsPage } from "@/features/docs/DocsPage";

export const metadata = { title: "Documentation · Ronne" };

/** One topic of the Documentation (feature 033); the overview lives at /docs itself. */
const DocsTopic = async ({ params }: { params: Promise<{ topic: string }> }) => {
  const topic = topicOf((await params).topic);
  if (!topic || topic.slug === "overview") notFound();
  return <DocsPage topic={topic} sections={CONTENT[topic.slug]} />;
};

export default DocsTopic;
