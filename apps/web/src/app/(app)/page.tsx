import { PageHeader } from "@/components/ui/Panel";
import { HomeView } from "@/features/home/HomeView";
import { homeLists } from "@/server/domains/items/actions/catalogue";
import { listMySubmissions } from "@/server/domains/submissions/actions/drafts";
import { countNeedsReview } from "@/server/domains/submissions/actions/reviews";
import { requestHeaders } from "@/server/http/request-headers";

/** The home page (feature 018), for everyone signed in (the (app) layout requires a session). */
const HomePage = async () => {
  const headers = await requestHeaders();
  const [lists, mine, needsReview] = await Promise.all([
    homeLists(headers),
    listMySubmissions(headers),
    countNeedsReview(headers),
  ]);
  return (
    <>
      <PageHeader
        title="Ronne AI Marketplace"
        description="A self-hosted, curated registry of AI capabilities: find what's reviewed and released, and install it with rmk."
      />
      <HomeView
        lists={lists}
        forYou={{
          drafts: mine.filter((s) => s.status === "draft").length,
          changesRequested: mine.filter((s) => s.status === "changes_requested").length,
          needsReview,
        }}
      />
    </>
  );
};

export default HomePage;
