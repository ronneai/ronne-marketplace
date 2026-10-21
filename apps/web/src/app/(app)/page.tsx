import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/Panel";
import { HomeView } from "@/features/home/HomeView";
import { homeLists } from "@/server/domains/items/actions/catalogue";
import { favoritedAmong } from "@/server/domains/shelves/actions/favorites";
import { listMySubmissions } from "@/server/domains/submissions/actions/drafts";
import { countNeedsReview } from "@/server/domains/submissions/actions/reviews";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "./hold";
import { loadShell } from "./shell";

/** The home page (feature 018, reworked in 124), for everyone signed in (the (app) layout requires a session). */
const HomePage = async () => {
  await holdPage();
  const headers = await requestHeaders();
  const t = await getTranslations("home");
  const { user } = await loadShell();
  const [lists, mine, needsReview] = await Promise.all([
    homeLists(headers),
    listMySubmissions(headers),
    countNeedsReview(headers),
  ]);
  const favorites = [
    ...(await favoritedAmong(
      headers,
      [...lists.recent, ...lists.mostUsed].map((entry) => entry.id),
    )),
  ];
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <HomeView
        lists={lists}
        favorites={favorites}
        isRoot={user.role === "root"}
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
