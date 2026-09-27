import { PageHeader, Panel } from "@/components/ui/Panel";

export default function HomePage() {
  return (
    <>
      <PageHeader
        title="Ronne AI Marketplace"
        description="A self-hosted, curated registry of AI capabilities."
      />
      <Panel>
        <p className="text-sm text-muted">
          This instance is being built. The catalogue, submissions and reviews arrive in later
          milestones.
        </p>
      </Panel>
    </>
  );
}
